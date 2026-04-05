"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, Download, Loader2, FileImage, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CertificateRecord } from "./types";
import { renderCertificate, triggerDownload, renderFidelityPdf } from "@/lib/certGen";
import { normalizePlaceholderData } from "@/lib/placeholderUtils";

interface Props {
  record: CertificateRecord;
  onClose: () => void;
}

export function HistoryPreviewModal({ record, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFormats, setShowFormats] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [vData, setVData] = useState<any>(null);
  const [tData, setTData] = useState<any>(null);
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);

        // 1. Fetch template and config version if not already present
        // (In a real app, we'd join these in the initial query, but let's be safe)
        const { data: valData, error: vErr } = await supabase
          .from("template_config_versions")
          .select("*")
          .eq("id", record.config_version_id)
          .single();
        if (vErr) throw vErr;
        setVData(valData);

        const { data: templData, error: tErr } = await supabase
          .from("templates")
          .select("*")
          .eq("id", record.template_id)
          .single();
        if (tErr) throw tErr;
        setTData(templData);

        if (cancelled) return;

        // 2. Get signed URL for template
        const { data: sData } = await supabase.storage
          .from("templates")
          .createSignedUrl(templData.file_path, 3600);
        if (!sData) throw new Error("Could not access template file");

        // 3. Render
        const templateImageBitmap = await getImageBitmap(sData.signedUrl, templData.file_type);
        
        const config = valData.config_snapshot;
        const customFieldsData: Record<string, string> = {};
        if (config.additional_fields) {
          config.additional_fields.forEach((f: any) => {
            customFieldsData[f.id] = record.dynamic_fields[f.label] || f.content || f.label;
          });
        }

        const canvas = await renderCertificate({
          name: record.recipient_name,
          descriptionHtml: config.desc_override || config.description_field?.content || "",
          placeholdersData: record.dynamic_fields,
          customFieldsData,
          template: templData,
          config: config,
          templateImageBitmap,
          scale: 1,
        });

        if (!cancelled) {
          setPreviewUrl(canvas.toDataURL("image/png"));
          setLoading(false);
        }
      } catch (err: any) {
        console.error("Preview failed:", err);
        if (!cancelled) {
          setError(err.message || "Failed to generate preview");
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [record, supabase]);

  async function getImageBitmap(url: string, type: string): Promise<ImageBitmap> {
    if (type === "pdf") {
      const { loadPdfPageBitmap } = await import("@/lib/certGen");
      const { bitmap } = await loadPdfPageBitmap(url);
      return bitmap;
    } else {
      const { loadImageBitmap } = await import("@/lib/certGen");
      return await loadImageBitmap(url);
    }
  }

  const handleDownloadPng = async () => {
    if (!previewUrl) return;
    const blob = await (await fetch(previewUrl)).blob();
    triggerDownload(blob, `${record.recipient_name.replace(/\s+/g, '_')}.png`);
  };

  const handleDownloadPdf = async () => {
    if (!vData || !tData) return;
    try {
      setDownloadingPdf(true);
      const config = vData.config_snapshot;
      const { renderCertificate, canvasToPdfBlob } = await import("@/lib/certGen");
      const { data: sData } = await supabase.storage.from("templates").createSignedUrl(tData.file_path, 3600);
      if (!sData) throw new Error("Could not access template file");
      
      const imgBitmap = await getImageBitmap(sData.signedUrl, tData.file_type);

      const customFieldsData: Record<string, string> = {};
      if (config.additional_fields) {
        config.additional_fields.forEach((f: any) => {
          customFieldsData[f.id] = record.dynamic_fields[f.label] || f.content || f.label;
        });
      }

      const canvas = await renderCertificate({
         name: record.recipient_name,
         descriptionHtml: config.desc_override || config.description_field?.content || "",
         placeholdersData: record.dynamic_fields,
         customFieldsData,
         template: tData,
         config,
         templateImageBitmap: imgBitmap,
         scale: 1.0,
      });

      const blob = await canvasToPdfBlob(canvas, record.recipient_name);
      triggerDownload(blob, `${record.recipient_name.replace(/\s+/g, '_')}.pdf`);
    } catch (err: any) {
      console.error("PDF Export failed:", err);
      alert("Failed to export PDF. Please try PNG.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-ink-900/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget && !showFormats) onClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col animate-scale-up">
        <div className="px-6 py-4 border-b border-ink-100 flex items-center justify-between bg-parchment-50">
          <div>
            <h3 className="font-display text-lg text-ink-900">Certificate Preview</h3>
            <p className="text-xs text-ink-500">Recipient: {record.recipient_name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-ink-100 rounded-full transition-colors">
            <X size={20} className="text-ink-400" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-8 flex items-center justify-center bg-ink-50 relative min-h-[400px]">
          {loading ? (
            <div className="flex flex-col items-center gap-4">
              <Loader2 size={32} className="text-accent-gold animate-spin" />
              <p className="text-ink-500 text-sm font-medium">Generating premium preview...</p>
            </div>
          ) : error ? (
            <div className="text-center">
              <X size={48} className="text-red-300 mx-auto mb-4" />
              <p className="text-red-600 font-medium">{error}</p>
              <button onClick={() => window.location.reload()} className="mt-4 text-sm text-ink-500 underline">Try again</button>
            </div>
          ) : (
            <div className="relative group">
              <img src={previewUrl!} alt="Preview" className="max-w-full h-auto shadow-2xl rounded-sm border border-ink-200" />
              <div className="absolute inset-0 bg-ink-900/0 group-hover:bg-ink-900/5 transition-colors pointer-events-none" />
            </div>
          )}
        </div>

        <div className="px-8 py-6 border-t border-ink-100 flex items-center justify-between bg-white">
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="btn-outline px-8 rounded-2xl">
              Close
            </button>
            <button 
              disabled={loading || !!error}
              onClick={() => setShowFormats(true)}
              className="btn-gold px-12 gap-2 rounded-2xl"
            >
              <Download size={18} />
              Export
            </button>
          </div>
        </div>

        {/* Export Selection Modal Overlay */}
        {showFormats && (
          <div 
            className="absolute inset-0 z-[60] bg-ink-900/40 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in"
            onClick={(e) => { if (e.target === e.currentTarget) setShowFormats(false); }}
          >
            <div className="bg-white rounded-[40px] shadow-2xl p-10 max-w-sm w-full animate-scale-up border border-parchment-200">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-accent-gold/10 rounded-3xl flex items-center justify-center text-accent-gold mx-auto mb-4">
                  <Download size={32} />
                </div>
                <h3 className="font-display text-2xl text-ink-900 mb-2">Export Certificate</h3>
                <p className="text-ink-500 text-sm">Choose your preferred format for the high-fidelity render.</p>
              </div>
              
              <div className="space-y-3">
                <button 
                  onClick={handleDownloadPng}
                  className="w-full btn-outline py-4 justify-center gap-3 text-sm font-bold border-2 hover:bg-parchment-50"
                  disabled={loading || !!error}
                >
                  <FileImage size={20} />
                  Download as PNG
                </button>
                <button 
                  onClick={handleDownloadPdf}
                  className="w-full btn-outline py-4 justify-center gap-3 text-sm font-bold border-2 hover:bg-parchment-50"
                  disabled={loading || !!error || downloadingPdf}
                >
                  {downloadingPdf ? <Loader2 size={20} className="animate-spin" /> : <FileText size={20} />}
                  Download as PDF
                </button>
                <button 
                  onClick={() => setShowFormats(false)}
                  className="w-full py-3 text-ink-400 hover:text-ink-900 text-xs font-bold uppercase tracking-widest transition-colors mt-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
