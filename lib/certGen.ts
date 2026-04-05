import type { Template, TemplateConfig, TextField, RichTextField } from '@/types';
import { PDFDocument, rgb, degrees, StandardFonts, PDFFont } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { fetchGoogleFontBytes } from './googleFonts';
import { replacePlaceholders } from './placeholderUtils';

// Helper to convert hex to RGB for pdf-lib
function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  } : { r: 0, g: 0, b: 0 };
}

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
function measureText(ctx: CanvasRenderingContext2D, text: string, fontSize: number, font: string, fontWeight: number = 400): number {
  ctx.font = `${fontWeight} ${fontSize}px "${font}"`;
  return ctx.measureText(text).width;
}

/**
 * Auto-shrink font size until text fits within maxPx.
 */
function fitFontSize(ctx: CanvasRenderingContext2D, text: string, font: string, desiredSize: number, maxPx: number, fontWeight: number = 400): number {
  let size = desiredSize;
  while (size > 8 && measureText(ctx, text, size, font, fontWeight) > maxPx) {
    size = Math.max(8, size - 1);
  }
  return size;
}


interface RenderOptions {
  name: string;
  descriptionHtml?: string;
  placeholdersData?: Record<string, string>;
  customFieldsData?: Record<string, string>;
  template: Template;
  templateUrl?: string; // Full public Supabase URL for native PDF manipulation
  config: TemplateConfig;
  templateImageBitmap: ImageBitmap | null; // Null if using fidelityPdf path
  scale?: number; // output scale multiplier (default 1)
}

/**
 * Native PDF Manipulation using pdf-lib
 * Preserves original quality by drawing on top of template objects.
 */
