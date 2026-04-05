"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { 
  History, Search, Filter, Calendar, 
  Trash2, Eye, Download, Edit2, 
  ChevronRight, ArrowUpDown, MoreVertical,
  FileImage, Award, Loader2
} from "lucide-react";
import { format } from "date-fns";
import { CertificateRecord } from "@/components/History/types";
import { HistoryPreviewModal } from "@/components/History/HistoryPreviewModal";
import { HistoryEditModal } from "@/components/History/HistoryEditModal";
import type { Template } from "@/types";

import { HistoryTemplateCard } from "@/components/History/HistoryTemplateCard";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";

export default function HistoryPage() {
  const [step, setStep] = useState<'select' | 'history'>('select');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [records, setRecords] = useState<CertificateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  
  // Modals state
  const [previewRecord, setPreviewRecord] = useState<CertificateRecord | null>(null);
  const [editRecord, setEditRecord] = useState<CertificateRecord | null>(null);
  
  const supabase = useMemo(() => createClient(), []);

  // 1. Load templates
  useEffect(() => {
    async function loadTemplates() {
      const { data } = await supabase
        .from("templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (data) setTemplates(data);
    }
    loadTemplates();
  }, [supabase]);

  // 2. Load records for selected template
  const loadRecords = useCallback(async () => {
    if (!selectedTemplateId) return;
    setLoading(true);
    
    let query = supabase
      .from("certificate_records")
      .select(`
        *,
        template:templates(name, file_path, file_type)
      `)
      .eq("template_id", selectedTemplateId)
      .order("created_at", { ascending: false });

    const { data, error } = await query;
    if (data) setRecords(data as any);
    setLoading(false);
  }, [selectedTemplateId, supabase]);

  useEffect(() => {
    if (step === 'history') loadRecords();
  }, [step, loadRecords]);

  const selectedTemplate = useMemo(() => 
    templates.find(t => t.id === selectedTemplateId), 
    [templates, selectedTemplateId]
  );

  // 3. Filtering logic
  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const matchesSearch = 
        r.recipient_name.toLowerCase().includes(search.toLowerCase()) ||
        Object.values(r.dynamic_fields).some(v => v.toLowerCase().includes(search.toLowerCase()));
      
      const matchesDate = 
        (!dateRange.start || new Date(r.created_at) >= new Date(dateRange.start)) &&
        (!dateRange.end || new Date(r.created_at) <= new Date(dateRange.end));
      
      return matchesSearch && matchesDate;
    });
  }, [records, search, dateRange]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this record?")) return;
    const { error } = await supabase.from("certificate_records").delete().eq("id", id);
    if (!error) loadRecords();
  };

  const dynamicCols = useMemo(() => {
    const keys = new Set<string>();
    Array.from(new Set(records.flatMap(r => Object.keys(r.dynamic_fields || {}))))
      .filter(c => c.toLowerCase() !== '{name}' && c.toLowerCase() !== 'name')
      .forEach(k => keys.add(k));
    return Array.from(keys);
  }, [records]);

  if (step === 'select') {
    return (
      <div className="p-6 lg:p-10 max-w-7xl mx-auto animate-fade-in">
        <div className="mb-10 flex items-center justify-between">
          <div>
            <h1 className="section-title">Certificate History</h1>
            <p className="section-sub">Select a template to view its issued certificates</p>
          </div>
          <Link href="/dashboard/templates" className="btn-outline hidden sm:inline-flex">
            <Plus size={16} />
            Create Template
          </Link>
        </div>

        {templates.length === 0 ? (
          <div className="card py-20 text-center bg-ink-50/50 border-dashed border-ink-200 rounded-[40px]">
            <Award size={48} className="text-ink-200 mx-auto mb-4" />
            <h3 className="font-display text-xl text-ink-400">No templates yet</h3>
            <p className="text-ink-400 text-sm mt-2">Upload a template first to start tracking history</p>
            <Link href="/dashboard/templates" className="btn-gold mt-8 inline-flex">Go to Templates</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {templates.map(t => (
              <HistoryTemplateCard 
                key={t.id} 
                template={t} 
                supabase={supabase} 
                onClick={() => {
                  setSelectedTemplateId(t.id);
                  setStep('history');
                }}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto animate-fade-in">
      <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div className="flex items-start gap-4">
          <button 
            onClick={() => setStep('select')}
            className="mt-1 p-2 bg-white border border-ink-100 rounded-xl hover:bg-ink-50 transition-colors shadow-low"
            aria-label="Back to selection"
          >
            <ArrowLeft size={18} className="text-ink-500" />
          </button>
          <div className="min-w-0">
            <h1 className="section-title truncate">{selectedTemplate?.name}</h1>
            <p className="section-sub flex items-center gap-2">
              <Award size={14} className="text-accent-gold" />
              Viewing issued certificates for this template
            </p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          {records.length > 0 && (
            <Link 
              href={`/dashboard/generate/?templateId=${selectedTemplateId}`}
              className="btn-gold"
            >
              <Plus size={16} />
              Generate
            </Link>
          )}
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" size={16} />
            <input 
              className="input pl-10 bg-white"
              placeholder="Search by name or data..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card p-24 text-center items-center justify-center flex bg-white/50 backdrop-blur-sm rounded-[40px]">
            <Loader2 size={32} className="text-accent-gold animate-spin" />
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="card py-24 text-center bg-ink-50/50 border-dashed border-ink-200 rounded-[40px]">
          <History size={48} className="text-ink-200 mx-auto mb-4" />
          <h3 className="font-display text-xl text-ink-400">No records found</h3>
          <p className="text-ink-400 text-sm mt-2">You haven't generated any certificates with this template yet</p>
          <Link 
            href={`/dashboard/generate/?templateId=${selectedTemplateId}`}
            className="btn-gold mt-8"
          >
            <Plus size={18} />
            Generate Your First Certificate
          </Link>
        </div>
      ) : (
        <div className="card-ink overflow-hidden bg-white shadow-high border-ink-100 rounded-[32px]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead className="bg-parchment-50 border-b border-ink-100">
                <tr>
                  <th className="px-8 py-5 text-[11px] font-bold text-ink-400 uppercase tracking-widest">Recipient Name</th>
                  {dynamicCols.map(col => (
                    <th key={col} className="px-8 py-4 text-left text-[10px] font-bold text-ink-400 uppercase tracking-widest whitespace-nowrap">
                      {col.startsWith('{') && col.endsWith('}') ? col : col.replace(/[{}]/g, '')}
                    </th>
                  ))}
                  <th className="px-8 py-5 text-[11px] font-bold text-ink-400 uppercase tracking-widest whitespace-nowrap">Generated Date</th>
                  <th className="px-8 py-5 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {filteredRecords.map(r => (
                  <tr key={r.id} className="group hover:bg-parchment-50 transition-colors cursor-default">
                    <td className="px-8 py-5">
                      <div className="font-medium text-ink-900 text-sm">{r.recipient_name}</div>
                    </td>
                    {dynamicCols.map(col => (
                      <td key={col} className="px-8 py-5">
                        <span className="text-[13px] text-ink-600 truncate max-w-[150px] inline-block font-medium">
                          {r.dynamic_fields[col] || "—"}
                        </span>
                      </td>
                    ))}
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2.5 text-ink-500 text-[13px]">
                        <Calendar size={14} className="text-ink-200" />
                        {format(new Date(r.created_at), "MMM d, yyyy")}
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex items-center justify-end gap-3 translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                        <button onClick={() => setPreviewRecord(r)} className="p-2.5 text-ink-400 hover:text-accent-gold hover:bg-accent-gold/5 rounded-xl transition-all" title="Preview High Quality">
                          <Eye size={18} />
                        </button>
                        <button onClick={() => setEditRecord(r)} className="p-2.5 text-ink-400 hover:text-ink-900 hover:bg-ink-50 rounded-xl transition-all" title="Edit Recipient Data">
                          <Edit2 size={18} />
                        </button>
                        <button onClick={() => handleDelete(r.id)} className="p-2.5 text-ink-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all" title="Delete record permanent">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {previewRecord && (
        <HistoryPreviewModal record={previewRecord} onClose={() => setPreviewRecord(null)} />
      )}
      {editRecord && (
        <HistoryEditModal record={editRecord} onClose={() => setEditRecord(null)} onUpdate={loadRecords} />
      )}
    </div>
  );
}
