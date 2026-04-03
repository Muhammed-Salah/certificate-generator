'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Template, TemplateConfig, TextField, RichTextField, CustomTextField, FontRecord } from '@/types';
import {
  Save, ArrowLeft, Type, AlignLeft, AlignCenter, AlignRight,
  ChevronDown, Palette, Info, Grid3X3, Magnet, PlusCircle, Trash2
} from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import FontPicker from '@/components/FontPicker';
import { loadGoogleFont, POPULAR_GOOGLE_FONTS, GOOGLE_FONT_WEIGHTS } from '@/lib/googleFonts';

const SYSTEM_FONTS = [
  'Georgia', 'Times New Roman', 'Palatino', 'Arial',
  'Helvetica', 'Verdana', 'Trebuchet MS', 'Courier New',
];
const CASE_OPTIONS = [
  { value: 'none',       label: 'As typed' },
  { value: 'uppercase',  label: 'UPPERCASE' },
  { value: 'lowercase',  label: 'lowercase' },
  { value: 'capitalize', label: 'Capitalize first' },
  { value: 'titlecase',  label: 'Title Case' },
  { value: 'small-caps', label: 'Small Caps' },
];

declare global {
  interface Window {
    __unsavedChanges?: boolean;
  }
}

type DragTarget = string | null;

