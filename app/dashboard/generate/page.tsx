'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Template, TemplateConfig, FontRecord } from '@/types';
import {
  renderCertificate, loadImageBitmap, loadPdfPageBitmap,
  canvasToPngBlob, canvasToPdfBlob, canvasesToMergedPdf, blobsToZip, triggerDownload,
} from '@/lib/certGen';
import {
  Award, ChevronRight, Upload, Eye, Download, FileText,
  Users, Trash2, ChevronLeft, PackageOpen, Layers, X,
} from 'lucide-react';
import Papa from 'papaparse';

type Step      = 'select' | 'names' | 'preview' | 'generate';
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
  const [names, setNames]             = useState<string[]>(['']);
  const [descOverride, setDescOverride] = useState('');

  /* ─── Output ─── */
  const [outFormat, setOutFormat] = useState<OutFormat>('pdf');
  const [bulkFmt, setBulkFmt]     = useState<BulkFmt>('zip');

  /* ─── Preview ─── */
  const [previewIdx, setPreviewIdx]       = useState(0);
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  /* ─── Generation ─── */
  const [generating, setGenerating]   = useState(false);
  const [genProgress, setGenProgress] = useState({ done: 0, total: 0 });
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
          config: Array.isArray(t.template_configs) && (t.template_configs as unknown[]).length > 0
            ? (t.template_configs as TemplateConfig[])[0]
            : undefined,
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
    const name = names[previewIdx]?.trim();
    if (!name) return;
    setPreviewLoading(true);
    try {
      const bitmap = await getBitmap(selected);
      const canvas = await renderCertificate({
        name,
        descriptionHtml: descOverride || config.description_field?.content || '',
        template: selected, config,
        templateImageBitmap: bitmap,
        scale: 1,
      });
      setPreviewDataUrl(canvas.toDataURL('image/png'));
    } catch (e) {
      console.error('Preview error:', e);
    }
    setPreviewLoading(false);
  }, [selected, config, names, previewIdx, descOverride, getBitmap]);

  useEffect(() => {
    if (step === 'preview') renderPreview();
  }, [step, previewIdx, renderPreview]);

  /* ─── Select template ─── */
  const handleSelectTemplate = useCallback(async (t: Template) => {
    setSelected(t);
    const { data } = await supabase
      .from('template_configs')
      .select('*')
      .eq('template_id', t.id)
      .maybeSingle();
    setConfig(data as TemplateConfig | null);
  }, [supabase]);

  /* ─── CSV upload ─── */
  const handleCsvUpload = useCallback((file: File) => {
    Papa.parse<string[]>(file, {
      complete: res => {
        const parsed = res.data.flat().map(s => String(s).trim()).filter(Boolean);
        if (parsed.length > 0) setNames(parsed);
      },
    });
  }, []);

  /* ─── Generate ─── */
  const handleGenerate = useCallback(async () => {
    if (!selected || !config) return;
    setGenerating(true); setError('');
    const valid = names.filter(n => n.trim());
    setGenProgress({ done: 0, total: valid.length });

    try {
      const bitmap = await getBitmap(selected);

      if (valid.length === 1) {
        const canvas = await renderCertificate({
          name: valid[0], descriptionHtml: descOverride,
          template: selected, config, templateImageBitmap: bitmap, scale: 1,
        });
        const safeName = valid[0].replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s/g, '_');
        if (outFormat === 'png') {
          triggerDownload(await canvasToPngBlob(canvas), `${safeName}.png`);
        } else {
          triggerDownload(await canvasToPdfBlob(canvas, valid[0]), `${safeName}.pdf`);
        }
        setGenProgress({ done: 1, total: 1 });
      } else {
        const canvases: HTMLCanvasElement[] = [];
        const entries:  { name: string; blob: Blob }[] = [];

        for (let i = 0; i < valid.length; i++) {
          const canvas = await renderCertificate({
            name: valid[i], descriptionHtml: descOverride,
            template: selected, config, templateImageBitmap: bitmap, scale: 1,
          });
          canvases.push(canvas);

          if (bulkFmt === 'zip') {
            const blob = outFormat === 'png'
              ? await canvasToPngBlob(canvas)
              : await canvasToPdfBlob(canvas, valid[i]);
            const safeName = valid[i].replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s/g, '_');
            entries.push({ name: `${safeName}.${outFormat}`, blob });
          }
          setGenProgress({ done: i + 1, total: valid.length });
        }

        if (bulkFmt === 'zip') {
          await blobsToZip(entries, 'certificates.zip');
        } else {
          triggerDownload(await canvasesToMergedPdf(canvases), 'certificates-merged.pdf');
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generation failed. Please try again.');
    } finally {
      setGenerating(false);
    }
  }, [selected, config, names, outFormat, bulkFmt, descOverride, getBitmap]);

  /* ─── Helpers ─── */
  const validNames = useMemo(() => names.filter(n => n.trim()), [names]);

  const getThumb = useCallback((t: Template) => {
    if (t.file_type !== 'png') return null;
    const { data } = supabase.storage.from('templates').getPublicUrl(t.file_path);
    return data.publicUrl;
  }, [supabase]);

  const STEPS = [
    { key: 'select' as Step,   label: 'Select Template' },
    { key: 'names'  as Step,   label: 'Enter Names' },
    { key: 'preview' as Step,  label: 'Preview' },
    { key: 'generate' as Step, label: 'Generate' },
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
                      {thumb
                        /* eslint-disable-next-line @next/next/no-img-element */
                        ? <img src={thumb} alt={t.name} className="w-full h-full object-cover"/>
                        : <div className="w-full h-full flex items-center justify-center"><FileText size={28} className="text-ink-300"/></div>
                      }
                      {isSel && (
                        <div className="absolute inset-0 bg-accent-gold/20 flex items-center justify-center">
                          <div className="w-8 h-8 rounded-full bg-accent-gold flex items-center justify-center">
                            <span className="text-ink-900 text-sm font-bold">✓</span>
                          </div>
                        </div>
                      )}
                      {!t.config && (
                        <div className="absolute top-2 left-2 bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full">
                          Needs config
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

      {/* ══════ STEP 2: NAMES ══════ */}
      {step === 'names' && (
        <div className="animate-slide-up">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setStep('select')} className="p-2 text-ink-400 hover:text-ink-700 hover:bg-ink-50 rounded-lg transition-colors">
              <ChevronLeft size={18}/>
            </button>
            <h2 className="font-display text-xl text-ink-800">Enter names</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Manual entry */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users size={16} className="text-ink-500"/>
                <h3 className="font-medium text-ink-700 text-sm">Manual Entry</h3>
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {names.map((n, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      className="input flex-1 py-2"
                      placeholder={`Name ${i + 1}`}
                      value={n}
                      onChange={e => {
                        const next = [...names];
                        next[i] = e.target.value;
                        setNames(next);
                      }}
                      onKeyDown={e => { if (e.key === 'Enter') setNames(p => [...p, '']); }}
                    />
                    {names.length > 1 && (
                      <button onClick={() => setNames(p => p.filter((_, j) => j !== i))}
                              className="p-1.5 text-ink-300 hover:text-red-500 rounded transition-colors">
                        <Trash2 size={14}/>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button onClick={() => setNames(p => [...p, ''])}
                      className="mt-3 text-sm text-ink-500 hover:text-ink-800 transition-colors">
                + Add another name
              </button>
            </div>

            {/* CSV upload */}
            <div className="card p-5">
              <div className="flex items-center gap-2 mb-4">
                <Upload size={16} className="text-ink-500"/>
                <h3 className="font-medium text-ink-700 text-sm">CSV Upload (Bulk)</h3>
              </div>
              <label className="block border-2 border-dashed border-ink-200 rounded-xl p-6 text-center cursor-pointer
                               hover:border-ink-300 hover:bg-parchment-50 transition-all duration-200">
                <Upload size={24} className="text-ink-400 mx-auto mb-2"/>
                <p className="text-sm text-ink-600 font-medium">Drop CSV or click to browse</p>
                <p className="text-xs text-ink-400 mt-1">One name per row — no header needed</p>
                <input type="file" accept=".csv" className="hidden"
                       onChange={e => { if (e.target.files?.[0]) handleCsvUpload(e.target.files[0]); }}/>
              </label>
              {validNames.length > 1 && (
                <p className="mt-3 text-xs text-green-700 font-medium">✓ {validNames.length} names loaded</p>
              )}
            </div>
          </div>

          {/* Description override */}
          {config?.description_field && (
            <div className="card p-5 mt-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={16} className="text-ink-500"/>
                <h3 className="font-medium text-ink-700 text-sm">Description override <span className="text-ink-400 font-normal">(optional — leave blank to use template default)</span></h3>
              </div>
              <div
                contentEditable suppressContentEditableWarning
                className="rich-editor input rounded-lg p-3 min-h-[60px]"
                data-placeholder="Leave blank to use template default…"
                style={{ fontFamily: config.description_field.font_family, fontSize: Math.min(config.description_field.font_size * 0.7, 16) }}
                onInput={e => setDescOverride((e.target as HTMLDivElement).innerHTML)}
                dangerouslySetInnerHTML={{ __html: descOverride }}
              />
              <div className="flex gap-1 mt-1.5">
                {(['bold','italic','underline'] as const).map(cmd => (
                  <button key={cmd} type="button"
                          onMouseDown={e => { e.preventDefault(); document.execCommand(cmd); }}
                          className="px-2 py-1 text-xs border border-ink-200 rounded hover:bg-ink-50 text-ink-600 capitalize">
                    {cmd}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <button onClick={() => setStep('select')} className="btn-secondary"><ChevronLeft size={16}/> Back</button>
            <button onClick={() => { setPreviewIdx(0); setPreviewDataUrl(''); setStep('preview'); }}
                    disabled={validNames.length === 0}
                    className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
              Preview <Eye size={16}/>
            </button>
          </div>
        </div>
      )}

      {/* ══════ STEP 3: PREVIEW ══════ */}
      {step === 'preview' && (
        <div className="animate-slide-up">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setStep('names')} className="p-2 text-ink-400 hover:text-ink-700 hover:bg-ink-50 rounded-lg transition-colors">
              <ChevronLeft size={18}/>
            </button>
            <h2 className="font-display text-xl text-ink-800">Preview</h2>
            {validNames.length > 1 && (
              <span className="ml-auto text-sm text-ink-500">{previewIdx + 1} / {validNames.length}</span>
            )}
          </div>

          <div ref={previewContainerRef}
               className="relative bg-ink-100 rounded-2xl overflow-hidden flex items-center justify-center"
               style={{ minHeight: 320 }}>
            {previewLoading ? (
              <div className="flex flex-col items-center gap-3 py-16">
                <svg className="animate-spin w-8 h-8 text-accent-gold" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <p className="text-ink-500 text-sm">Rendering preview…</p>
              </div>
            ) : previewDataUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={previewDataUrl} alt="Certificate preview"
                   className="max-w-full max-h-[60vh] shadow-strong rounded-lg m-4"/>
            ) : (
              <p className="text-ink-400 py-16">Generating preview…</p>
            )}
          </div>

          {validNames.length > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <button onClick={() => setPreviewIdx(i => Math.max(0, i - 1))}
                      disabled={previewIdx === 0}
                      className="p-2 text-ink-400 hover:text-ink-700 disabled:opacity-30 rounded-lg hover:bg-ink-100 transition-colors">
                <ChevronLeft size={18}/>
              </button>
              <span className="text-sm font-medium text-ink-700 px-3 min-w-[160px] text-center">
                {validNames[previewIdx]}
              </span>
              <button onClick={() => setPreviewIdx(i => Math.min(validNames.length - 1, i + 1))}
                      disabled={previewIdx === validNames.length - 1}
                      className="p-2 text-ink-400 hover:text-ink-700 disabled:opacity-30 rounded-lg hover:bg-ink-100 transition-colors">
                <ChevronRight size={18}/>
              </button>
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <button onClick={() => setStep('names')} className="btn-secondary"><ChevronLeft size={16}/> Back</button>
            <button onClick={() => setStep('generate')} className="btn-primary">Configure Output <ChevronRight size={16}/></button>
          </div>
        </div>
      )}

      {/* ══════ STEP 4: GENERATE ══════ */}
      {step === 'generate' && (
        <div className="animate-slide-up">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setStep('preview')} className="p-2 text-ink-400 hover:text-ink-700 hover:bg-ink-50 rounded-lg transition-colors">
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
            <button onClick={() => setStep('preview')} disabled={generating} className="btn-secondary">
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
