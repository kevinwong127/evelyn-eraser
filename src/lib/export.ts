import jsPDF from "jspdf";
import { Document, Packer, Paragraph, Table, TableRow, TableCell, WidthType, BorderStyle, ImageRun, TextRun, HeadingLevel, AlignmentType, PageBreak, TabStopPosition, TabStopType } from "docx";
import { saveAs } from "file-saver";

/**
 * Convert a base64 data URL to a Uint8Array
 */
function base64ToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1];
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Get image dimensions from a base64 data URL
 */
function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.src = dataUrl;
  });
}

/**
 * Get mime type from data URL
 */
function getMimeType(dataUrl: string): string {
  const match = dataUrl.match(/^data:(image\/\w+);base64,/);
  return match ? match[1] : "image/png";
}

export type WorksheetPair = {
  original: string;
  cleaned: string;
  name?: string;
};

export type ExtractedSection = {
  type: "heading" | "paragraph" | "question" | "instruction" | "table" | "list";
  content: string;
  number?: string;
  indent?: number;
  rows?: string[][];
  children?: { type: string; content: string; number?: string }[];
};

export type ExtractedData = {
  title?: string;
  sections: ExtractedSection[];
};

// ==================== IMAGE-BASED EXPORTS ====================

export async function generatePDF(originalImage: string, cleanedImage: string): Promise<void>;
export async function generatePDF(pairs: WorksheetPair[]): Promise<void>;
export async function generatePDF(
  firstArg: string | WorksheetPair[],
  secondArg?: string
): Promise<void> {
  const pairs: WorksheetPair[] = Array.isArray(firstArg)
    ? firstArg
    : [{ original: firstArg, cleaned: secondArg! }];

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  for (let i = 0; i < pairs.length; i++) {
    if (i > 0) pdf.addPage();
    const { cleaned } = pairs[i];

    const dims = await getImageDimensions(cleaned);
    const aspectRatio = dims.height / dims.width;
    const imgHeight = contentWidth * aspectRatio;
    const yStart = margin;
    const maxHeight = pageHeight - margin * 2;
    const finalHeight = Math.min(imgHeight, maxHeight);
    const finalWidth = finalHeight / aspectRatio;
    const centeredX = margin + (contentWidth - finalWidth) / 2;
    const centeredY = margin + (maxHeight - finalHeight) / 2;
    pdf.addImage(cleaned, getMimeType(cleaned) === "image/png" ? "PNG" : "JPEG", centeredX, centeredY, finalWidth, finalHeight);
  }

  const baseName = pairs[0]?.name || "worksheet";
  pdf.save(pairs.length > 1 ? `${baseName}-batch.pdf` : `${baseName}.pdf`);
}

export async function generateDOCX(originalImage: string, cleanedImage: string): Promise<void>;
export async function generateDOCX(pairs: WorksheetPair[]): Promise<void>;
export async function generateDOCX(
  firstArg: string | WorksheetPair[],
  secondArg?: string
): Promise<void> {
  const pairs: WorksheetPair[] = Array.isArray(firstArg)
    ? firstArg
    : [{ original: firstArg, cleaned: secondArg! }];

  const maxWidth = 550;
  const children: Paragraph[] = [];

  for (let i = 0; i < pairs.length; i++) {
    const { cleaned } = pairs[i];
    if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }));

    const cleanedDims = await getImageDimensions(cleaned);
    const cleanScale = Math.min(1, maxWidth / cleanedDims.width);

    children.push(
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: base64ToUint8Array(cleaned), transformation: { width: Math.round(cleanedDims.width * cleanScale), height: Math.round(cleanedDims.height * cleanScale) }, type: "png" })] })
    );
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBlob(doc);
  const baseName = pairs[0]?.name || "worksheet";
  saveAs(buffer, pairs.length > 1 ? `${baseName}-batch.docx` : `${baseName}.docx`);
}

// ==================== TEXT-BASED EXPORTS (Editable) ====================

