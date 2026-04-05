"use client";

import React, { useState, useEffect } from "react";
import { FileImage, Loader2, ChevronRight } from "lucide-react";
import type { Template } from "@/types";

interface Props {
  template: Template;
  supabase: any;
  onClick: () => void;
}

export function HistoryTemplateCard({ template, supabase, onClick }: Props) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = `thumb-${template.id}`;
    
    // Check cache
    const cached = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null;
    if (cached) {
      setThumbUrl(cached);
      setLoading(false);
      return;
    }

    // Generate thumbnail
    async function load() {
      try {
        const { data } = await supabase.storage.from('templates').createSignedUrl(template.file_path, 3600);
        if (!data || cancelled) return;
        
        let bitmap: ImageBitmap;
        if (template.file_type === 'pdf') {
          const { loadPdfPageBitmap } = await import('@/lib/certGen');
          const res = await loadPdfPageBitmap(data.signedUrl);
          bitmap = res.bitmap;
        } else {
          const { loadImageBitmap } = await import('@/lib/certGen');
          bitmap = await loadImageBitmap(data.signedUrl);
        }

        if (cancelled) return;

        const canv = document.createElement('canvas');
        const max = 400;
        let w = bitmap.width;
        let h = bitmap.height;
        if (w > h) { h = (h / w) * max; w = max; } else { w = (w / h) * max; h = max; }
        canv.width = w; canv.height = h;
        const ctx = canv.getContext('2d');
        if (ctx) ctx.drawImage(bitmap, 0, 0, w, h);
        
        const dataUrl = canv.toDataURL('image/png');
        if (!cancelled) {
          setThumbUrl(dataUrl);
          localStorage.setItem(cacheKey, dataUrl);
          setLoading(false);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [template, supabase]);

  return (
    <button 
      onClick={onClick}
      className="group bg-white rounded-3xl border border-ink-100 p-3 text-left transition-all hover:border-accent-gold hover:shadow-xl hover:shadow-accent-gold/5 active:scale-[0.98] outline-none"
    >
      <div className="relative aspect-[3/2] rounded-2xl overflow-hidden bg-ink-50 mb-4 border border-ink-50 group-hover:border-accent-gold/20">
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 size={24} className="text-ink-200 animate-spin" />
          </div>
        ) : thumbUrl ? (
          <img src={thumbUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-ink-300">
            <FileImage size={32} />
          </div>
        )}
        <div className="absolute inset-0 bg-ink-900/0 group-hover:bg-ink-900/5 transition-colors" />
      </div>

      <div className="px-2 pb-2 flex items-center justify-between">
        <div>
          <h3 className="font-display text-sm font-bold text-ink-900 group-hover:text-accent-gold transition-colors">{template.name}</h3>
          <p className="text-[10px] text-ink-400 uppercase tracking-widest mt-0.5">{template.file_type}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-ink-50 flex items-center justify-center text-ink-300 group-hover:bg-accent-gold group-hover:text-ink-900 transition-all">
          <ChevronRight size={16} />
        </div>
      </div>
    </button>
  );
}
