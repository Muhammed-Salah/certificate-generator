import type { Template, TemplateConfig, TextField, RichTextField } from '@/types';

export function applyCase(text: string, transform: TextField['case_transform']): string {
  switch (transform) {
    case 'uppercase':  return text.toUpperCase();
    case 'lowercase':  return text.toLowerCase();
    case 'capitalize': return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    case 'titlecase':  return text.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
    case 'small-caps': return text; // Font variant handles small-caps, so leave original casing intact
    default:           return text;
  }
}

/**
 * Measure text width on a canvas context.
 */
function measureText(ctx: CanvasRenderingContext2D, text: string, fontSize: number, font: string): number {
  ctx.font = `${fontSize}px "${font}"`;
  return ctx.measureText(text).width;
}

/**
 * Auto-shrink font size until text fits within maxPx.
 */
function fitFontSize(ctx: CanvasRenderingContext2D, text: string, font: string, desiredSize: number, maxPx: number): number {
  let size = desiredSize;
  while (size > 8 && measureText(ctx, text, size, font) > maxPx) {
    size = Math.max(8, size - 1);
  }
  return size;
}


interface RenderOptions {
  name: string;
  descriptionHtml?: string;
  customFieldsData?: Record<string, string>;
  template: Template;
  config: TemplateConfig;
  templateImageBitmap: ImageBitmap;
  scale?: number; // output scale multiplier (default 1)
}