export async function generateTextPDF(extractedDataList: { data: ExtractedData; name: string }[]) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;

  // Build HTML content for each page
  const container = document.createElement("div");
  container.style.cssText = `position:fixed;left:-9999px;top:0;width:${(pageWidth - margin * 2) * 3.78}px;font-family:"Noto Sans TC","Microsoft JhengHei","PingFang TC","Heiti TC",sans-serif;color:#000;background:#fff;`;

  for (let di = 0; di < extractedDataList.length; di++) {
    const { data, name } = extractedDataList[di];
    const page = document.createElement("div");
    page.style.cssText = `padding:0;margin:0;`;
    if (di > 0) page.style.pageBreakBefore = "always";

    // Title — only show if extracted data has a real title (not filename)
    if (data.title && data.title.trim()) {
      const title = document.createElement("h1");
      title.textContent = data.title;
      title.style.cssText = "font-size:18px;font-weight:bold;margin:0 0 8px 0;";
      page.appendChild(title);

      const hr = document.createElement("hr");
      hr.style.cssText = "border:none;border-top:1px solid #ccc;margin:0 0 8px 0;";
      page.appendChild(hr);
    }

    for (const section of data.sections) {
      // Skip sections with null/empty content
      if (!section.content || section.content === "null") continue;
      const indent = (section.indent || 0) * 16;
      const el = document.createElement("div");
      el.style.cssText = `margin-left:${indent}px;margin-bottom:4px;`;

      switch (section.type) {
        case "heading":
          el.style.cssText += "font-size:14px;font-weight:bold;margin-top:8px;";
          el.textContent = section.content;
          break;
        case "instruction":
          el.style.cssText += "font-size:10px;font-style:italic;color:#666;";
          el.textContent = section.content;
          break;
        case "question": {
          el.style.cssText += "font-size:11px;margin-top:4px;";
          const qPrefix = section.number ? `${section.number}. ` : "";
          el.textContent = qPrefix + section.content;
          if (section.children) {
            for (const child of section.children) {
              if (!child.content || child.content === "null") continue;
              const cel = document.createElement("div");
              cel.style.cssText = `margin-left:16px;font-size:10px;margin-top:2px;`;
              const cp = child.number ? `${child.number}) ` : child.type === "option" ? "○ " : "";
              cel.textContent = cp + child.content;
              el.appendChild(cel);
            }
          }
          break;
        }
        case "table":
          el.style.cssText += "font-size:9px;font-family:'Courier New',monospace;white-space:pre-wrap;";
          el.textContent = section.content;
          break;
        case "list": {
          el.style.cssText += "font-size:10px;";
          const lp = section.number ? `${section.number}. ` : "• ";
          el.textContent = lp + section.content;
          break;
        }
        default:
          el.style.cssText += "font-size:11px;";
          el.textContent = section.content;
          break;
      }
      page.appendChild(el);
    }
    container.appendChild(page);
  }

  document.body.appendChild(container);

  try {
    await pdf.html(container, {
      margin: [margin, margin, margin, margin],
      autoPaging: "text",
      width: pageWidth - margin * 2,
      windowWidth: (pageWidth - margin * 2) * 3.78,
      html2canvas: { scale: 3.78, useCORS: true },
    });

    // Remove blank first page if generated
    if (pdf.getNumberOfPages() > 1) {
      // Check if first page is blank (jsPDF html() sometimes adds one)
    }

    const baseName = extractedDataList[0]?.name || "worksheet";
    pdf.save(extractedDataList.length > 1 ? `${baseName}-text-batch.pdf` : `${baseName}-text.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

export async function generateTextDOCX(extractedDataList: { data: ExtractedData; name: string }[]) {
  const children: (Paragraph | Table)[] = [];

  for (let di = 0; di < extractedDataList.length; di++) {
    if (di > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    const { data, name } = extractedDataList[di];

    // Only add title if extracted data has a real title
    if (data.title && data.title.trim()) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { after: 200 }, children: [new TextRun({ text: data.title, bold: true })] }));
    }

    for (const section of data.sections) {
      if (!section.content || section.content === "null") continue;
      const indentMM = (section.indent || 0) * 720;
      switch (section.type) {
        case "heading":
          children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 }, indent: { left: indentMM }, children: [new TextRun({ text: section.content, bold: true })] })); break;
        case "instruction":
          children.push(new Paragraph({ spacing: { before: 100, after: 100 }, indent: { left: indentMM }, children: [new TextRun({ text: section.content, italics: true, size: 20, color: "666666" })] })); break;
        case "question":
          const qp = section.number ? `${section.number}. ` : "";
          children.push(new Paragraph({ spacing: { before: 120, after: 60 }, indent: { left: indentMM }, children: [new TextRun({ text: qp + section.content, size: 22 })] }));
          if (section.children) {
            for (const child of section.children) {
              if (!child.content || child.content === "null") continue;
              const cp = child.number ? `${child.number}) ` : child.type === "option" ? "○  " : "";
              children.push(new Paragraph({ spacing: { before: 40, after: 40 }, indent: { left: indentMM + 360 }, children: [new TextRun({ text: cp + child.content, size: 20 })] }));
            }
          } break;
        case "table":
          if (Array.isArray(section.rows) && section.rows.length > 0) {
            const rows = section.rows.map((r) => (Array.isArray(r) ? r.map((c) => (c == null || c === "null" ? "" : String(c))) : [String(r ?? "")]));
            const cols = Math.max(...rows.map((r) => r.length), 1);
            const total = 9000;
            const w = Math.floor(total / cols);
            const b = { style: BorderStyle.SINGLE, size: 6, color: "000000" };
            children.push(new Table({
              width: { size: w * cols, type: WidthType.DXA },
              columnWidths: Array(cols).fill(w),
              rows: rows.map((r) => new TableRow({
                children: Array.from({ length: cols }, (_, i) => new TableCell({
                  width: { size: w, type: WidthType.DXA },
                  borders: { top: b, bottom: b, left: b, right: b },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: String(r[i] ?? "").split("\n").map((line) => new Paragraph({ children: [new TextRun({ text: line, size: 22 })] })),
                })),
              })),
            }));
            children.push(new Paragraph({ spacing: { after: 100 }, children: [] }));
            break;
          }
          children.push(new Paragraph({ spacing: { before: 100, after: 100 }, indent: { left: indentMM }, children: [new TextRun({ text: section.content, font: "Courier New", size: 18 })] })); break;
        case "list":
          const lp = section.number ? `${section.number}. ` : "•  ";
          children.push(new Paragraph({ spacing: { before: 60, after: 60 }, indent: { left: indentMM }, children: [new TextRun({ text: lp + section.content, size: 22 })] })); break;
        default:
          children.push(new Paragraph({ spacing: { before: 80, after: 80 }, indent: { left: indentMM }, children: [new TextRun({ text: section.content, size: 22 })] })); break;
      }
    }
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBlob(doc);
  const baseName = extractedDataList[0]?.name || "worksheet";
  saveAs(buffer, extractedDataList.length > 1 ? `${baseName}-text-batch.docx` : `${baseName}-text.docx`);
}
