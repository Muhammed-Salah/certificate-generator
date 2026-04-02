'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Template, TemplateConfig, TextField, RichTextField, FontRecord } from '@/types';
import {
  Save, ArrowLeft, Type, AlignLeft, AlignCenter, AlignRight,
  ChevronDown, Palette, Info,
} from 'lucide-react';
import { HexColorPicker } from 'react-colorful';

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
];

type DragTarget = 'name' | 'description' | null;

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

  const canvasRef = useRef<HTMLDivElement>(null);
  const imgRef    = useRef<HTMLImageElement>(null);
  const dragging  = useRef<DragTarget>(null);
  const dragStart = useRef({ mx: 0, my: 0, fx: 0, fy: 0, fw: 0, fh: 0 });
  const resizingDesc = useRef(false);

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
        if (cfg.name_field)        setNameField(cfg.name_field as TextField);
        if (cfg.description_field) { setDescField(cfg.description_field as RichTextField); setShowDesc(true); }
      }
      if (fnts) setFonts(fnts as FontRecord[]);
    })();
    return () => { cancelled = true; };
  }, [id, supabase]);

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

  const templateUrl = useMemo(() => {
    if (!template) return '';
    const { data } = supabase.storage.from('templates').getPublicUrl(template.file_path);
    return data.publicUrl;
  }, [template, supabase]);

  /* ─── Generic drag starter ─── */
  const startDrag = useCallback((
    e: React.MouseEvent,
    target: DragTarget,
    isResize = false,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const img  = imgRef.current;
    if (!img) return;
    const rect = img.getBoundingClientRect();

    if (isResize) {
      resizingDesc.current = true;
      dragStart.current = {
        mx: e.clientX, my: e.clientY,
        fx: descField.x, fy: descField.y,
        fw: descField.width, fh: descField.height,
      };
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
    const field = target === 'name' ? nameField : descField;
    dragStart.current = {
      mx: e.clientX, my: e.clientY,
      fx: field.x,   fy: field.y,
      fw: 0, fh: 0,
    };

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const dx = (ev.clientX - dragStart.current.mx) / rect.width;
      const dy = (ev.clientY - dragStart.current.my) / rect.height;
      const nx = Math.max(0, Math.min(1, dragStart.current.fx + dx));
      const ny = Math.max(0, Math.min(1, dragStart.current.fy + dy));
      if (dragging.current === 'name') setNameField(p => ({ ...p, x: nx, y: ny }));
      else                             setDescField(p =>  ({ ...p, x: nx, y: ny }));
    };
    const onUp = () => {
      dragging.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
  }, [nameField, descField]);

  /* ─── Save ─── */
  const handleSave = useCallback(async () => {
    setSaving(true);
    const payload: Partial<TemplateConfig> & { template_id: string } = {
      template_id:       id,
      name_field:        nameField,
      description_field: showDesc ? descField : undefined,
      updated_at:        new Date().toISOString(),
    };
    const { error } = await supabase
      .from('template_configs')
      .upsert(payload, { onConflict: 'template_id' });
    setSaving(false);
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  }, [id, nameField, descField, showDesc, supabase]);

  const allFonts = useMemo(
    () => [...SYSTEM_FONTS, ...fonts.map(f => f.name)],
    [fonts],
  );

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
      <aside className="w-full lg:w-80 xl:w-96 flex-shrink-0 bg-white border-r border-ink-100 overflow-y-auto flex flex-col">
        <div className="p-5 border-b border-ink-100 flex items-center gap-3 flex-shrink-0">
          <button onClick={() => router.back()}
                  className="p-2 text-ink-400 hover:text-ink-700 hover:bg-ink-50 rounded-lg transition-colors">
            <ArrowLeft size={18}/>
          </button>
          <div className="min-w-0">
            <h1 className="font-display text-lg text-ink-900 font-medium">Configure Template</h1>
            <p className="text-xs text-ink-400 truncate">{template.name}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Name field */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-4 h-4 rounded-full bg-blue-500 flex-shrink-0"/>
              <h3 className="font-medium text-ink-800 text-sm">Name Field</h3>
              <span className="ml-auto flex items-center gap-1 text-xs text-ink-400">
                <Info size={11}/> Drag on canvas
              </span>
            </div>
            <FieldControls
              field={nameField}
              onChange={(k, v) => setNameField(p => ({ ...p, [k]: v } as TextField))}
              fonts={allFonts}
              showColor={showNameColor}
              onToggleColor={() => setShowNameColor(p => !p)}
              onCloseColor={() => setShowNameColor(false)}
              showCaseTransform
              showAutoSize
            />
          </section>

          {/* Description field */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full bg-amber-500 flex-shrink-0"/>
                <h3 className="font-medium text-ink-800 text-sm">Description Field</h3>
              </div>
              <button
                onClick={() => setShowDesc(p => !p)}
                className={`w-9 h-5 rounded-full transition-colors duration-200 relative flex-shrink-0 ${showDesc ? 'bg-accent-gold' : 'bg-ink-200'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${showDesc ? 'translate-x-4' : 'translate-x-0.5'}`}/>
              </button>
            </div>
            {showDesc && (
              <FieldControls
                field={descField}
                onChange={(k, v) => setDescField(p => ({ ...p, [k]: v } as RichTextField))}
                fonts={allFonts}
                showColor={showDescColor}
                onToggleColor={() => setShowDescColor(p => !p)}
                onCloseColor={() => setShowDescColor(false)}
              />
            )}
          </section>

          <div className="p-3 bg-parchment-50 rounded-lg border border-parchment-300 text-xs text-ink-500 leading-relaxed">
            <strong className="text-ink-700">Tip:</strong> Drag the coloured dots on the canvas to reposition fields. Resize the description box by dragging its bottom-right corner.
          </div>
        </div>

        <div className="p-5 border-t border-ink-100 flex-shrink-0">
          <button onClick={handleSave} disabled={saving}
                  className={`w-full btn-primary justify-center py-3 transition-colors ${saved ? '!bg-green-700' : ''}`}>
            {saving
              ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg> Saving…</>
              : saved
              ? <>✓ Saved!</>
              : <><Save size={16}/> Save Configuration</>
            }
          </button>
        </div>
      </aside>

      {/* ─── Canvas area ─── */}
      <div className="flex-1 bg-ink-100 overflow-auto flex items-center justify-center p-6" ref={canvasRef}>
        <div className="relative canvas-shadow rounded-lg overflow-hidden select-none"
             style={{ maxWidth: '100%', maxHeight: '85vh', display: 'inline-block' }}>

          {template.file_type === 'png' ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              ref={imgRef}
              src={templateUrl}
              alt={template.name}
              className="block max-w-full"
              style={{ maxHeight: '85vh', objectFit: 'contain' }}
              onLoad={e => {
                const img = e.currentTarget;
                setImgLoaded(true);
                setImgNatW(img.naturalWidth);
                setImgNatH(img.naturalHeight);
              }}
              draggable={false}
            />
          ) : (
            <div ref={imgRef as React.RefObject<HTMLDivElement>}
                 className="w-[800px] h-[566px] bg-white flex items-center justify-center"
                 onLoad={() => setImgLoaded(true)}>
              <p className="text-ink-400 text-sm">PDF template — field positions shown as overlays</p>
            </div>
          )}

          {/* Overlays — shown once image is measured */}
          {(imgLoaded || template.file_type === 'pdf') && (
            <>
              {/* Name dot */}
              <div
                className="absolute cursor-move group z-10"
                style={{
                  left:      `${nameField.x * 100}%`,
                  top:       `${nameField.y * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                onMouseDown={e => startDrag(e, 'name')}>
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap
                                opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                  Name
                </div>
                <div className="w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-md hover:scale-125 transition-transform"/>
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
                    fontSize:    Math.min(nameField.font_size * (imgRef.current ? imgRef.current.clientWidth / imgNatW : 1), 36),
                    color:       nameField.font_color,
                    textShadow:  '0 0 6px rgba(255,255,255,0.9)',
                    whiteSpace:  'nowrap',
                  }}>
                    Recipient Name
                  </span>
                </div>
              </div>

              {/* Description box */}
              {showDesc && (
                <div
                  className="absolute cursor-move group z-10"
                  style={{
                    left:   `${(descField.x - descField.width / 2) * 100}%`,
                    top:    `${descField.y * 100}%`,
                    width:  `${descField.width * 100}%`,
                    height: `${descField.height * 100}%`,
                    border: '2px dashed rgba(245,158,11,0.8)',
                    borderRadius: 4,
                    background: 'rgba(245,158,11,0.06)',
                    minWidth: 40, minHeight: 20,
                  }}
                  onMouseDown={e => startDrag(e, 'description')}>
                  <div className="absolute -top-6 left-0 bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded
                                  whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
                    Description (drag to move)
                  </div>
                  <div
                    className="w-full h-full overflow-hidden pointer-events-none p-1"
                    style={{
                      fontFamily: descField.font_family,
                      fontSize:   Math.min(descField.font_size * (imgRef.current ? imgRef.current.clientWidth / imgNatW : 1), 20),
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── FieldControls sub-component ─── */
function FieldControls({
  field, onChange, fonts, showColor, onToggleColor, onCloseColor,
  showCaseTransform = false, showAutoSize = false,
}: {
  field: TextField | RichTextField;
  onChange: (key: string, value: unknown) => void;
  fonts: string[];
  showColor: boolean;
  onToggleColor: () => void;
  onCloseColor: () => void;
  showCaseTransform?: boolean;
  showAutoSize?: boolean;
}) {
  return (
    <div className="space-y-3.5">
      {/* Font family */}
      <div>
        <label className="label">Font Family</label>
        <div className="relative">
          <select value={field.font_family} onChange={e => onChange('font_family', e.target.value)}
                  className="input pr-8 appearance-none cursor-pointer" style={{ fontFamily: field.font_family }}>
            {fonts.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 pointer-events-none"/>
        </div>
      </div>

      {/* Font size */}
      <div>
        <label className="label">Font Size <span className="text-ink-400 normal-case font-normal">(px at full resolution)</span></label>
        <div className="flex items-center gap-2">
          <input type="range" min={8} max={120} value={field.font_size}
                 onChange={e => onChange('font_size', +e.target.value)}
                 className="flex-1 accent-ink-900"/>
          <input type="number" min={8} max={200} value={field.font_size}
                 onChange={e => onChange('font_size', Math.max(8, Math.min(200, +e.target.value)))}
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
      {'max_width' in field && (
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
            style={{ fontFamily: field.font_family, fontSize: Math.min((field as RichTextField).font_size * 0.7, 16) }}
            onInput={e => onChange('content', (e.target as HTMLDivElement).innerHTML)}
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