export async function renderCertificate(opts: RenderOptions): Promise<HTMLCanvasElement> {
  const { name, descriptionHtml, customFieldsData, template, config, templateImageBitmap } = opts;
  const scale = opts.scale ?? 1;

  // Use the bitmap as source of truth for proportions to avoid stretching
  let W = template.width * scale;
  let H = template.height * scale;

  const bitmapAR = templateImageBitmap.width / templateImageBitmap.height;
  const templateAR = W / H;

  // If aspect ratios differ by more than 1%, trust the bitmap
  if (Math.abs(bitmapAR - templateAR) > 0.01) {
    if (template.file_type === 'pdf') {
       // loadPdfPageBitmap uses scale:2, so we normalize here
       W = (templateImageBitmap.width / 2) * scale;
       H = (templateImageBitmap.height / 2) * scale;
    } else {
       // Maintain the mapped width but adjust height to match original image
       H = W / bitmapAR;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Draw template
  ctx.drawImage(templateImageBitmap, 0, 0, W, H);

  /* ─── Name field ─── */
  const nf = config.name_field;
  const displayName = applyCase(name.trim(), nf.case_transform);
  const nx = nf.x * W;
  const ny = nf.y * H;
  const maxW = nf.max_width * W;

  let fontSize = nf.font_size * scale;
  if (nf.auto_size) {
    fontSize = fitFontSize(ctx, displayName, nf.font_family, fontSize, maxW);
  }

  ctx.save();
  ctx.font = `${nf.case_transform === 'small-caps' ? 'small-caps ' : ''}${fontSize}px "${nf.font_family}"`;
  ctx.fillStyle = nf.font_color;
  ctx.textAlign = nf.alignment as CanvasTextAlign;
  ctx.textBaseline = 'middle';
  ctx.fillText(displayName, nx, ny, maxW);
  ctx.restore();

  /* ─── Additional custom fields ─── */
  if (config.additional_fields && customFieldsData) {
    for (const field of config.additional_fields) {
      const val = customFieldsData[field.id] || '';
      if (!val.trim()) continue;

      const dispVal = applyCase(val.trim(), field.case_transform);
      const fx = field.x * W;
      const fy = field.y * H;
      const fMaxW = field.max_width * W;

      let fFontSize = field.font_size * scale;
      if (field.auto_size) {
        fFontSize = fitFontSize(ctx, dispVal, field.font_family, fFontSize, fMaxW);
      }

      ctx.save();
      ctx.font = `${field.case_transform === 'small-caps' ? 'small-caps ' : ''}${fFontSize}px "${field.font_family}"`;
      ctx.fillStyle = field.font_color;
      ctx.textAlign = field.alignment as CanvasTextAlign;
      ctx.textBaseline = 'middle';
      ctx.fillText(dispVal, fx, fy, fMaxW);
      ctx.restore();
    }
  }

  /* ─── Description field ─── */
  if (config.description_field && descriptionHtml !== undefined) {
    const df = config.description_field as RichTextField;
    const currentHtml = (descriptionHtml || df.content || '').trim();
    if (currentHtml) {
      const dLeft  = (df.x - df.width / 2) * W;
      const dy     = df.y * H;
      const dw     = df.width  * W;
      const dh     = df.height * H;
      const dFontSize = df.font_size * scale;
      const lineH     = dFontSize * 1.35; // slightly tighter for certificates usually

      ctx.save();
      
      // Part 1: Parsing HTML into Fragments
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${currentHtml}</div>`, 'text/html');
      
      interface Fragment {
        text: string;
        bold: boolean;
        italic: boolean;
        underline: boolean;
        isNewline?: boolean;
      }
      
      const fragments: Fragment[] = [];
      const traverse = (node: Node, style: { bold: boolean; italic: boolean; underline: boolean }) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent || '';
          if (text) {
            fragments.push({ text, ...style });
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          const tag = el.tagName.toLowerCase();
          const newStyle = { ...style };
          
          if (tag === 'b' || tag === 'strong') newStyle.bold = true;
          if (tag === 'i' || tag === 'em')     newStyle.italic = true;
          if (tag === 'u')                     newStyle.underline = true;
          
          if (tag === 'br') {
            fragments.push({ text: '\n', ...style, isNewline: true });
          } else if (tag === 'p' || tag === 'div') {
            // Check if not the first block-level to avoid extra space at top
            if (fragments.length > 0 && !fragments[fragments.length-1].isNewline) {
              fragments.push({ text: '\n', ...style, isNewline: true });
            }
          }
          
          for (const child of Array.from(el.childNodes)) {
            traverse(child, newStyle);
          }
          
          if (tag === 'p' || tag === 'div') {
            fragments.push({ text: '\n', ...style, isNewline: true });
          }
        }
      };
      
      traverse(doc.body.firstChild!, { bold: false, italic: false, underline: false });

      // Part 2: Linearize and Wrap
      interface StyledLine {
        width: number;
        items: { text: string; width: number; bold: boolean; italic: boolean; underline: boolean }[];
      }
      
      const lines: StyledLine[] = [];
      let currentLine: StyledLine = { width: 0, items: [] };

      // Helper to set font based on style
      const setCtxFont = (bold: boolean, italic: boolean) => {
        ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${dFontSize}px "${df.font_family}"`;
      };

      fragments.forEach(frag => {
        if (frag.text === '\n') {
          lines.push(currentLine);
          currentLine = { width: 0, items: [] };
          return;
        }

        // Split text into words but keep spaces
        const words = frag.text.split(/(\s+)/);
        
        words.forEach(word => {
          if (!word) return;
          setCtxFont(frag.bold, frag.italic);
          const w = ctx.measureText(word).width;

          if (currentLine.width + w > dw && currentLine.items.length > 0 && word.trim()) {
            lines.push(currentLine);
            // If it's a space that caused the overflow, skip it if it's leading
            currentLine = { width: 0, items: [] };
            if (word.trim()) {
               currentLine.items.push({ text: word, width: w, bold: frag.bold, italic: frag.italic, underline: frag.underline });
               currentLine.width = w;
            }
          } else {
            currentLine.items.push({ text: word, width: w, bold: frag.bold, italic: frag.italic, underline: frag.underline });
            currentLine.width += w;
          }
        });
      });
      lines.push(currentLine);

      // Filter out any trailing line breaks caused by block tags
      const renderedLines = lines.filter((l, idx) => l.width > 0 || (idx < lines.length - 1 && lines[idx+1].width > 0));

      const totalH = renderedLines.length * lineH;
      const startY = dy + Math.max(0, (dh - totalH) / 2);

      // Part 3: Render
      renderedLines.forEach((line, i) => {
        let xOffset = 0;
        if (df.alignment === 'center') xOffset = (dw - line.width) / 2;
        else if (df.alignment === 'right') xOffset = dw - line.width;

        let cursorX = dLeft + xOffset;
        const lineY = startY + (i * lineH);

        line.items.forEach(item => {
          setCtxFont(item.bold, item.italic);
          ctx.fillStyle = df.font_color;
          ctx.textBaseline = 'top';
          ctx.fillText(item.text, cursorX, lineY);
          
          if (item.underline) {
            ctx.beginPath();
            ctx.lineWidth = Math.max(1, dFontSize / 15);
            ctx.moveTo(cursorX, lineY + dFontSize * 0.95);
            ctx.lineTo(cursorX + item.width, lineY + dFontSize * 0.95);
            ctx.strokeStyle = df.font_color;
            ctx.stroke();
          }
          
          cursorX += item.width;
        });
      });
      
      ctx.restore();
    }
  }

  return canvas;
}

/**
 * Load an image URL as ImageBitmap (browser only).
 */
export async function loadImageBitmap(url: string): Promise<ImageBitmap> {
  const res  = await fetch(url);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

/**
 * Load a PDF page as ImageBitmap using pdfjs-dist (browser only).
 */
export async function loadPdfPageBitmap(url: string, pageNum = 1): Promise<{ bitmap: ImageBitmap; width: number; height: number }> {
  const pdfjsLib = await import('pdfjs-dist');
  // Use a hardcoded version as fallback if pdfjsLib.version is missing during bundle
  const version = pdfjsLib.version || '4.4.168';
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

  const pdf  = await pdfjsLib.getDocument(url).promise;
  const page = await pdf.getPage(pageNum);
  const vp   = page.getViewport({ scale: 2 }); // 2× for quality

  const canvas = document.createElement('canvas');
  canvas.width  = vp.width;
  canvas.height = vp.height;
  const ctx = canvas.getContext('2d')!;
  await page.render({ canvasContext: ctx as CanvasRenderingContext2D, viewport: vp }).promise;

  const bitmap = await createImageBitmap(canvas);
  return { bitmap, width: vp.width, height: vp.height };
}

/**
 * Convert canvas to a PNG Blob.
 */
export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => {
    canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/png', 1.0);
  });
}