export async function renderFidelityPdf(opts: RenderOptions, fontBytes: Record<string, ArrayBuffer>): Promise<Uint8Array> {
  const { name, descriptionHtml, placeholdersData, customFieldsData, template, config, templateUrl } = opts;
  
  if (!templateUrl) throw new Error('templateUrl is required for native PDF manipulation');
  
  // Load original template bytes
  const response = await fetch(templateUrl);
  const templateBytes = await response.arrayBuffer();
  
  let pdfDoc: PDFDocument;
  let page;
  let width: number, height: number;

  if (template.file_type === 'pdf') {
     pdfDoc = await PDFDocument.load(templateBytes);
     page = pdfDoc.getPages()[0];
     const size = page.getSize();
     width = size.width;
     height = size.height;
  } else {
     pdfDoc = await PDFDocument.create();
     // Check for PNG or JPG
     let img;
     try {
       img = await pdfDoc.embedPng(templateBytes);
     } catch (e) {
       img = await pdfDoc.embedJpg(templateBytes);
     }
     page = pdfDoc.addPage([img.width, img.height]);
     page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
     width = img.width;
     height = img.height;
  }

  pdfDoc.registerFontkit(fontkit);
  
  // Embed fonts
  const embeddedFonts: Record<string, PDFFont> = {};
  const neededFonts = new Set<{ family: string; weight: number }>();
  neededFonts.add({ family: config.name_field.font_family,     weight: config.name_field.font_weight || 400 });
  if (config.description_field) {
    neededFonts.add({ family: config.description_field.font_family, weight: config.description_field.font_weight || 400 });
  }
  (config.additional_fields || []).forEach((f: TextField) => {
    neededFonts.add({ family: f.font_family, weight: f.font_weight || 400 });
  });

  for (const { family, weight } of Array.from(neededFonts)) {
    const key = `${family}-${weight}`;
    if (fontBytes[key]) {
      embeddedFonts[key] = await pdfDoc.embedFont(fontBytes[key]);
    } else if (fontBytes[family]) {
      embeddedFonts[key] = await pdfDoc.embedFont(fontBytes[family]);
    } else {
      // Try to fetch Google Font on the fly if not provided
      const bytes = await fetchGoogleFontBytes(family, weight);
      if (bytes) {
        embeddedFonts[key] = await pdfDoc.embedFont(bytes);
      }
    }
  }
  const standardFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const getFont = (family: string, weight?: number) => {
    const key = `${family}-${weight || 400}`;
    return embeddedFonts[key] || embeddedFonts[family] || standardFont;
  };

  /* ─── Name field ─── */
  const nf = config.name_field;
  const displayName = applyCase(name.trim(), nf.case_transform);
  const font = getFont(nf.font_family, nf.font_weight);
  const color = hexToRgb(nf.font_color);
  
  let fontSize = nf.font_size * 0.75; // Convert px to pt approx
  const nx = nf.x * width;
  const ny = height - (nf.y * height); // PDF coordinates are bottom-up
  const maxW = nf.max_width * width;

  if (nf.auto_size) {
    let currentW = font.widthOfTextAtSize(displayName, fontSize);
    while (currentW > maxW && fontSize > 6) {
      fontSize -= 0.5;
      currentW = font.widthOfTextAtSize(displayName, fontSize);
    }
  }

  let textX = nx;
  if (nf.alignment === 'center') textX -= font.widthOfTextAtSize(displayName, fontSize) / 2;
  else if (nf.alignment === 'right') textX -= font.widthOfTextAtSize(displayName, fontSize);

  page.drawText(displayName, {
    x: textX,
    y: ny - (fontSize / 4), // Visual vertical middle adjustment
    size: fontSize,
    font,
    color: rgb(color.r, color.g, color.b),
  });

  /* ─── Additional custom fields ─── */
  if (config.additional_fields && customFieldsData) {
    for (const field of config.additional_fields) {
      const val = customFieldsData[field.id] || '';
      if (!val.trim()) continue;

      const dispVal = applyCase(val.trim(), field.case_transform);
      const fFont = getFont(field.font_family, field.font_weight);
      const fColor = hexToRgb(field.font_color);
      let fSize = field.font_size * 0.75;
      const fx = field.x * width;
      const fy = height - (field.y * height);
      const fkMaxW = field.max_width * width;

      if (field.auto_size) {
        let cw = fFont.widthOfTextAtSize(dispVal, fSize);
        while (cw > fkMaxW && fSize > 6) { fSize -= 0.5; cw = fFont.widthOfTextAtSize(dispVal, fSize); }
      }

      let tx = fx;
      if (field.alignment === 'center') tx -= fFont.widthOfTextAtSize(dispVal, fSize) / 2;
      else if (field.alignment === 'right') tx -= fFont.widthOfTextAtSize(dispVal, fSize);

      page.drawText(dispVal, {
        x: tx, y: fy - (fSize / 4), size: fSize, font: fFont, color: rgb(fColor.r, fColor.g, fColor.b),
      });
    }
  }

  /* ─── Description field (Rich Text-aware for PDF) ─── */
  if (config.description_field && descriptionHtml) {
     const df = config.description_field;
     const dBoxW = df.width * width;
     const dFontSize = df.font_size * 0.75;

     const finalHtml = placeholdersData 
        ? replacePlaceholders(descriptionHtml, placeholdersData) 
        : descriptionHtml;

     const dColor = hexToRgb(df.font_color);
     const dFont = getFont(df.font_family, df.font_weight);
     const lineH = dFontSize * 1.35;

     const fragments = parseHtmlToFragments(finalHtml);
     
     interface StyledLine {
       width: number;
       items: { text: string; width: number; bold: boolean; italic: boolean; underline: boolean }[];
     }
     
     const lines: StyledLine[] = [];
     let currentLine: StyledLine = { width: 0, items: [] };

     fragments.forEach(frag => {
       if (frag.isNewline) {
         lines.push(currentLine);
         currentLine = { width: 0, items: [] };
         return;
       }
       const words = frag.text.split(/(\s+)/);
       words.forEach(word => {
         if (!word) return;
         const w = dFont.widthOfTextAtSize(word, dFontSize);
         if (currentLine.width + w > dBoxW && currentLine.items.length > 0 && word.trim()) {
           lines.push(currentLine);
           currentLine = { width: 0, items: [] };
           if (word.trim()) { 
             currentLine.items.push({ ...frag, text: word, width: w }); 
             currentLine.width = w; 
           }
         } else {
           currentLine.items.push({ ...frag, text: word, width: w });
           currentLine.width += w;
         }
       });
     });
     lines.push(currentLine);

     const renderedLines = lines.filter((l, idx) => l.width > 0 || (idx < lines.length - 1 && lines[idx+1].width > 0));
     const totalH = renderedLines.length * lineH;
     const dBoxYCenter = height - (df.y * height);
     const startY = dBoxYCenter + (totalH / 2);

     renderedLines.forEach((line, i) => {
        let lx = (df.x - df.width/2) * width;
        if (df.alignment === 'center') lx += (dBoxW - line.width) / 2;
        else if (df.alignment === 'right') lx += (dBoxW - line.width);

        const ly = startY - (i * lineH) - dFontSize;

        line.items.forEach(item => {
           page.drawText(item.text, {
             x: lx,
             y: ly,
             size: dFontSize,
             font: dFont,
             color: rgb(dColor.r, dColor.g, dColor.b),
           });
           
           if (item.underline) {
              page.drawLine({
                start: { x: lx, y: ly - 2 },
                end: { x: lx + item.width, y: ly - 2 },
                thickness: dFontSize / 15,
                color: rgb(dColor.r, dColor.g, dColor.b),
              });
           }
           lx += item.width;
        });
     });
  }

  return await pdfDoc.save();
}

interface Fragment {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  isNewline?: boolean;
}

