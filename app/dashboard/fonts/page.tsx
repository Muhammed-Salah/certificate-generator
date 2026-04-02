'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { FontRecord } from '@/types';
import { useDropzone } from 'react-dropzone';
import { Upload, Trash2, Type, X } from 'lucide-react';

export default function FontsPage() {
  const [fonts, setFonts]         = useState<FontRecord[]>([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState('');
  const supabase = useMemo(() => createClient(), []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('fonts').select('*').order('name');
    if (data) setFonts(data as FontRecord[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  /* Inject fonts for preview */
  useEffect(() => {
    fonts.forEach(f => {
      const sid = `font-face-${f.id}`;
      if (document.getElementById(sid)) return;
      const { data } = supabase.storage.from('fonts').getPublicUrl(f.file_path);
      const s = document.createElement('style');
      s.id = sid;
      s.textContent = `@font-face { font-family: '${f.name}'; src: url('${data.publicUrl}'); }`;
      document.head.appendChild(s);
    });
  }, [fonts, supabase]);

  const handleUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true); setError('');
    try {
      for (const file of files) {
        const ext      = file.name.split('.').pop()?.toLowerCase() as FontRecord['format'];
        const name     = file.name.replace(/\.[^/.]+$/, '');
        const safeName = file.name.replace(/\s/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
        const path     = `${Date.now()}-${safeName}`;

        const { error: upErr } = await supabase.storage
          .from('fonts').upload(path, file, { cacheControl: '3600', upsert: false });
        if (upErr) throw upErr;

        const { error: dbErr } = await supabase.from('fonts').insert({
          name, file_path: path, format: ext,
        });
        if (dbErr) throw dbErr;
      }
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [supabase, load]);

  const handleDelete = useCallback(async (font: FontRecord) => {
    if (!confirm(`Delete font "${font.name}"? This cannot be undone.`)) return;
    await supabase.storage.from('fonts').remove([font.file_path]);
    await supabase.from('fonts').delete().eq('id', font.id);
    // Remove injected style
    const el = document.getElementById(`font-face-${font.id}`);
    if (el) el.remove();
    await load();
  }, [supabase, load]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'font/ttf':                    ['.ttf'],
      'font/otf':                    ['.otf'],
      'font/woff':                   ['.woff'],
      'font/woff2':                  ['.woff2'],
      'application/x-font-ttf':     ['.ttf'],
      'application/x-font-otf':     ['.otf'],
      'application/octet-stream':   ['.ttf', '.otf', '.woff', '.woff2'],
    },
    onDrop: handleUpload,
  });

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="section-title">Custom Fonts</h1>
        <p className="section-sub">Upload fonts that will be available across all certificate templates</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-2">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="flex-shrink-0 text-red-400 hover:text-red-600"><X size={14}/></button>
        </div>
      )}

      {/* Dropzone */}
      <div {...getRootProps()}
           className={`mb-8 border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer
                       transition-all duration-200 ${
             isDragActive ? 'border-accent-gold bg-accent-gold/5' : 'border-ink-200 hover:border-ink-300 hover:bg-parchment-50'
           }`}>
        <input {...getInputProps()}/>
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <svg className="animate-spin w-8 h-8 text-accent-gold" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <p className="text-ink-600 text-sm font-medium">Uploading font(s)…</p>
          </div>
        ) : (
          <>
            <div className="w-12 h-12 bg-ink-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Upload size={22} className="text-ink-500"/>
            </div>
            <p className="text-ink-700 font-medium mb-1">
              {isDragActive ? 'Drop fonts here' : 'Drop font files here or click to browse'}
            </p>
            <p className="text-ink-400 text-sm">Supports TTF, OTF, WOFF, WOFF2 · Multiple files at once</p>
          </>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-4 flex items-center gap-4 animate-pulse">
              <div className="shimmer w-10 h-10 rounded-lg flex-shrink-0"/>
              <div className="flex-1">
                <div className="shimmer h-4 w-1/3 rounded mb-2"/>
                <div className="shimmer h-3 w-1/4 rounded"/>
              </div>
            </div>
          ))}
        </div>
      ) : fonts.length === 0 ? (
        <div className="text-center py-20">
          <Type size={40} className="text-ink-200 mx-auto mb-4"/>
          <h3 className="font-display text-xl text-ink-400 mb-2">No custom fonts yet</h3>
          <p className="text-ink-400 text-sm">Upload fonts above to use them in your certificate templates</p>
        </div>
      ) : (
        <div className="space-y-2">
          {fonts.map(f => (
            <div key={f.id} className="card p-4 flex items-center gap-4 hover:shadow-medium transition-all duration-200">
              <div className="w-10 h-10 bg-ink-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Type size={18} className="text-ink-500"/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-ink-800 text-sm truncate" style={{ fontFamily: f.name }}>{f.name}</p>
                <p className="text-xs text-ink-400">{f.format.toUpperCase()}</p>
              </div>
              <div className="px-4 py-1.5 bg-ink-50 rounded-lg text-sm text-ink-700 hidden sm:block"
                   style={{ fontFamily: f.name }}>
                The quick brown fox jumps
              </div>
              <button onClick={() => handleDelete(f)}
                      className="p-2 text-ink-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                      title="Delete font">
                <Trash2 size={16}/>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