/**
 * Convert canvas to PDF Blob using jsPDF.
 */
export async function canvasToPdfBlob(canvas: HTMLCanvasElement, _filename: string): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const W  = canvas.width;
  const H  = canvas.height;
  const or = W > H ? 'l' : 'p';
  // Use pt units: 1px = 0.75pt at 96dpi
  const ptW = W * 0.75;
  const ptH = H * 0.75;
  const pdf = new jsPDF({ orientation: or, unit: 'pt', format: [ptW, ptH] });
  const dataUrl = canvas.toDataURL('image/png', 1.0);
  pdf.addImage(dataUrl, 'PNG', 0, 0, ptW, ptH, undefined, 'FAST');
  return pdf.output('blob');
}

/**
 * Merge multiple canvases into a single multi-page PDF Blob.
 */
export async function canvasesToMergedPdf(canvases: HTMLCanvasElement[]): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  if (canvases.length === 0) throw new Error('No canvases');

  const first = canvases[0];
  const W = first.width, H = first.height;
  const or = W > H ? 'l' : 'p';
  const ptW = W * 0.75, ptH = H * 0.75;
  const pdf = new jsPDF({ orientation: or, unit: 'pt', format: [ptW, ptH] });

  for (let i = 0; i < canvases.length; i++) {
    if (i > 0) pdf.addPage([ptW, ptH], or);
    const dataUrl = canvases[i].toDataURL('image/png', 1.0);
    pdf.addImage(dataUrl, 'PNG', 0, 0, ptW, ptH, undefined, 'FAST');
  }
  return pdf.output('blob');
}

/**
 * Pack multiple blobs into a ZIP file.
 */
export async function blobsToZip(
  entries: { name: string; blob: Blob }[],
  zipName: string
): Promise<void> {
  const JSZip = (await import('jszip')).default;
  const zip   = new JSZip();
  for (const { name, blob } of entries) zip.file(name, blob);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  triggerDownload(blob, zipName);
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
