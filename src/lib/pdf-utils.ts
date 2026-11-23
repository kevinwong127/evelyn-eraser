import * as pdfjsLib from "pdfjs-dist";

// Use the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs`;

/**
 * Convert a PDF file (as data URL or ArrayBuffer) into an array of page images (data URLs).
 * Each page is rendered at the given scale (default 2x for good quality).
 */
export async function pdfToImages(
  file: File,
  scale = 2
): Promise<{ dataUrl: string; pageNum: number }[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const results: { dataUrl: string; pageNum: number }[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;

    await page.render({ canvasContext: ctx, viewport }).promise;
    results.push({
      dataUrl: canvas.toDataURL("image/jpeg", 0.92),
      pageNum: i,
    });
  }

  return results;
}
