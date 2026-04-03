'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Template, TemplateConfig, FontRecord } from '@/types';
import {
  renderCertificate, loadImageBitmap, loadPdfPageBitmap,
  canvasToPngBlob, canvasToPdfBlob, canvasesToMergedPdf, blobsToZip, triggerDownload,
} from '@/lib/certGen';
import {
  Award, ChevronRight, Upload, Eye, Download, FileText, FileImage,
  Users, Trash2, ChevronLeft, PackageOpen, Layers, X,
} from 'lucide-react';
import Papa from 'papaparse';

type Step      = 'select' | 'names' | 'generate';
type OutFormat = 'png' | 'pdf';
type BulkFmt   = 'zip' | 'merged-pdf';

export default function GeneratePage() {
  const supabase = useMemo(() => createClient(), []);

  /* ─── Data ─── */
  const [templates, setTemplates] = useState<Template[]>([]);
  const [fonts, setFonts]         = useState<FontRecord[]>([]);
  const [loading, setLoading]     = useState(true);

  /* ─── Wizard ─── */
  const [step, setStep]         = useState<Step>('select');
  const [selected, setSelected] = useState<Template | null>(null);
  const [config, setConfig]     = useState<TemplateConfig | null>(null);

  /* ─── Names ─── */
  const [names, setNames]             = useState<Record<string, string>[]>([{ Name: '' }]);
  const [descOverride, setDescOverride] = useState('');

  /* ─── Output ─── */
  const [outFormat, setOutFormat] = useState<OutFormat>('pdf');
  const [bulkFmt, setBulkFmt]     = useState<BulkFmt>('zip');

  /* ─── Preview ─── */
  const [previewIdx, setPreviewIdx]       = useState(0);
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  
  const [focusNew, setFocusNew] = useState(false);

  /* ─── Generation ─── */
  const [generating, setGenerating]   = useState(false);
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0 });
  const [isGenerated, setIsGenerated] = useState(false);
  const [error, setError]             = useState('');

  /* ─── Bitmap cache ─── */
  const bitmapRef   = useRef<ImageBitmap | null>(null);
  const bitmapTplId = useRef<string>('');

  /* ─── Load templates & fonts ─── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: tpls }, { data: fnts }] = await Promise.all([
        supabase.from('templates').select('*, template_configs(*)').order('created_at', { ascending: false }),
        supabase.from('fonts').select('*').order('name'),
      ]);
      if (cancelled) return;
      if (tpls) {
        const enriched = (tpls as Record<string, unknown>[]).map(t => ({
          ...t,
          config: Array.isArray(t.template_configs) && t.template_configs.length > 0
            ? t.template_configs[0]
            : (!Array.isArray(t.template_configs) && t.template_configs ? t.template_configs : undefined),
        })) as Template[];
        setTemplates(enriched);
      }
      if (fnts) setFonts(fnts as FontRecord[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  /* ─── Inject custom fonts ─── */
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

  /* ─── Bitmap loader (cached) ─── */
  const getBitmap = useCallback(async (t: Template): Promise<ImageBitmap> => {
    if (bitmapTplId.current === t.id && bitmapRef.current) return bitmapRef.current;
    
    // Check localStorage cache first for PDFs (instant load)
    if (t.file_type === 'pdf') {
      const cached = typeof window !== 'undefined' ? localStorage.getItem(`thumb-pdf-${t.id}`) : null;
      if (cached) {
        const res = await fetch(cached);
        const blob = await res.blob();
        const bitmap = await createImageBitmap(blob);
        bitmapRef.current = bitmap;
        bitmapTplId.current = t.id;
        return bitmap;
      }
    }

    const { data } = supabase.storage.from('templates').getPublicUrl(t.file_path);
    let bitmap: ImageBitmap;
    if (t.file_type === 'pdf') {
      const res = await loadPdfPageBitmap(data.publicUrl);
      bitmap = res.bitmap;
    } else {
      bitmap = await loadImageBitmap(data.publicUrl);
    }
    bitmapRef.current   = bitmap;
    bitmapTplId.current = t.id;
    return bitmap;
  }, [supabase]);

  /* ─── Render preview ─── */
  const renderPreview = useCallback(async () => {
    if (!selected || !config) return;
    const row = names[previewIdx] || { Name: '' };
    const name = row?.Name?.trim() || 'Recipient Name';
    
    // Only show loader if we don't have the bitmap cached yet
    const needsBitmap = bitmapTplId.current !== selected.id || !bitmapRef.current;
    if (needsBitmap) setPreviewLoading(true);

    try {
      const bitmap = await getBitmap(selected);
      const customFieldsData: Record<string, string> = {};
      if (config.additional_fields) {
        for (const f of config.additional_fields) {
          customFieldsData[f.id] = row[f.label]?.trim() || f.content || f.label;
        }
      }

      const canvas = await renderCertificate({
        name,
        descriptionHtml: descOverride || config.description_field?.content || '',
        customFieldsData,
        template: selected, config,
        templateImageBitmap: bitmap,
        scale: 1,
      });
      setPreviewDataUrl(canvas.toDataURL('image/png'));
    } catch (e) {
      console.error('Preview error:', e);
      setPreviewDataUrl('');
    }
    setPreviewLoading(false);
  }, [selected, config, names, previewIdx, descOverride, getBitmap]);

  useEffect(() => {
    if (step === 'names') renderPreview();
  }, [step, previewIdx, renderPreview, names, descOverride]);

  useEffect(() => {
    const hasData = ((names.length > 1 || names[0].Name?.trim() !== '') || !!descOverride) && !isGenerated;
    window.__unsavedChanges = hasData;
    const h = (e: BeforeUnloadEvent) => { if (window.__unsavedChanges) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => { window.removeEventListener('beforeunload', h); window.__unsavedChanges = false; };
  }, [names, descOverride, isGenerated]);

  /* ─── Reset generation state on change ─── */
  useEffect(() => {
    setIsGenerated(false);
  }, [names, descOverride]);

  /* ─── Select template ─── */
  const handleSelectTemplate = useCallback(async (t: Template) => {
    setSelected(t);
    const { data } = await supabase
      .from('template_configs')
      .select('*')
      .eq('template_id', t.id)
      .maybeSingle();
    setConfig(data as TemplateConfig | null);
    if (data && (data as TemplateConfig).description_field) {
      setDescOverride((data as TemplateConfig).description_field?.content || '');
    }
  }, [supabase]);

  /* ─── CSV upload ─── */
  const downloadTemplateCsv = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const cols = ['Name', ...(config?.additional_fields?.map(f => f.label) || [])];
    const header = cols.join(',');
    const sample = cols.map(c => c === 'Name' ? 'John Doe' : `Sample ${c}`).join(',');
    const blob = new Blob([header + '\n' + sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'certificate-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [config]);

  const handleCsvUpload = useCallback((file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: res => {
        const nameKey = res.meta.fields?.find(f => f.toLowerCase() === 'name');
        if (!nameKey) {
            alert('Your CSV must contain a "Name" column header.');
            return;
        }
        
        const parsed = res.data.map(row => {
           const out: Record<string, string> = { Name: String(row[nameKey] || '') };
           for (const f of config?.additional_fields || []) {
               const col = res.meta.fields?.find(m => m.toLowerCase() === f.label.toLowerCase());
               if (col) out[f.label] = String(row[col] || '');
           }
           return out;
        }).filter(r => r.Name && String(r.Name).trim());
        
        if (parsed.length > 0) {
          setNames(parsed);
          setPreviewIdx(0);
        } else {
            alert('No valid names found in the uploaded file.');
        }
      },
    });
  }, [config]);

  /* ─── Generate ─── */
  const handleGenerate = useCallback(async () => {
    if (!selected || !config) return;
    setGenerating(true); setError('');
    const valid = names.filter(n => n.Name?.trim());
    setGenProgress({ done: 0, total: valid.length });

    try {
      const bitmap = await getBitmap(selected);

      if (valid.length === 1) {
        const customFieldsData: Record<string, string> = {};
        if (config.additional_fields) {
          for (const f of config.additional_fields) { customFieldsData[f.id] = valid[0][f.label] || ''; }
        }

        const canvas = await renderCertificate({
          name: valid[0].Name, descriptionHtml: descOverride,
          customFieldsData,
          template: selected, config, templateImageBitmap: bitmap, scale: 1,
        });
        const safeName = valid[0].Name.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s/g, '_');
        if (outFormat === 'png') {
          triggerDownload(await canvasToPngBlob(canvas), `${safeName}.png`);
        } else {
          triggerDownload(await canvasToPdfBlob(canvas, valid[0].Name), `${safeName}.pdf`);
        }
        setGenProgress({ done: 1, total: 1 });
        setIsGenerated(true);
      } else {
        const canvases: HTMLCanvasElement[] = [];
        const entries:  { name: string; blob: Blob }[] = [];

        for (let i = 0; i < valid.length; i++) {
          const customFieldsData: Record<string, string> = {};
          if (config.additional_fields) {
            for (const f of config.additional_fields) { customFieldsData[f.id] = valid[i][f.label] || ''; }
          }
          const canvas = await renderCertificate({
            name: valid[i].Name, descriptionHtml: descOverride,
            customFieldsData,
            template: selected, config, templateImageBitmap: bitmap, scale: 1,
          });
          canvases.push(canvas);

          if (bulkFmt === 'zip') {
            const blob = outFormat === 'png'
              ? await canvasToPngBlob(canvas)
              : await canvasToPdfBlob(canvas, valid[i].Name);
            const safeName = valid[i].Name.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s/g, '_');
            entries.push({ name: `${safeName}.${outFormat}`, blob });
          }
          setGenProgress({ done: i + 1, total: valid.length });
          await new Promise(r => setTimeout(r, 0));
        }

        if (bulkFmt === 'zip') {
          await blobsToZip(entries, 'certificates.zip');
        } else {
          triggerDownload(await canvasesToMergedPdf(canvases), 'certificates-merged.pdf');
        }
        setIsGenerated(true);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  }, [selected, config, names, outFormat, bulkFmt, descOverride, getBitmap]);

  /* ─── Helpers ─── */
  const validNames = useMemo(() => names.filter(n => n.Name?.trim()), [names]);

  const getThumb = useCallback((t: Template) => {
    if (t.file_type !== 'png') return null;
    const { data } = supabase.storage.from('templates').getPublicUrl(t.file_path);
    return data.publicUrl;
  }, [supabase]);

  const STEPS = [
    { key: 'select' as Step,   label: 'Select Template' },
    { key: 'names'  as Step,   label: 'Names & Preview' },
    { key: 'generate' as Step, label: 'Output Options' },
  ];
  const stepIdx = STEPS.findIndex(s => s.key === step);

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h1 className="section-title">Generate Certificates</h1>
        <p className="section-sub">Follow the steps to create and download your certificates</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => { if (i < stepIdx) setStep(s.key); }}
              disabled={i > stepIdx}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                s.key === step      ? 'bg-ink-900 text-parchment-100'
                : i < stepIdx      ? 'bg-ink-100 text-ink-600 hover:bg-ink-200 cursor-pointer'
                : 'bg-ink-50 text-ink-300 cursor-not-allowed'
              }`}>
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                s.key === step ? 'bg-accent-gold text-ink-900'
                : i < stepIdx  ? 'bg-ink-300 text-white'
                : 'bg-ink-200 text-ink-400'
              }`}>{i + 1}</span>
              {s.label}
            </button>
            {i < STEPS.length - 1 && <ChevronRight size={14} className="text-ink-300 flex-shrink-0" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-2">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')}><X size={14} className="text-red-400"/></button>
        </div>
      )}

      {/* ══════ STEP 1: SELECT ══════ */}
      {step === 'select' && (
        <div className="animate-slide-up">
          <h2 className="font-display text-xl text-ink-800 mb-4">Choose a template</h2>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="card p-4 animate-pulse">
                  <div className="shimmer h-36 rounded-lg mb-3"/>
                  <div className="shimmer h-4 w-3/4 rounded mb-2"/>
                  <div className="shimmer h-3 w-1/2 rounded"/>
                </div>
              ))}
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-16 card">
              <Award size={40} className="text-ink-200 mx-auto mb-4"/>
              <p className="text-ink-500 text-sm">No templates found. Upload one in the Templates section.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map(t => {
                const thumb = getThumb(t);
                const isSel = selected?.id === t.id;
                return (
                  <button key={t.id} onClick={() => handleSelectTemplate(t)}
                          className={`card text-left hover:shadow-medium transition-all duration-200 overflow-hidden group ${
                            isSel ? 'ring-2 ring-accent-gold border-accent-gold/50' : ''
                          }`}>
                    <div className="h-36 bg-ink-50 relative">
                      <TemplatePreview template={t} getPublicUrl={(p) => supabase.storage.from('templates').getPublicUrl(p).data.publicUrl} />
                      {isSel && (
                        <div className="absolute inset-0 bg-accent-gold/20 flex items-center justify-center">
                          <div className="w-8 h-8 rounded-full bg-accent-gold flex items-center justify-center">
                            <span className="text-ink-900 text-sm font-bold">✓</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="font-medium text-ink-800 text-sm truncate">{t.name}</p>
                      <p className="text-xs text-ink-400">{t.file_type.toUpperCase()} · {t.width}×{t.height}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <div className="mt-6 flex items-center justify-between">
            {selected && !config && (
              <p className="text-amber-600 text-sm">This template has no configuration yet — please configure it first.</p>
            )}
            <button
              onClick={() => setStep('names')}
              disabled={!selected || !config}
              className="ml-auto btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
              Continue <ChevronRight size={16}/>
            </button>
          </div>
        </div>
      )}

      {/* ══════ STEP 2: NAMES & PREVIEW ══════ */}
      {step === 'names' && (
        <div className="animate-slide-up">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setStep('select')} className="p-2 text-ink-400 hover:text-ink-700 hover:bg-ink-50 rounded-lg transition-colors">
              <ChevronLeft size={18}/>
            </button>
            <h2 className="font-display text-xl text-ink-800">Add Names & Preview</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Data Entry */}
            <div className="lg:col-span-5 space-y-4">
              {/* Manual entry */}
              <div className="card p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Users size={16} className="text-ink-500"/>
                  <h3 className="font-medium text-ink-700 text-sm">Manual Entry</h3>
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {names.map((n, i) => (
                    <div key={i} className="flex flex-col gap-2 p-3 bg-ink-50 rounded-lg border border-ink-100">
                      <div className="flex items-center gap-2">
                        <input
                          ref={el => { if (focusNew && i === names.length - 1 && el && document.activeElement !== el) { el.focus(); setFocusNew(false); } }}
                          className="input flex-1 py-1.5 text-sm"
                          placeholder="Name (Required)"
                          value={n.Name || ''}
                          onChange={e => {
                            const next = [...names];
                            next[i] = { ...next[i], Name: e.target.value };
                            setNames(next);
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setNames(p => [...p, { Name: '' }]); setFocusNew(true); } }}
                        />
                        {names.length > 1 && (
                          <button onClick={() => {
                            const next = names.filter((_, j) => j !== i);
                            setNames(next);
                            setPreviewIdx(p => Math.min(p, next.length - 1));
                          }} className="p-1.5 text-ink-300 hover:text-red-500 rounded transition-colors bg-white hover:bg-red-50 focus:outline-none">
                            <Trash2 size={14}/>
                          </button>
                        )}
                      </div>
                      
                      {config?.additional_fields && config.additional_fields.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 mt-1">
                           {config.additional_fields.map(f => (
                             <input 
                               key={f.id}
                               className="input py-1.5 text-xs bg-white"
                               placeholder={f.label}
                               value={n[f.label] || ''}
                               onChange={e => {
                                 const next = [...names];
                                 next[i] = { ...next[i], [f.label]: e.target.value };
                                 setNames(next);
                               }}
                             />
                           ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => { setNames(p => [...p, { Name: '' }]); setFocusNew(true); }}
                        className="mt-3 text-sm text-ink-500 hover:text-ink-800 transition-colors focus:outline-none">
                  + Add another recipient
                </button>
              </div>

              {/* CSV upload */}
              <div className="card p-5 relative overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Upload size={16} className="text-ink-500"/>
                    <h3 className="font-medium text-ink-700 text-sm">CSV Upload (Bulk)</h3>
                  </div>
                  <button type="button" onClick={downloadTemplateCsv} className="text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg">
                    Download Template
                  </button>
                </div>
                <label className="block border-2 border-dashed border-ink-200 rounded-xl p-4 text-center cursor-pointer
                                 hover:border-ink-300 hover:bg-parchment-50 transition-all duration-200">
                  <Upload size={20} className="text-ink-400 mx-auto mb-2"/>
                  <p className="text-sm text-ink-600 font-medium">Drop CSV or click to browse</p>
                  <div className="text-xs text-ink-400 mt-2 flex flex-wrap items-center justify-center gap-1">
                    Columns required: <span className="font-mono text-ink-600 bg-ink-100 px-1.5 py-0.5 rounded shadow-sm">Name</span>
                    {config?.additional_fields?.map(f => (
                       <span key={f.id} className="font-mono text-ink-600 bg-ink-100 px-1.5 py-0.5 rounded shadow-sm">{f.label}</span>
                    ))}
                  </div>
                  <input type="file" accept=".csv" className="hidden"
                         onChange={e => { if (e.target.files?.[0]) handleCsvUpload(e.target.files[0]); }}/>
                </label>
                {validNames.length > 1 && (
                  <p className="mt-3 text-xs text-green-700 font-medium">✓ {validNames.length} names loaded</p>
                )}
              </div>

              {/* Description override */}
              {config?.description_field && (
                <div className="card p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText size={16} className="text-ink-500"/>
                    <h3 className="font-medium text-ink-700 text-sm">Description</h3>
                  </div>
                  <div
                    contentEditable suppressContentEditableWarning
                    className="rich-editor input rounded-lg p-3 min-h-[60px]"
                    data-placeholder="Start typing..."
                    style={{ fontFamily: config.description_field.font_family, fontSize: '14px' }}
                    onBlur={e => setDescOverride((e.target as HTMLDivElement).innerHTML)}
                    onPaste={e => {
                      e.preventDefault();
                      const text = e.clipboardData.getData('text/plain');
                      document.execCommand('insertText', false, text);
                    }}
                    dangerouslySetInnerHTML={{ __html: descOverride || '' }}
                  />
                  <div className="flex gap-1 mt-1.5">
                    {(['bold','italic','underline'] as const).map(cmd => (
                      <button key={cmd} type="button"
                              onMouseDown={e => { e.preventDefault(); document.execCommand(cmd); setDescOverride((e.target as any).parentElement.previousElementSibling.innerHTML); }}
                              className="px-2 py-1 text-xs border border-ink-200 rounded hover:bg-ink-50 text-ink-600 capitalize">
                        {cmd}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Preview */}
            <div className="lg:col-span-7 flex flex-col">
              <div ref={previewContainerRef}
                   className="relative bg-ink-100 rounded-2xl overflow-hidden flex-1 flex flex-col items-center justify-center p-4 min-h-[400px]">
                
                {validNames.length > 1 && (
                  <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-ink-500 text-sm px-3 py-2 bg-white/80 backdrop-blur rounded-lg shadow-sm z-10">
                    <span className="font-medium">{previewIdx + 1} of {validNames.length}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setPreviewIdx(i => Math.max(0, i - 1))} disabled={previewIdx === 0}
                              className="w-7 h-7 flex items-center justify-center rounded bg-white shadow-sm hover:bg-ink-50 disabled:opacity-50">
                        <ChevronLeft size={16}/>
                      </button>
                      <button onClick={() => setPreviewIdx(i => Math.min(validNames.length - 1, i + 1))} disabled={previewIdx >= validNames.length - 1}
                              className="w-7 h-7 flex items-center justify-center rounded bg-white shadow-sm hover:bg-ink-50 disabled:opacity-50">
                        <ChevronRight size={16}/>
                      </button>
                    </div>
                  </div>
                )}

                {previewLoading && !previewDataUrl ? (
                  <div className="flex flex-col items-center gap-3">
                    <svg className="animate-spin w-8 h-8 text-accent-gold" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    <p className="text-ink-500 text-sm">Rendering preview…</p>
                  </div>
                ) : previewDataUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={previewDataUrl} alt="Certificate preview"
                       className="max-w-full max-h-full object-contain shadow-strong rounded-lg transition-opacity duration-300"
                       style={{ opacity: previewLoading ? 0.6 : 1 }}/>
                ) : validNames.length === 0 ? (
                  <p className="text-ink-400">Enter a name to see preview</p>
                ) : (
                  <p className="text-ink-400">Loading preview…</p>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-between">
            <button onClick={() => setStep('select')} className="btn-secondary"><ChevronLeft size={16}/> Default Configs</button>
            <button onClick={() => setStep('generate')}
                    disabled={validNames.length === 0}
                    className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
              Configure Output <ChevronRight size={16}/>
            </button>
          </div>
        </div>
      )}

      {/* ══════ STEP 4: GENERATE ══════ */}
      {step === 'generate' && (
        <div className="animate-slide-up">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setStep('names')} className="p-2 text-ink-400 hover:text-ink-700 hover:bg-ink-50 rounded-lg transition-colors">
              <ChevronLeft size={18}/>
            </button>
            <h2 className="font-display text-xl text-ink-800">Output Options</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="card p-5">
              <h3 className="font-medium text-ink-700 text-sm mb-3">File Format</h3>
              <div className="flex gap-2">
                {(['png', 'pdf'] as OutFormat[]).map(f => (
                  <button key={f} onClick={() => setOutFormat(f)}
                          className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-all ${
                            outFormat === f ? 'border-ink-900 bg-ink-900 text-parchment-100' : 'border-ink-200 text-ink-500 hover:border-ink-300'
                          }`}>
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {validNames.length > 1 && (
              <div className="card p-5">
                <h3 className="font-medium text-ink-700 text-sm mb-3">Bulk Download</h3>
                <div className="flex gap-2">
                  {([
                    ['zip',        'ZIP Archive', PackageOpen],
                    ['merged-pdf', 'Merged PDF',  Layers],
                  ] as const).map(([v, label, Icon]) => (
                    <button key={v} onClick={() => setBulkFmt(v as BulkFmt)}
                            className={`flex-1 py-3 px-2 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${
                              bulkFmt === v ? 'border-ink-900 bg-ink-900 text-parchment-100' : 'border-ink-200 text-ink-500 hover:border-ink-300'
                            }`}>
                      <Icon size={18}/>
                      <span className="text-xs font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="card p-5 mb-6 bg-parchment-50 border-parchment-300">
            <h3 className="font-medium text-ink-700 text-sm mb-2">Summary</h3>
            <div className="space-y-1 text-sm text-ink-600">
              <p>Template: <strong className="text-ink-800">{selected?.name}</strong></p>
              <p>Certificates: <strong className="text-ink-800">{validNames.length}</strong></p>
              <p>Format: <strong className="text-ink-800">{outFormat.toUpperCase()}</strong>
                {validNames.length > 1 && <> · <strong>{bulkFmt === 'zip' ? 'ZIP archive' : 'Merged PDF'}</strong></>}
              </p>
            </div>
          </div>

          {/* Progress bar */}
          {generating && (
            <div className="card p-5 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-ink-700">Generating…</span>
                <span className="text-sm text-ink-500">{genProgress.done} / {genProgress.total}</span>
              </div>
              <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
                <div className="h-full bg-accent-gold rounded-full transition-all duration-300"
                     style={{ width: `${genProgress.total ? (genProgress.done / genProgress.total * 100) : 0}%` }}/>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep('names')} disabled={generating} className="btn-secondary">
              <ChevronLeft size={16}/> Back
            </button>
            <button onClick={handleGenerate} disabled={generating}
                    className="btn-gold font-medium px-8 py-3 text-sm disabled:opacity-60 disabled:cursor-not-allowed">
              {generating
                ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg> Generating…</>
                : <><Download size={16}/> Generate &amp; Download</>
              }
            </button>
          </div>
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
           const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
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
         <div className="animate-spin w-5 h-5 border-2 border-ink-100 border-t-accent-gold rounded-full" />
         <span className="text-[10px] text-ink-400 uppercase tracking-widest font-bold">Rendering</span>
       </div>
     );
  }

  if (!url) {
     return (
       <div className="w-full h-full flex flex-col items-center justify-center gap-2">
         <FileImage size={24} className="text-ink-300" />
       </div>
     );
  }

  /* eslint-disable-next-line @next/next/no-img-element */
  return <img src={url} alt={template.name} className="w-full h-full object-cover" />;
}
