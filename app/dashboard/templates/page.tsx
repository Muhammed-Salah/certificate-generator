'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Template } from '@/types';
import { Upload, Pencil, Trash2, Settings2, FileImage, Check, X } from 'lucide-react';
import { useDropzone } from 'react-dropzone';

export default function TemplatesPage() {
  const [templates, setTemplates]     = useState<Template[]>([]);
  const [loading, setLoading]         = useState(true);
  const [uploading, setUploading]     = useState(false);
  const [error, setError]             = useState('');
  const [renamingId, setRenamingId]   = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const router   = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: dbErr } = await supabase
      .from('templates')
      .select('*')
      .order('created_at', { ascending: false });
    if (!dbErr && data) setTemplates(data as Template[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setUploading(true); setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (file.size > 5 * 1024 * 1024) throw new Error('File size exceeds 5MB limit');

      const ext      = file.name.split('.').pop()?.toLowerCase();
      const type     = ext === 'pdf' ? 'pdf' : 'png';
      const safeName = file.name.replace(/\s/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
      const path     = `${user.id}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('templates').upload(path, file, { cacheControl: '3600', upsert: false });
      if (uploadError) throw uploadError;

      const dims = await getFileDimensions(file);
      const width = dims.width;
      const height = dims.height;

      const { data: insertData, error: dbError } = await supabase.from('templates').insert({
        name: file.name.replace(/\.[^/.]+$/, ''),
        file_path: path, file_type: type,
        width, height, user_id: user.id,
      }).select().single();
      if (dbError) throw dbError;
      
      if (insertData) {
        router.push(`/dashboard/templates/${insertData.id}/configure`);
      } else {
        await load();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [supabase, load]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept:   { 'image/png': ['.png'], 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    multiple: false,
    maxSize:  5242880, // 5MB
    onDrop:   handleUpload,
    onDropRejected: (rejections) => {
      const errorObj = rejections[0]?.errors[0];
      let msg = errorObj?.message || 'File rejected';
      if (errorObj?.code === 'file-too-large') {
        msg = 'File is too large. Max size is 5 MB';
      }
      setError(msg);
    }
  });

  const handleDelete = useCallback(async (template: Template) => {
    if (!confirm(`Delete "${template.name}"? This cannot be undone.`)) return;
    await supabase.storage.from('templates').remove([template.file_path]);
    await supabase.from('templates').delete().eq('id', template.id);
    await supabase.from('template_configs').delete().eq('template_id', template.id);
    await load();
  }, [supabase, load]);

  const handleRename = useCallback(async (id: string) => {
    if (!renameValue.trim()) return;
    await supabase.from('templates').update({ name: renameValue.trim() }).eq('id', id);
    setRenamingId(null); setRenameValue('');
    await load();
  }, [renameValue, supabase, load]);

  async function getFileDimensions(file: File): Promise<{ width: number; height: number }> {
    const url = URL.createObjectURL(file);
    try {
      if (file.type === 'application/pdf') {
        const { loadPdfPageBitmap } = await import('@/lib/certGen');
        const { width, height } = await loadPdfPageBitmap(url);
        return { width, height };
      } else {
        return new Promise(res => {
          const img = new Image();
          img.onload  = () => { res({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
          img.onerror = () => { res({ width: 1920, height: 1080 }); URL.revokeObjectURL(url); };
          img.src = url;
        });
      }
    } catch (e) {
      console.error(e);
      return { width: 1920, height: 1080 };
    } finally {
      if (file.type === 'application/pdf') URL.revokeObjectURL(url);
    }
  }

  const getPublicUrl = useCallback((path: string) => {
    const { data } = supabase.storage.from('templates').getPublicUrl(path);
    return data.publicUrl;
  }, [supabase]);

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="section-title">Templates</h1>
        <p className="section-sub">Upload and manage your certificate templates</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-2">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="flex-shrink-0 text-red-400 hover:text-red-600"><X size={14}/></button>
        </div>
      )}

      {/* Dropzone */}
      <div {...getRootProps()}
           className={`mb-8 border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-200 ${
             isDragActive ? 'border-accent-gold bg-accent-gold/5' : 'border-ink-200 hover:border-ink-300 hover:bg-parchment-50'
           }`}>
        <input {...getInputProps()} />
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <svg className="animate-spin w-8 h-8 text-accent-gold" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            <p className="text-ink-600 text-sm font-medium">Uploading template…</p>
          </div>
        ) : (
          <>
            <div className="w-12 h-12 bg-ink-100 rounded-xl flex items-center justify-center mx-auto mb-4">
              <Upload size={22} className="text-ink-500" />
            </div>
            <p className="text-ink-700 font-medium mb-1">
              {isDragActive ? 'Drop your template here' : 'Drop template here or click to browse'}
            </p>
            <p className="text-ink-400 text-sm">PNG (max resolution) or PDF · Max 5 MB</p>
          </>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="shimmer h-40 rounded-lg mb-3" />
              <div className="shimmer h-4 w-3/4 rounded mb-2" />
              <div className="shimmer h-3 w-1/2 rounded" />
            </div>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-20">
          <FileImage size={40} className="text-ink-200 mx-auto mb-4" />
          <h3 className="font-display text-xl text-ink-400 mb-2">No templates yet</h3>
          <p className="text-ink-400 text-sm">Upload your first certificate template above</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(t => (
            <div key={t.id} className="card group hover:shadow-medium transition-all duration-200">
              <div className="relative bg-ink-50 rounded-t-xl overflow-hidden h-44">
                <TemplatePreview template={t} getPublicUrl={getPublicUrl} />
              </div>
              <div className="p-4">
                {renamingId === t.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      className="input flex-1 py-1.5 text-sm"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter')  handleRename(t.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      autoFocus
                    />
                    <button onClick={() => handleRename(t.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded"><Check size={14}/></button>
                    <button onClick={() => setRenamingId(null)} className="p-1.5 text-ink-400 hover:bg-ink-50 rounded"><X size={14}/></button>
                  </div>
                ) : (
                  <h3 className="font-medium text-ink-800 text-sm truncate">{t.name}</h3>
                )}
                <p className="text-xs text-ink-400 mt-1">{t.file_type.toUpperCase()} · {t.width}×{t.height}</p>
                <div className="flex items-center gap-1 mt-3">
                  <button onClick={() => router.push(`/dashboard/templates/${t.id}/configure`)}
                          className="flex-1 btn-secondary py-1.5 text-xs justify-center">
                    <Settings2 size={13}/> Configure
                  </button>
                  <button onClick={() => { setRenamingId(t.id); setRenameValue(t.name); }}
                          className="p-2 text-ink-400 hover:text-ink-700 hover:bg-ink-50 rounded-lg transition-colors" title="Rename">
                    <Pencil size={14}/>
                  </button>
                  <button onClick={() => handleDelete(t)}
                          className="p-2 text-ink-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                    <Trash2 size={14}/>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplatePreview({ template, getPublicUrl }: { template: Template, getPublicUrl: (p: string) => string }) {
  const [url, setUrl] = useState<string | null>(template.file_type === 'png' ? getPublicUrl(template.file_path) : null);
  const [loading, setLoading] = useState(template.file_type === 'pdf');

  useEffect(() => {
    if (template.file_type === 'pdf') {
       const cacheKey = `thumb-pdf-${template.id}`;
       const cached = typeof window !== 'undefined' ? localStorage.getItem(cacheKey) : null;
       if (cached) {
         setUrl(cached);
         setLoading(false);
         return;
       }

       (async () => {
         try {
           const { loadPdfPageBitmap } = await import('@/lib/certGen');
           const { bitmap } = await loadPdfPageBitmap(getPublicUrl(template.file_path));
           const canvas = document.createElement('canvas');
           canvas.width = bitmap.width; canvas.height = bitmap.height;
           const ctx = canvas.getContext('2d');
           if (ctx) ctx.drawImage(bitmap, 0, 0);
           const dataUrl = canvas.toDataURL('image/jpeg', 0.5); // JPG at 0.5 is much smaller than PNG for thumbs
           setUrl(dataUrl);
           try { localStorage.setItem(cacheKey, dataUrl); } catch(e) { console.warn('Cache full', e); }
         } catch (e) {
           console.error(e);
         } finally {
           setLoading(false);
         }
       })();
    }
  }, [template, getPublicUrl]);

  if (loading) {
     return (
       <div className="w-full h-full flex flex-col items-center justify-center gap-2">
         <div className="animate-spin w-5 h-5 border-2 border-ink-200 border-t-accent-gold rounded-full" />
         <span className="text-[10px] text-ink-400 uppercase tracking-widest font-bold">Rendering</span>
       </div>
     );
  }

  if (!url) {
     return (
       <div className="w-full h-full flex flex-col items-center justify-center gap-2">
         <FileImage size={32} className="text-ink-300" />
         <span className="text-xs text-ink-400 font-medium">No Preview</span>
       </div>
     );
  }

  /* eslint-disable-next-line @next/next/no-img-element */
  return <img src={url} alt={template.name} className="w-full h-full object-cover" />;
}