export default function ConfigurePage() {
  const params   = useParams();
  const id       = Array.isArray(params.id) ? params.id[0] : (params.id as string);
  const router   = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [template, setTemplate]   = useState<Template | null>(null);
  const [fonts, setFonts]         = useState<FontRecord[]>([]);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgNatW, setImgNatW]     = useState(1);
  const [imgNatH, setImgNatH]     = useState(1);
  const [pdfRendering, setPdfRendering] = useState(false);
  const [pdfDataUrl, setPdfDataUrl]     = useState<string | null>(null);
  const [fontUrls, setFontUrls]         = useState<Record<string, string>>({});

  const [nameField, setNameField] = useState<TextField>({
    x: 0.5, y: 0.55, font_family: 'Georgia', font_size: 48,
    font_color: '#1a1612', alignment: 'center', case_transform: 'none',
    max_width: 0.8, auto_size: true,
  });
  const [descField, setDescField] = useState<RichTextField>({
    x: 0.5, y: 0.68, width: 0.7, height: 0.12,
    font_family: 'Georgia', font_size: 22, font_color: '#4a4032',
    alignment: 'center', content: '',
  });
  const [showDesc, setShowDesc]     = useState(false);
  const [showNameColor, setShowNameColor] = useState(false);
  const [showDescColor, setShowDescColor] = useState(false);

  const [additionalFields, setAdditionalFields] = useState<CustomTextField[]>([]);
  const [showCustomColor, setShowCustomColor] = useState<Record<string, boolean>>({});

  const canvasRef = useRef<HTMLDivElement>(null);
  const imgRef    = useRef<HTMLImageElement>(null);
  const dragging  = useRef<DragTarget>(null);
  const dragStart = useRef({ mx: 0, my: 0, fx: 0, fy: 0, fw: 0, fh: 0 });
  const resizingDesc = useRef(false);
  const lastStateBeforeDown = useRef<DragTarget>(null);

  const [showGrid, setShowGrid]     = useState(true);
  const [gridSize, setGridSize]     = useState(5);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [selectedElement, setSelectedElement] = useState<DragTarget>(null);
  const [showLimitGuide, setShowLimitGuide]   = useState(false);
  const limitGuideTimer = useRef<NodeJS.Timeout | null>(null);

  const triggerLimitGuide = useCallback(() => {
    setShowLimitGuide(true);
    if (limitGuideTimer.current) clearTimeout(limitGuideTimer.current);
    limitGuideTimer.current = setTimeout(() => setShowLimitGuide(false), 2000);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (window.__unsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.__unsavedChanges = false;
    };
  }, []);

  /* ─── Load data once ─── */
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const [{ data: tpl }, { data: cfg }, { data: fnts }] = await Promise.all([
        supabase.from('templates').select('*').eq('id', id).single(),
        supabase.from('template_configs').select('*').eq('template_id', id).maybeSingle(),
        supabase.from('fonts').select('*').order('name'),
      ]);
      if (cancelled) return;
      if (tpl) setTemplate(tpl as Template);
      if (cfg) {
        if (cfg.name_field) {
           setNameField(cfg.name_field as TextField);
           if (POPULAR_GOOGLE_FONTS.includes((cfg.name_field as TextField).font_family)) {
             loadGoogleFont((cfg.name_field as TextField).font_family, (cfg.name_field as TextField).font_weight || 400);
           }
        }
        if (cfg.description_field) { 
           setDescField(cfg.description_field as RichTextField); 
           setShowDesc(true); 
           if (POPULAR_GOOGLE_FONTS.includes((cfg.description_field as RichTextField).font_family)) {
             loadGoogleFont((cfg.description_field as RichTextField).font_family, (cfg.description_field as RichTextField).font_weight || 400);
           }
        }
        if (cfg.additional_fields) {
           setAdditionalFields(cfg.additional_fields as CustomTextField[]);
           (cfg.additional_fields as CustomTextField[]).forEach(f => {
             if (POPULAR_GOOGLE_FONTS.includes(f.font_family)) loadGoogleFont(f.font_family, f.font_weight || 400);
           });
        }
      }
      if (fnts) setFonts(fnts as FontRecord[]);
    })();
    return () => { cancelled = true; };
  }, [id, supabase]);

  /* ─── Fetch signed URLs for private fonts ─── */
  useEffect(() => {
    if (fonts.length === 0) return;
    (async () => {
      const newUrls: Record<string, string> = {};
      for (const f of fonts) {
        const { data } = await supabase.storage.from('fonts').createSignedUrl(f.file_path, 3600);
        if (data) newUrls[f.id] = data.signedUrl;
      }
      setFontUrls(newUrls);
    })();
  }, [fonts, supabase]);

  /* ─── Inject custom fonts ─── */
  useEffect(() => {
    Object.entries(fontUrls).forEach(([id, url]) => {
      const f = fonts.find(v => v.id === id);
      if (!f) return;
      const sid = `font-face-${f.id}`;
      if (document.getElementById(sid)) return;
      const s = document.createElement('style');
      s.id = sid;
      s.textContent = `@font-face { font-family: '${f.name}'; src: url('${url}'); font-weight: 100 900; }`;
      document.head.appendChild(s);
    });
  }, [fontUrls, fonts]);

  const [templateUrl, setTemplateUrl] = useState('');

  useEffect(() => {
    if (!template) return;
    (async () => {
      const { data } = await supabase.storage.from('templates').createSignedUrl(template.file_path, 3600);
      if (data) setTemplateUrl(data.signedUrl);
    })();
  }, [template, supabase]);

  /* ─── Render PDF to Canvas for background ─── */
  useEffect(() => {
    if (template?.file_type === 'pdf' && templateUrl) {
      (async () => {
        setPdfRendering(true);
        try {
          const { loadPdfPageBitmap, canvasToPngBlob } = await import('@/lib/certGen');
          const { bitmap } = await loadPdfPageBitmap(templateUrl);
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width; canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d');
          if (ctx) ctx.drawImage(bitmap, 0, 0);
          const blob = await canvasToPngBlob(canvas);
          const url = URL.createObjectURL(blob);
          setPdfDataUrl(url);
          // Auto-measure for PDFs that were uploaded before the fix
          setImgNatW(bitmap.width);
          setImgNatH(bitmap.height);
        } catch (e) {
          console.error(e);
        } finally {
          setPdfRendering(false);
        }
      })();
    }
    return () => { if (pdfDataUrl) URL.revokeObjectURL(pdfDataUrl); };
  }, [template, templateUrl]);

  /* ─── Generic drag starter ─── */
  const startDrag = useCallback((e: React.MouseEvent, target: DragTarget, resize = false) => {
    e.stopPropagation();
    lastStateBeforeDown.current = selectedElement; // Remember what was selected before down
    setSelectedElement(target); // Ensure it's selected on down for immediate feedback

    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();

    if (resize) {
      let targetField: RichTextField | undefined;
      // Re-use logic for dragging custom field bottom-right handle if custom fields become resizable. 
      // Right now only description box has resizing.
      if (target === 'description') {
        targetField = descField;
      }

      if (targetField) {
        resizingDesc.current = true;
        dragStart.current = {
          mx: e.clientX, my: e.clientY,
          fx: targetField.x, fy: targetField.y,
          fw: targetField.width, fh: targetField.height,
        };
      }
      const onMove = (ev: MouseEvent) => {
        if (!resizingDesc.current) return;
        const dw = (ev.clientX - dragStart.current.mx) / rect.width;
        const dh = (ev.clientY - dragStart.current.my) / rect.height;
        setDescField(p => ({
          ...p,
          width:  Math.max(0.05, Math.min(0.98, dragStart.current.fw + dw)),
          height: Math.max(0.02, Math.min(0.5,  dragStart.current.fh + dh)),
        }));
      };
      const onUp = () => {
        resizingDesc.current = false;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup',   onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup',   onUp);
      return;
    }

    dragging.current = target;
    const isCustom = target !== 'name' && target !== 'description';
    const field = target === 'name' ? nameField : 
                  target === 'description' ? descField : 
                  additionalFields.find(f => f.id === target);
                  
    if (!field) return;

    dragStart.current = {
      mx: e.clientX, my: e.clientY,
      fx: field.x,   fy: field.y,
      fw: 0, fh: 0,
    };

    let moved = false;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const dx = (ev.clientX - dragStart.current.mx);
      const dy = (ev.clientY - dragStart.current.my);
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;

      const adx = dx / rect.width;
      const ady = dy / rect.height;
      let nx = Math.max(0, Math.min(1, dragStart.current.fx + adx));
      let ny = Math.max(0, Math.min(1, dragStart.current.fy + ady));
      if (snapToGrid && showGrid) {
        const step = gridSize / 100;
        nx = Math.round(nx / step) * step;
        ny = Math.round(ny / step) * step;
      }
      
      if (dragging.current === 'name') {
        setNameField(p => ({ ...p, x: nx, y: ny }));
        triggerLimitGuide();
      } else if (dragging.current === 'description') {
        setDescField(p =>  ({ ...p, x: nx, y: ny }));
      } else {
        const tgt = dragging.current;
        setAdditionalFields(p => p.map(f => f.id === tgt ? { ...f, x: nx, y: ny } : f));
      }
      window.__unsavedChanges = true;
    };
    const onUp = () => {
      dragging.current = null;
      if (moved) lastStateBeforeDown.current = null; // Important: if we moved, don't let onClick toggle it off
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [nameField, descField, additionalFields, snapToGrid, gridSize, showGrid, selectedElement, triggerLimitGuide]);

  const toggleSelection = useCallback((e: React.MouseEvent, target: DragTarget) => {
    e.stopPropagation();
    // If it was already selected at start of the mouse down, and hasn't really moved, we toggle it off.
    // Movement detection is already handled by drag logic. 
    // Here we just toggle off if it was already selected.
    if (lastStateBeforeDown.current === target) {
      setSelectedElement(null);
    }
  }, []);

  /* ─── Keyboard Nudging ─── */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName) || (e.target as HTMLElement).isContentEditable) return;
      if (!selectedElement) return;

      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const step = (snapToGrid && showGrid) ? (gridSize / 100) : 0.005; 
        const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0;
        const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0;
        
        if (selectedElement === 'name') {
           setNameField(p => ({ ...p, x: Math.max(0, Math.min(1, p.x + dx)), y: Math.max(0, Math.min(1, p.y + dy)) }));
           triggerLimitGuide();
        } else if (selectedElement === 'description') {
           setDescField(p => ({ ...p, x: Math.max(0, Math.min(1, p.x + dx)), y: Math.max(0, Math.min(1, p.y + dy)) }));
        } else {
           setAdditionalFields(p => p.map(f => f.id === selectedElement ? { ...f, x: Math.max(0, Math.min(1, f.x + dx)), y: Math.max(0, Math.min(1, f.y + dy)) } : f));
        }
        window.__unsavedChanges = true;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElement, snapToGrid, gridSize]);

  const handleAddCustomField = useCallback(() => {
    setAdditionalFields(p => [
      ...p,
      {
        id: crypto.randomUUID(),
        label: `Custom ${p.length + 1}`,
        content: `Sample ${p.length + 1}`,
        x: 0.5, y: 0.8,
        font_family: 'Georgia', font_size: 24, font_color: '#1a1612',
        alignment: 'center', case_transform: 'none', max_width: 0.8, auto_size: true
      }
    ]);
    window.__unsavedChanges = true;
  }, []);

  const handleDeleteCustomField = useCallback((targetId: string) => {
    setAdditionalFields(p => p.filter(f => f.id !== targetId));
    if (selectedElement === targetId) setSelectedElement(null);
    window.__unsavedChanges = true;
  }, [selectedElement]);

  /* ─── Save ─── */
  const handleSave = useCallback(async () => {
    setSaving(true);
    const payload: Partial<TemplateConfig> & { template_id: string } = {
      template_id:       id,
      name_field:        nameField,
      description_field: showDesc ? descField : undefined,
      additional_fields: additionalFields.length > 0 ? additionalFields : undefined,
      updated_at:        new Date().toISOString(),
    };
    const { error } = await supabase
      .from('template_configs')
      .upsert(payload, { onConflict: 'template_id' });
    setSaving(false);
    if (!error) { 
      setSaved(true); 
      window.__unsavedChanges = false;
      setTimeout(() => router.push('/dashboard/templates'), 500); 
    }
  }, [id, nameField, descField, showDesc, additionalFields, supabase, router]);

  const [configTab, setConfigTab] = useState<'main' | 'custom'>('main');

  /* ─── Render overlay dimensions ─── */
  // These are in % of the rendered image, which matches what we stored (0-1 fractions)

  if (!template) return (
    <div className="p-10 flex items-center justify-center h-full">
      <div className="text-ink-400 animate-pulse font-display text-xl">Loading template…</div>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row h-screen overflow-hidden animate-fade-in">

      {/* ─── Left panel ─── */}
      <aside className="w-full lg:w-80 xl:w-96 flex-shrink-0 bg-white border-r border-ink-100 overflow-hidden flex flex-col">
        <div className="p-5 border-b border-ink-100 flex items-center gap-3 flex-shrink-0">
          <button onClick={() => router.back()}
                  className="p-2 text-ink-400 hover:text-ink-700 hover:bg-ink-50 rounded-lg transition-colors">
            <ArrowLeft size={18}/>
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-lg text-ink-900 font-medium tracking-tight">Configuration</h1>
            <p className="text-[11px] text-ink-400 truncate uppercase tracking-widest">{template.name}</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex px-5 pt-4 border-b border-ink-100 flex-shrink-0">
          <button
            onClick={() => setConfigTab('main')}
            className={`pb-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-all mr-6 ${
              configTab === 'main' ? 'border-accent-gold text-ink-900' : 'border-transparent text-ink-300 hover:text-ink-500'
            }`}
          >
            Core Fields
          </button>
          <button
            onClick={() => setConfigTab('custom')}
            className={`pb-3 text-xs font-bold uppercase tracking-widest border-b-2 transition-all relative ${
              configTab === 'custom' ? 'border-accent-gold text-ink-900' : 'border-transparent text-ink-300 hover:text-ink-500'
            }`}
          >
            Custom Fields
            {additionalFields.length > 0 && (
              <span className="absolute -top-1 -right-3 w-4 h-4 bg-accent-gold text-ink-900 text-[9px] rounded-full flex items-center justify-center font-bold">
                {additionalFields.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-7 custom-scrollbar pb-10">
          {configTab === 'main' ? (
            <>
              {/* Name field */}
              <section className="animate-fade-in-up">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-1.5 h-6 bg-blue-500 rounded-full"/>
                  <h3 className="font-display text-base text-ink-900">Recipient Name</h3>
                </div>
                <FieldControls
                  field={nameField}
                  onChange={(k, v) => { 
                    setNameField(p => ({ ...p, [k]: v } as TextField));
                    window.__unsavedChanges = true;
                    if (k === 'max_width' || k === 'x' || k === 'alignment') triggerLimitGuide();
                  }}
                  fonts={fonts}
                  systemFonts={SYSTEM_FONTS}
                  showColor={showNameColor}
                  onToggleColor={() => setShowNameColor(p => !p)}
                  onCloseColor={() => setShowNameColor(false)}
                  showCaseTransform
                  showAutoSize
                />
              </section>

              {/* Description field */}
              <section className="animate-fade-in-up pt-1" style={{ animationDelay: '0.1s' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-6 bg-amber-500 rounded-full"/>
                    <h3 className="font-display text-base text-ink-900">Description</h3>
                  </div>
                  <button
                    onClick={() => { setShowDesc(p => !p); window.__unsavedChanges = true; }}
                    className={`w-9 h-5 rounded-full transition-colors duration-200 relative flex-shrink-0 ${showDesc ? 'bg-accent-gold' : 'bg-ink-200'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${showDesc ? 'translate-x-4' : 'translate-x-0.5'}`}/>
                  </button>
                </div>
                {showDesc ? (
                  <FieldControls
                    field={descField}
                    onChange={(k, v) => { setDescField(p => ({ ...p, [k]: v } as RichTextField)); window.__unsavedChanges = true; }}
                    fonts={fonts}
                    systemFonts={SYSTEM_FONTS}
                    showColor={showDescColor}
                    onToggleColor={() => setShowDescColor(p => !p)}
                    onCloseColor={() => setShowDescColor(false)}
                  />
                ) : (
                  <div className="p-4 bg-ink-50 rounded-xl border border-ink-100 text-center">
                    <p className="text-xs text-ink-400">Description field is currently hidden</p>
                  </div>
                )}
              </section>
            </>
          ) : (
            <div className="animate-fade-in-up space-y-7">
              {/* Additional Custom Fields */}
              {additionalFields.length === 0 ? (
                <div className="py-12 bg-ink-50 rounded-2xl border border-ink-100 border-dashed text-center px-6">
                  <div className="w-12 h-12 bg-ink-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <PlusCircle size={20} className="text-ink-300" />
                  </div>
                  <p className="text-sm text-ink-700 font-medium">No custom fields added</p>
                  <p className="text-xs text-ink-400 mt-1">Use these for Certificate IDs, Dates, or unique marks.</p>
                </div>
              ) : (
                additionalFields.map(field => (
                  <section key={field.id} className="p-4 bg-white border border-ink-100 rounded-2xl shadow-sm relative group animation-fade-in">
                    <div className="flex items-center gap-2 mb-5">
                      <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"/>
                      <input 
                        value={field.label}
                        onChange={e => {
                           setAdditionalFields(p => p.map(f => f.id === field.id ? { ...f, label: e.target.value } : f));
                           window.__unsavedChanges = true;
                        }}
                        className="font-display text-sm text-ink-900 bg-transparent border-b border-transparent hover:border-ink-200 focus:border-ink-400 focus:outline-none px-1 py-0.5 rounded transition-colors flex-1"
                        placeholder="Field label"
                      />
                      
                      <button 
                        onClick={() => handleDeleteCustomField(field.id)}
                        className="p-1.5 text-ink-300 hover:text-red-500 rounded-lg transition-colors hover:bg-red-50"
                        aria-label="Delete field">
                        <Trash2 size={16}/>
                      </button>
                    </div>

                    <div className="mb-5">
                      <label className="text-[10px] uppercase font-bold tracking-widest text-ink-400 mb-1.5 block">Preview Value</label>
                      <input 
                        value={field.content}
                        onChange={e => {
                           setAdditionalFields(p => p.map(f => f.id === field.id ? { ...f, content: e.target.value } : f));
                           window.__unsavedChanges = true;
                        }}
                        className="input py-2 text-sm w-full font-medium"
                        placeholder="Sample text..."
                      />
                    </div>

                    <FieldControls
                      field={field}
                      onChange={(k, v) => { 
                        setAdditionalFields(p => p.map(f => f.id === field.id ? { ...f, [k]: v } : f));
                        window.__unsavedChanges = true;
                      }}
                      fonts={fonts}
                      systemFonts={SYSTEM_FONTS}
                      showColor={showCustomColor[field.id] || false}
                      onToggleColor={() => setShowCustomColor(p => ({ ...p, [field.id]: !p[field.id] }))}
                      onCloseColor={() => setShowCustomColor(p => ({ ...p, [field.id]: false }))}
                      showCaseTransform
                      showAutoSize={false}
                      showMaxWidth={false}
                    />
                  </section>
                ))
              )}

              <button
                onClick={handleAddCustomField}
                className="w-full flex items-center justify-center gap-2 p-4 text-xs font-bold uppercase tracking-widest text-ink-700 bg-white hover:bg-ink-950 hover:text-white border-2 border-ink-950 rounded-2xl transition-all shadow-md active:scale-[0.98]"
              >
                <PlusCircle size={14}/> Add New Custom Field
              </button>
            </div>
          )}

          <div className="p-4 bg-parchment-50 rounded-2xl border border-parchment-200 text-xs text-ink-500 leading-relaxed shadow-sm">
            <div className="flex gap-2.5">
               <Info size={14} className="text-accent-gold flex-shrink-0 mt-0.5" />
               <p>
                 <strong className="text-ink-700 font-bold">Pro Tip:</strong> Drag the dots on the certificate preview to reposition them instantly. You can also use arrow keys for fine-tuning.
               </p>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-ink-100 flex-shrink-0 bg-white">
          <button onClick={handleSave} disabled={saving}
                  className={`w-full btn-gold justify-center py-3.5 transition-all shadow-lg active:scale-[0.98] ${saved ? '!bg-green-600 !text-white' : ''}`}>
            {saving
              ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg> Saving…</>
              : saved
              ? <>✓ Configuration Saved</>
              : <><Save size={16}/> Save & Return</>
            }
          </button>
        </div>
      </aside>

      {/* ─── Canvas area ─── */
       /* eslint-disable-next-line a11y-click-events-have-key-events */}
      <div className="flex-1 bg-ink-100 overflow-auto flex items-center justify-center p-6" ref={canvasRef}
           onClick={() => setSelectedElement(null)}>
        <div className="relative canvas-shadow rounded-lg overflow-hidden select-none"
             style={{ maxWidth: '100%', maxHeight: '85vh', display: 'inline-block' }}>

          {pdfRendering ? (
            <div className="w-[800px] h-[566px] bg-white flex flex-col items-center justify-center gap-4 border border-ink-100 rounded-lg shadow-sm">
               <div className="animate-spin w-10 h-10 border-4 border-ink-100 border-t-accent-gold rounded-full" />
               <div className="text-center">
                 <p className="text-sm text-ink-800 font-bold uppercase tracking-widest">Rendering PDF</p>
                 <p className="text-[10px] text-ink-400 mt-1 uppercase tracking-tight">Sharpening edges and measuring proportions...</p>
               </div>
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              ref={imgRef}
              src={template.file_type === 'pdf' ? (pdfDataUrl || '') : templateUrl}
              alt={template.name}
              className="block max-w-full"
              style={{ maxHeight: '85vh', objectFit: 'contain' }}
              onLoad={e => {
                const img = e.currentTarget;
                setImgLoaded(true);
                // For PNGs we trust the natural dimensions
                if (template.file_type === 'png') {
                  setImgNatW(img.naturalWidth);
                  setImgNatH(img.naturalHeight);
                }
              }}
              draggable={false}
            />
          )}
          
          {/* Max width limits guide */}
          <div 
            className="absolute pointer-events-none transition-opacity duration-700 z-20 flex"
            style={{
              left:      nameField.alignment === 'left' ? `${nameField.x * 100}%` :
                         nameField.alignment === 'right' ? `${(nameField.x - nameField.max_width) * 100}%` :
                         `${(nameField.x - nameField.max_width / 2) * 100}%`,
              top:       0,
              bottom:    0,
              width:     `${nameField.max_width * 100}%`,
              opacity:   showLimitGuide ? 1 : 0,
              justifyContent: nameField.alignment === 'center' ? 'space-between' :
                              nameField.alignment === 'left'   ? 'flex-end' : 'flex-start'
            }}>
            <div className="w-0.5 h-full bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.8)]" />
            {nameField.alignment === 'center' && (
              <div className="w-0.5 h-full bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.8)]" />
            )}
            <div className="absolute inset-0 bg-blue-500/10" />
          </div>

          {showGrid && (
            <div className="absolute inset-0 pointer-events-none opacity-20 z-0"
                 style={{ 
                   backgroundImage: 'linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)', 
                   backgroundSize: `${gridSize}% ${gridSize}%` 
                 }} 
            />
          )}

          {/* Overlays — shown once image is measured */}
          {(imgLoaded || template.file_type === 'pdf') && (
            <>
              {/* Name dot */}
              <div
                className={`absolute cursor-move group z-10 transition-shadow ${selectedElement === 'name' ? 'ring-2 ring-accent-gold ring-offset-2' : ''}`}
                style={{
                  left:      `${nameField.x * 100}%`,
                  top:       `${nameField.y * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                onMouseDown={e => {
                  if (e.button === 0) startDrag(e, 'name'); // Left click drag
                }}
                onClick={e => toggleSelection(e, 'name')}>
                <div className={`absolute -top-6 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap
                                transition-opacity pointer-events-none z-20 ${selectedElement === 'name' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                  Name
                </div>
                <div className={`w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-md transition-transform ${selectedElement === 'name' ? 'scale-125' : 'hover:scale-125'}`}/>
                {/* Ghost text */}
                <div className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
                     style={{
                       left:      nameField.alignment === 'left'  ? '8px' :
                                  nameField.alignment === 'right' ? 'auto' : '50%',
                       right:     nameField.alignment === 'right' ? '8px' : 'auto',
                       transform: `translateY(-50%)${nameField.alignment === 'center' ? ' translateX(-50%)' : ''}`,
                       width: `${nameField.max_width * (imgRef.current?.clientWidth ?? 800)}px`,
                       textAlign: nameField.alignment,
                     }}>
                  <span style={{
                    fontFamily:  nameField.font_family,
                    fontWeight:  nameField.font_weight || 400,
                    fontSize:    nameField.font_size * (imgRef.current ? imgRef.current.clientWidth / imgNatW : 1),
                    color:       nameField.font_color,
                    textShadow:  '0 0 6px rgba(255,255,255,0.9)',
                    whiteSpace:  'nowrap',
                    fontVariant: nameField.case_transform === 'small-caps' ? 'small-caps' : 'normal',
                    textTransform: nameField.case_transform !== 'small-caps' && nameField.case_transform !== 'none' ? (nameField.case_transform as any) : 'none',
                  }}>
                    Recipient Name
                  </span>
                </div>
              </div>

              {/* Description box */}
              {showDesc && (
                <div
                  className={`absolute cursor-move group z-10 transition-shadow ${selectedElement === 'description' ? 'ring-2 ring-accent-gold ring-offset-2' : ''}`}
                  style={{
                    left:   `${(descField.x - descField.width / 2) * 100}%`,
                    top:    `${descField.y * 100}%`,
                    width:  `${descField.width * 100}%`,
                    height: `${descField.height * 100}%`,
                    border: '2px dashed rgba(245,158,11,0.8)',
                    borderRadius: 4,
                    background: selectedElement === 'description' ? 'rgba(245,158,11,0.12)' : 'rgba(245,158,11,0.06)',
                    minWidth: 40, minHeight: 20,
                  }}
                  onMouseDown={e => {
                    if (e.button === 0) startDrag(e, 'description'); // Left click drag
                  }}
                  onClick={e => toggleSelection(e, 'description')}>
                  <div className={`absolute -top-6 left-0 bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded
                                  whitespace-nowrap transition-opacity pointer-events-none z-20 ${selectedElement === 'description' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    Description (drag to move)
                  </div>
                  <div
                    className="w-full h-full overflow-hidden pointer-events-none p-1"
                    style={{
                      fontFamily: descField.font_family,
                      fontWeight: descField.font_weight || 400,
                      fontSize:   descField.font_size * (imgRef.current ? imgRef.current.clientWidth / imgNatW : 1),
                      color:      descField.font_color,
                      textAlign:  descField.alignment,
                      textShadow: '0 0 6px rgba(255,255,255,0.9)',
                    }}
                    dangerouslySetInnerHTML={{ __html: descField.content || '<em>Description…</em>' }}
                  />
                  {/* Resize handle */}
                  <div
                    className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-20 flex items-center justify-center"
                    style={{ background: 'rgba(245,158,11,0.9)', borderRadius: '2px 0 3px 0' }}
                    onMouseDown={e => startDrag(e, 'description', true)}>
                    <span className="text-white text-[8px] leading-none select-none">⤡</span>
                  </div>
                </div>
              )}

              {/* Additional Custom Fields */}
              {additionalFields.map((field) => (
                <div
                  key={field.id}
                  className={`absolute cursor-move group z-10 transition-shadow ${selectedElement === field.id ? 'ring-2 ring-accent-gold ring-offset-2' : ''}`}
                  style={{
                    left:      `${field.x * 100}%`,
                    top:       `${field.y * 100}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  onMouseDown={e => {
                    if (e.button === 0) startDrag(e, field.id);
                  }}
                  onClick={e => toggleSelection(e, field.id)}>
                  
                  <div className={`absolute -top-6 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap
                                  transition-opacity pointer-events-none z-20 ${selectedElement === field.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    {field.label}
                  </div>
                  
                  <div className={`w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shadow-md transition-transform ${selectedElement === field.id ? 'scale-125' : 'hover:scale-125'}`}/>
                  
                  {/* Ghost text */}
                  <div className="absolute top-1/2 -translate-y-1/2 pointer-events-none"
                       style={{
                         left:      field.alignment === 'left'  ? '8px' :
                                    field.alignment === 'right' ? 'auto' : '50%',
                         right:     field.alignment === 'right' ? '8px' : 'auto',
                         transform: `translateY(-50%)${field.alignment === 'center' ? ' translateX(-50%)' : ''}`,
                         width: `${field.max_width * (imgRef.current?.clientWidth ?? 800)}px`,
                         textAlign: field.alignment,
                       }}>
                    <span style={{
                      fontFamily:  field.font_family,
                      fontWeight:  field.font_weight || 400,
                      fontSize:    field.font_size * (imgRef.current ? imgRef.current.clientWidth / imgNatW : 1),
                      color:       field.font_color,
                      textShadow:  '0 0 6px rgba(255,255,255,0.9)',
                      whiteSpace:  'nowrap',
                      fontVariant: field.case_transform === 'small-caps' ? 'small-caps' : 'normal',
                      textTransform: field.case_transform !== 'small-caps' && field.case_transform !== 'none' ? (field.case_transform as any) : 'none',
                    }}>
                      {field.content || field.label}
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        
        {/* Helper Toolbar in canvas area */}
        <div className="absolute bottom-6 bg-white rounded-full shadow-strong px-4 py-2 flex items-center gap-4 z-30" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowGrid(p => !p); if (showGrid) setSnapToGrid(false); }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                showGrid ? 'bg-ink-900 text-white shadow-sm' : 'bg-ink-50 text-ink-500 hover:bg-ink-100'
              }`}>
              <Grid3X3 size={14}/> {showGrid ? 'Grid On' : 'Grid Off'}
            </button>
            <div className={`flex items-center bg-ink-50 rounded border border-ink-200 ml-1 transition-opacity ${!showGrid ? 'opacity-30 pointer-events-none' : ''}`}>
              <button disabled={!showGrid || gridSize <= 1}
                      onClick={() => setGridSize(p => Math.max(1, p - 1))}
                      className="px-2 py-0.5 hover:bg-ink-100 disabled:opacity-50 text-ink-700">-</button>
              <span className="text-xs w-8 text-center font-medium text-ink-700">{gridSize}%</span>
              <button disabled={!showGrid || gridSize >= 20}
                      onClick={() => setGridSize(p => Math.min(20, p + 1))}
                      className="px-2 py-0.5 hover:bg-ink-100 disabled:opacity-50 text-ink-700">+</button>
            </div>
          </div>
          <div className="w-px h-4 bg-ink-200"/>
          <button
            disabled={!showGrid}
            onClick={() => setSnapToGrid(p => !p)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              !showGrid ? 'opacity-30 cursor-not-allowed' :
              snapToGrid ? 'bg-accent-gold text-ink-900 shadow-sm' : 'bg-ink-50 text-ink-500 hover:bg-ink-100'
            }`}>
            <Magnet size={14}/> {snapToGrid ? 'Snap On' : 'Snap Off'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NumericInput({ value, min, onChange, className }: { value: number; min: number; onChange: (v: number) => void; className?: string }) {
  const [local, setLocal] = useState(value.toString());
  useEffect(() => setLocal(value.toString()), [value]);

  return (
    <input 
      type="number" min={min} value={local} className={className}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => {
        let n = parseInt(local, 10);
        if (isNaN(n)) n = value;
        else if (n < min) n = min;
        onChange(n);
        setLocal(n.toString());
      }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}

/* ─── FieldControls sub-component ─── */
function FieldControls({
  field, onChange, fonts, systemFonts, showColor, onToggleColor, onCloseColor,
  showCaseTransform = false, showAutoSize = false, showMaxWidth = true,
}: {
  field: TextField | RichTextField;
  onChange: (key: string, value: unknown) => void;
  fonts: FontRecord[];
  systemFonts: string[];
  showColor: boolean;
  onToggleColor: () => void;
  onCloseColor: () => void;
  showCaseTransform?: boolean;
  showAutoSize?: boolean;
  showMaxWidth?: boolean;
}) {
  return (
    <div className="space-y-3.5">
      {/* Font family */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Font Family</label>
          <FontPicker
            value={field.font_family}
            onChange={v => {
              onChange('font_family', v);
              if (POPULAR_GOOGLE_FONTS.includes(v)) loadGoogleFont(v, field.font_weight || 400);
            }}
            systemFonts={systemFonts}
            customFonts={fonts}
          />
        </div>
        <div>
          <label className="label">Font Weight</label>
          <div className="relative">
            <select 
              value={field.font_weight || 400} 
              onChange={e => {
                const w = +e.target.value;
                onChange('font_weight', w);
                if (POPULAR_GOOGLE_FONTS.includes(field.font_family)) loadGoogleFont(field.font_family, w);
              }}
              className="input pr-8 appearance-none cursor-pointer">
              {GOOGLE_FONT_WEIGHTS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"/>
          </div>
        </div>
      </div>

      {/* Font size */}
      <div>
        <label className="label">Font Size <span className="text-ink-400 normal-case font-normal">(px at full resolution)</span></label>
        <div className="flex items-center gap-2">
          <input type="range" min={1} max={120} value={field.font_size}
                 onChange={e => onChange('font_size', +e.target.value)}
                 className="flex-1 accent-ink-900"/>
          <NumericInput min={1} value={field.font_size} onChange={v => onChange('font_size', v)}
                 className="input w-16 text-center py-1.5"/>
        </div>
      </div>

      {/* Color */}
      <div>
        <label className="label">Font Color</label>
        <div className="flex items-center gap-2">
          <button onClick={onToggleColor}
                  className="w-9 h-9 rounded-lg border-2 border-ink-200 flex-shrink-0 shadow-inset-sm hover:scale-105 transition-transform"
                  style={{ background: field.font_color }}
                  aria-label="Pick colour"/>
          <input type="text" value={field.font_color}
                 onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) onChange('font_color', e.target.value); }}
                 className="input flex-1 font-mono text-sm py-1.5"
                 placeholder="#1a1612"/>
          <Palette size={16} className="text-ink-400 flex-shrink-0"/>
        </div>
        {showColor && (
          <div className="mt-2 z-30 relative">
            <HexColorPicker color={field.font_color} onChange={v => onChange('font_color', v)}/>
            <button onClick={onCloseColor} className="mt-2 text-xs text-ink-400 hover:text-ink-700 transition-colors">
              Done
            </button>
          </div>
        )}
      </div>

      {/* Alignment */}
      <div>
        <label className="label">Alignment</label>
        <div className="flex gap-1">
          {(['left','center','right'] as const).map(a => (
            <button key={a} onClick={() => onChange('alignment', a)}
                    className={`flex-1 p-2 rounded-lg border transition-all ${
                      field.alignment === a ? 'bg-ink-900 border-ink-900 text-white' : 'bg-white border-ink-200 text-ink-500 hover:border-ink-300'
                    }`}>
              {a === 'left'   && <AlignLeft   size={16} className="mx-auto"/>}
              {a === 'center' && <AlignCenter  size={16} className="mx-auto"/>}
              {a === 'right'  && <AlignRight   size={16} className="mx-auto"/>}
            </button>
          ))}
        </div>
      </div>

      {/* Case transform */}
      {showCaseTransform && (
        <div>
          <label className="label">Case Transform</label>
          <div className="relative">
            <select value={(field as TextField).case_transform}
                    onChange={e => onChange('case_transform', e.target.value)}
                    className="input pr-8 appearance-none cursor-pointer">
              {CASE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"/>
          </div>
        </div>
      )}

      {/* Auto-size */}
      {showAutoSize && (
        <label className="flex items-center gap-3 cursor-pointer">
          <button
            type="button"
            onClick={() => onChange('auto_size', !(field as TextField).auto_size)}
            className={`w-9 h-5 rounded-full transition-colors duration-200 relative flex-shrink-0 ${(field as TextField).auto_size ? 'bg-accent-gold' : 'bg-ink-200'}`}>
            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${(field as TextField).auto_size ? 'translate-x-4' : 'translate-x-0.5'}`}/>
          </button>
          <div>
            <p className="text-sm font-medium text-ink-700">Auto-size font</p>
            <p className="text-xs text-ink-400">Shrink font if name overflows max width</p>
          </div>
        </label>
      )}

      {/* Max width */}
      {showMaxWidth && 'max_width' in field && (
        <div>
          <label className="label">Max Width — <span className="text-ink-500 font-normal normal-case">{Math.round((field as TextField).max_width * 100)}% of template width</span></label>
          <input type="range" min={10} max={100}
                 value={Math.round((field as TextField).max_width * 100)}
                 onChange={e => onChange('max_width', +e.target.value / 100)}
                 className="w-full accent-ink-900"/>
        </div>
      )}

      {/* Default description content */}
      {'content' in field && (
        <div>
          <label className="label">Default Content</label>
          <div
            contentEditable suppressContentEditableWarning
            className="rich-editor input rounded-lg p-3 min-h-[70px]"
            data-placeholder="Enter default description text…"
            style={{ fontFamily: field.font_family, fontSize: '14px' }}
            onBlur={e => onChange('content', (e.target as HTMLDivElement).innerHTML)}
            onPaste={e => {
              e.preventDefault();
              const text = e.clipboardData.getData('text/plain');
              document.execCommand('insertText', false, text);
            }}
            dangerouslySetInnerHTML={{ __html: (field as RichTextField).content }}
          />
          <div className="flex gap-1 mt-1.5">
            {(['bold','italic','underline'] as const).map(cmd => (
              <button key={cmd} type="button"
                      onMouseDown={e => { e.preventDefault(); document.execCommand(cmd); }}
                      className="px-2 py-1 text-xs border border-ink-200 rounded hover:bg-ink-50 text-ink-600 capitalize inline-flex items-center gap-1">
                <Type size={10}/>{cmd}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