function parseHtmlToFragments(html: string): Fragment[] {
  if (typeof window === 'undefined') return [{ text: html.replace(/<[^>]*>/g, ''), bold: false, italic: false, underline: false }];
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const fragments: Fragment[] = [];

  const traverse = (node: Node, style: { bold: boolean; italic: boolean; underline: boolean }) => {
    if (node.nodeType === 3) { // TEXT_NODE
      const text = node.textContent || '';
      if (text) fragments.push({ text, ...style });
    } else if (node.nodeType === 1) { // ELEMENT_NODE
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const newStyle = { ...style };
      if (tag === 'b' || tag === 'strong') newStyle.bold = true;
      if (tag === 'i' || tag === 'em') newStyle.italic = true;
      if (tag === 'u') newStyle.underline = true;
      
      if (tag === 'br') {
        fragments.push({ text: '\n', ...style, isNewline: true });
      } else if (tag === 'p' || tag === 'div') {
        if (fragments.length > 0 && !fragments[fragments.length-1].isNewline) {
          fragments.push({ text: '\n', ...style, isNewline: true });
        }
      }
      for (const child of Array.from(el.childNodes)) traverse(child, newStyle);
      if (tag === 'p' || tag === 'div') fragments.push({ text: '\n', ...style, isNewline: true });
    }
  };

  traverse(doc.body.firstChild!, { bold: false, italic: false, underline: false });
  return fragments;
}

export async function renderCertificate(opts: RenderOptions): Promise<HTMLCanvasElement> {
  const { name, descriptionHtml, placeholdersData, customFieldsData, template, config, templateImageBitmap } = opts;
  const scale = opts.scale || 1.0;
  if (!templateImageBitmap) throw new Error('Template image bitmap is required for canvas rendering');

  // Ensure all fonts are loaded before rendering
  const usedFonts = new Set<{ family: string; weight: number }>();
  usedFonts.add({ family: config.name_field.font_family, weight: config.name_field.font_weight || 400 });
  if (config.description_field) usedFonts.add({ family: config.description_field.font_family, weight: config.description_field.font_weight || 400 });
  (config.additional_fields || []).forEach((f: TextField) => usedFonts.add({ family: f.font_family, weight: f.font_weight || 400 }));

  await Promise.all(
    Array.from(usedFonts).map(({ family, weight }) => {
      if (!family) return Promise.resolve();
      return document.fonts.load(`${weight} 1em "${family}"`);
    })
  );
  await document.fonts.ready;

  // Use the bitmap as source of truth for proportions and baseline quality
  let W = template.width * scale;
  let H = template.height * scale;
  
  const bitmapAR = templateImageBitmap.width / templateImageBitmap.height;

  // If template is PDF, loadPdfPageBitmap gave us a 4x version of the points
  if (template.file_type === 'pdf') {
      W = (templateImageBitmap.width / 4) * scale;
      H = (templateImageBitmap.height / 4) * scale;
  } else {
      // If template is PNG, ensure we aren't downscaling if the user wants high quality
      if (scale > 1.0) {
          W = Math.max(W, templateImageBitmap.width);
          H = W / bitmapAR;
      }
  }

  const templateAR = (template.width * scale) / (template.height * scale);

  // If aspect ratios differ significantly from stored metadata, trust the bitmap proportions
  if (Math.abs(bitmapAR - templateAR) > 0.01 && template.file_type !== 'pdf') {
     H = W / bitmapAR;
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
  const nWeight = nf.font_weight || 400;
  if (nf.auto_size) {
    fontSize = fitFontSize(ctx, displayName, nf.font_family, fontSize, maxW, nWeight);
  }

  ctx.save();
  ctx.font = `${nWeight} ${nf.case_transform === 'small-caps' ? 'small-caps ' : ''}${fontSize}px "${nf.font_family}"`;
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
      const fWeight = field.font_weight || 400;
      if (field.auto_size) {
        fFontSize = fitFontSize(ctx, dispVal, field.font_family, fFontSize, fMaxW, fWeight);
      }

      ctx.save();
      ctx.font = `${fWeight} ${field.case_transform === 'small-caps' ? 'small-caps ' : ''}${fFontSize}px "${field.font_family}"`;
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
    const rawHtml = (descriptionHtml || df.content || '').trim();
    if (rawHtml) {
      const currentHtml = placeholdersData 
        ? replacePlaceholders(rawHtml, placeholdersData) 
        : rawHtml;
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
        const weight = bold ? 700 : (df.font_weight || 400);
        ctx.font = `${italic ? 'italic ' : ''}${weight} ${dFontSize}px "${df.font_family}"`;
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
  const vp   = page.getViewport({ scale: 4 }); // Use 4× (approx 288dpi) for ultra high resolution

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
