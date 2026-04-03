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

/**
 * Draw multi-line rich HTML text onto a canvas.
 * Strips HTML tags for canvas rendering (plain text fallback).
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/**
 * Wrap text into lines that fit within maxWidth pixels.
 */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line); line = word;
      } else { line = test; }
    }
    if (line) lines.push(line);
    if (!para) lines.push('');
  }
  return lines;
}

interface RenderOptions {
  name: string;
  descriptionHtml?: string;
  template: Template;
  config: TemplateConfig;
  templateImageBitmap: ImageBitmap;
  scale?: number; // output scale multiplier (default 1)
}

export async function renderCertificate(opts: RenderOptions): Promise<HTMLCanvasElement> {
  const { name, descriptionHtml, template, config, templateImageBitmap } = opts;
  const scale = opts.scale ?? 1;

  const W = template.width  * scale;
  const H = template.height * scale;

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

  /* ─── Description field ─── */
  if (config.description_field && descriptionHtml !== undefined) {
    const df = config.description_field as RichTextField;
    const plain  = stripHtml(descriptionHtml || df.content || '');
    if (plain.trim()) {
      // df.x is the LEFT edge of the box (stored as fraction)
      const dLeft  = (df.x - df.width / 2) * W;
      const dy     = df.y * H;
      const dw     = df.width  * W;
      const dh     = df.height * H;
      const dFontSize = df.font_size * scale;

      ctx.save();
      ctx.font      = `${dFontSize}px "${df.font_family}"`;
      ctx.fillStyle = df.font_color;
      ctx.textAlign = df.alignment as CanvasTextAlign;
      ctx.textBaseline = 'top';

      const lines  = wrapText(ctx, plain, dw);
      const lineH  = dFontSize * 1.4;
      const totalH = lines.length * lineH;
      const startY = dy + Math.max(0, (dh - totalH) / 2);

      // Compute X anchor based on alignment
      const textX = df.alignment === 'left'   ? dLeft :
                    df.alignment === 'right'  ? dLeft + dw :
                    dLeft + dw / 2; // center

      lines.forEach((line, i) => {
        ctx.fillText(line, textX, startY + i * lineH, dw);
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
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

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
