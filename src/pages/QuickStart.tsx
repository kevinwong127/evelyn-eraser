import { useState, useRef, useCallback } from "react";
import { protectPrintedContent, cropRectFromOriginal } from "@/lib/protect-print";
import { useNavigate } from "react-router-dom";
import { Camera, Upload, ArrowLeft, RotateCcw, Download, FileText, FileDown, Loader2, Plus, ScanLine, Crop } from "lucide-react";
import { pdfToImages } from "@/lib/pdf-utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { generatePDF, generateDOCX, generateTextPDF, generateTextDOCX, type WorksheetPair, type ExtractedData } from "@/lib/export";
import { Switch } from "@/components/ui/switch";
import WorksheetCard, { type WorksheetItem, type ProcessingStage } from "@/components/WorksheetCard";
import OutputModeSelector, { type OutputMode } from "@/components/OutputModeSelector";
import RegionSelector from "@/components/RegionSelector";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

let nextId = 0;
const makeId = () => `ws-${++nextId}`;

/** Compress image to max dimension and JPEG quality to reduce payload */
function compressImage(dataUrl: string, maxDim = 2000, quality = 0.85): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = dataUrl;
  });
}

/** Pre-process image for better scan optimization: auto-contrast stretch + mild sharpen */
function preprocessForScan(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, width, height);
      const d = imageData.data;

      // Auto-contrast: find actual min/max luminance and stretch histogram
      let minLum = 255, maxLum = 0;
      for (let i = 0; i < d.length; i += 4 * 4) { // sample every 4th pixel for speed
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (lum < minLum) minLum = lum;
        if (lum > maxLum) maxLum = lum;
      }
      const range = maxLum - minLum;
      if (range > 20 && range < 230) { // only stretch if there's room to improve
        const scale = 255 / range;
        for (let i = 0; i < d.length; i += 4) {
          d[i] = Math.min(255, Math.max(0, (d[i] - minLum) * scale));
          d[i + 1] = Math.min(255, Math.max(0, (d[i + 1] - minLum) * scale));
          d[i + 2] = Math.min(255, Math.max(0, (d[i + 2] - minLum) * scale));
        }
      }
      ctx.putImageData(imageData, 0, 0);

      // Mild unsharp mask for edge clarity
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tCtx = tempCanvas.getContext("2d")!;
      tCtx.filter = "blur(1.5px)";
      tCtx.drawImage(canvas, 0, 0);
      const blurred = tCtx.getImageData(0, 0, width, height);
      const sharp = ctx.getImageData(0, 0, width, height);
      const amount = 0.4; // mild sharpening
      for (let i = 0; i < sharp.data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          const diff = sharp.data[i + c] - blurred.data[i + c];
          sharp.data[i + c] = Math.min(255, Math.max(0, sharp.data[i + c] + diff * amount));
        }
      }
      ctx.putImageData(sharp, 0, 0);

      resolve(canvas.toDataURL("image/jpeg", 0.95));
    };
    img.src = dataUrl;
  });
}

/** Apply aggressive scanner-like post-processing: white background, high contrast, sharp text */
function postProcessScanEffect(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { width, height } = img;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, width, height);
      const d = imageData.data;

      // Pass 1: Adaptive white-balance — find the median bright pixel to correct color cast
      const samples: number[][] = [];
      for (let i = 0; i < d.length; i += 4 * 8) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (lum > 160) samples.push([d[i], d[i + 1], d[i + 2]]);
      }
      let rAvg = 255, gAvg = 255, bAvg = 255;
      if (samples.length > 10) {
        rAvg = samples.reduce((s, p) => s + p[0], 0) / samples.length;
        gAvg = samples.reduce((s, p) => s + p[1], 0) / samples.length;
        bAvg = samples.reduce((s, p) => s + p[2], 0) / samples.length;
      }
      const rScale = 255 / rAvg, gScale = 255 / gAvg, bScale = 255 / bAvg;

      // Pass 2: White-balance correction + aggressive threshold + contrast boost
      for (let i = 0; i < d.length; i += 4) {
        // Apply white balance
        let r = Math.min(255, d[i] * rScale);
        let g = Math.min(255, d[i + 1] * gScale);
        let b = Math.min(255, d[i + 2] * bScale);

        const lum = 0.299 * r + 0.587 * g + 0.114 * b;

        if (lum > 170) {
          // Push to pure white
          d[i] = d[i + 1] = d[i + 2] = 255;
        } else if (lum < 80) {
          // Dark text: push darker for contrast
          const factor = 1.8;
          const mid = 128;
          d[i] = Math.min(255, Math.max(0, mid + (r - mid) * factor));
          d[i + 1] = Math.min(255, Math.max(0, mid + (g - mid) * factor));
          d[i + 2] = Math.min(255, Math.max(0, mid + (b - mid) * factor));
        } else {
          // Mid-tones: strong contrast
          const factor = 1.6;
          const mid = 128;
          d[i] = Math.min(255, Math.max(0, mid + (r - mid) * factor));
          d[i + 1] = Math.min(255, Math.max(0, mid + (g - mid) * factor));
          d[i + 2] = Math.min(255, Math.max(0, mid + (b - mid) * factor));
        }
      }
      ctx.putImageData(imageData, 0, 0);

      // Pass 3: Unsharp mask for crisp text edges
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tCtx = tempCanvas.getContext("2d")!;
      tCtx.filter = "blur(1px)";
      tCtx.drawImage(canvas, 0, 0);
      const blurred = tCtx.getImageData(0, 0, width, height);
      const sharp = ctx.getImageData(0, 0, width, height);
      const amount = 0.8;
      for (let i = 0; i < sharp.data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          const diff = sharp.data[i + c] - blurred.data[i + c];
          sharp.data[i + c] = Math.min(255, Math.max(0, sharp.data[i + c] + diff * amount));
        }
      }
      ctx.putImageData(sharp, 0, 0);

      resolve(canvas.toDataURL("image/png"));
    };
    img.src = dataUrl;
  });
}

/** Call edge function with extended timeout via direct fetch */
/** Call edge function with timeout and conservative retry for rate-limited AI requests. */
async function invokeWithTimeout(fnName: string, body: any, timeoutMs = 120000) {
  // Use user session token if logged in, otherwise fall back to anon key (guest mode)
  let authToken = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      authToken = session.access_token;
    }
  } catch {
    // Continue with anon key
  }

  let lastError: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fnName}`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`,
          "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const error: any = new Error(errData.error || `Request failed: ${resp.status}`);
        error.status = resp.status;
        throw error;
      }

      return await resp.json();
    } catch (error: any) {
      lastError = error;
      // Only retry provider rate limits or temporary service overload.
      if (![429, 503].includes(error.status) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5000 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

const QuickStart = () => {
  const [items, setItems] = useState<WorksheetItem[]>([]);
  const [outputMode, setOutputMode] = useState<OutputMode>("image");
  const [scanOptimize, setScanOptimize] = useState(true);
  const [scanColorMode, setScanColorMode] = useState<"bw" | "color">("bw");
  const [scanHighQuality, setScanHighQuality] = useState(false);
  const [extractedTexts, setExtractedTexts] = useState<Record<string, ExtractedData>>({});
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const addMoreRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<WorksheetItem[]>([]);
  itemsRef.current = items;
  const navigate = useNavigate();
  const { toast } = useToast();
  const [regionRetryId, setRegionRetryId] = useState<string | null>(null);
  const [rebuild, setRebuild] = useState<{ id: string; status: "processing" | "done" | "error"; image?: string | null; text?: ExtractedData | null; error?: string } | null>(null);

  const handleRebuild = async (id: string) => {
    const item = itemsRef.current.find((it) => it.id === id);
    if (!item) return;
    setRebuild({ id, status: "processing" });
    try {
      const compressed = await compressImage(item.preview, 2400, 0.92);
      const [img, ocr] = await Promise.allSettled([
        invokeWithTimeout("rebuild-worksheet", { imageBase64: compressed }, 180000),
        invokeWithTimeout("extract-text", { imageBase64: compressed }, 180000),
      ]);
      let image: string | null = img.status === "fulfilled" ? img.value?.cleanedImageBase64 || null : null;
      if (image) image = await postProcessScanEffect(image);
      const text = ocr.status === "fulfilled" ? ocr.value?.extractedData || null : null;
      if (!image && !text) {
        const r = img.status === "rejected" ? img.reason : ocr.status === "rejected" ? ocr.reason : null;
        throw new Error(r?.message || "AI 未能製作新試卷，請再試");
      }
      setRebuild((cur) => (cur?.id === id ? { id, status: "done", image, text } : cur));
    } catch (err: any) {
      setRebuild((cur) => (cur?.id === id ? { id, status: "error", error: err.message } : cur));
    }
  };
  const [regionMode, setRegionMode] = useState<"erase" | "restore">("erase");
  const [regionProcessing, setRegionProcessing] = useState(false);
  // Undo/redo history per item: map of item id -> { past: string[], future: string[] }
  const [imageHistory, setImageHistory] = useState<Record<string, { past: string[]; future: string[] }>>({});

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const addFiles = useCallback(async (files: FileList | null) => {
    if (!files) return;
    const maxSize = 10 * 1024 * 1024;

    for (const file of Array.from(files)) {
      if (file.size > maxSize) {
        toast({ title: "檔案太大", description: `${file.name} 超過 10MB`, variant: "destructive" });
        continue;
      }

      if (file.type === "application/pdf") {
        // Convert each PDF page to an image-based WorksheetItem
        try {
          const pages = await pdfToImages(file);
          const baseName = file.name.replace(/\.pdf$/i, "");
          const newItems: WorksheetItem[] = pages.map((p) => ({
            id: makeId(),
            preview: p.dataUrl,
            cleanedImage: null,
            status: "idle" as const,
            fileName: pages.length > 1 ? `${baseName}-p${p.pageNum}.jpg` : `${baseName}.jpg`,
          }));
          setItems((prev) => [...prev, ...newItems]);
        } catch (err) {
          console.error("PDF parse error:", err);
          toast({ title: "PDF 無法解析", description: file.name, variant: "destructive" });
        }
        continue;
      }

      // Image files
      const reader = new FileReader();
      reader.onload = (ev) => {
        const item: WorksheetItem = {
          id: makeId(),
          preview: ev.target?.result as string,
          cleanedImage: null,
          status: "idle",
          fileName: file.name,
        };
        setItems((prev) => [...prev, item]);
      };
      reader.readAsDataURL(file);
    }
  }, [toast]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    e.target.value = "";
  };

  const setStage = (id: string, stage: ProcessingStage) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, processingStage: stage } : it)));
  };

  const processOneImage = async (id: string) => {
    const found = itemsRef.current.find((it) => it.id === id);
    const preview = found?.preview || "";
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, status: "processing" as const, startedAt: Date.now(), processingStage: "generic" as ProcessingStage } : it))
    );
    if (!preview) return;

    try {
      let compressed = await compressImage(preview);

      // Apply scan optimization if enabled (perspective correction, edge detection, flatten)
      if (scanOptimize) {
        setStage(id, scanHighQuality ? "scan-geometry" : "generic");
        // Use higher resolution (3200px) and preprocess for better AI edge detection
        const scanInput = await preprocessForScan(await compressImage(preview, 3200, 0.95));
        const scanData = await invokeWithTimeout("scan-optimize", {
          imageBase64: scanInput,
          colorMode: scanColorMode,
          highQuality: scanHighQuality,
        }, scanHighQuality ? 180000 : 120000);
        if (scanData?.error) throw new Error(scanData.error);
        if (scanData?.optimizedImageBase64) {
          // Re-compress the scan-optimized PNG to JPEG to reduce payload size for subsequent API calls
          compressed = await compressImage(scanData.optimizedImageBase64, 2400, 0.92);
        }
      }

      setStage(id, "erasing");
      const data = await invokeWithTimeout("erase-handwriting", { imageBase64: compressed });
      if (data?.error) throw new Error(data.error);

      // Apply client-side post-processing for scanner-like crispness
      let finalImage = data?.cleanedImageBase64 || null;
      if (finalImage) finalImage = await protectPrintedContent(compressed, finalImage);
      if (finalImage && !(scanOptimize && scanColorMode === "color")) {
        finalImage = await postProcessScanEffect(finalImage);
      }

      setItems((prev) =>
        prev.map((it) =>
          it.id === id ? { ...it, cleanedImage: finalImage, status: "done" as const } : it
        )
      );
    } catch (err: any) {
      console.error("Processing error:", err);
      const msg = err.name === "AbortError" ? "請求超時，請稍後再試" : err.message;
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, status: "error" as const, errorMessage: msg } : it))
      );
    }
  };

  const processOneText = async (id: string) => {
    const found = itemsRef.current.find((it) => it.id === id);
    const preview = found?.preview || "";
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, status: "processing" as const, startedAt: Date.now(), processingStage: "generic" as ProcessingStage } : it))
    );
    if (!preview) return;

    try {
      let compressed = await compressImage(preview, 2400, 0.95);

      // Apply scan optimization if enabled
      if (scanOptimize) {
        setStage(id, scanHighQuality ? "scan-geometry" : "generic");
        const scanInput = await preprocessForScan(await compressImage(preview, 3200, 0.95));
        const scanData = await invokeWithTimeout("scan-optimize", {
          imageBase64: scanInput,
          colorMode: scanColorMode,
          highQuality: scanHighQuality,
        }, scanHighQuality ? 180000 : 120000);
        if (scanData?.error) throw new Error(scanData.error);
        if (scanData?.optimizedImageBase64) {
          // Re-compress the scan-optimized PNG to JPEG to reduce payload size
          compressed = await compressImage(scanData.optimizedImageBase64, 2400, 0.95);
        }
      }

      setStage(id, "extracting");
      // Run OCR and handwriting removal in parallel
      const [ocrResult, eraseResult] = await Promise.all([
        invokeWithTimeout("extract-text", { imageBase64: compressed }),
        invokeWithTimeout("erase-handwriting", { imageBase64: compressed }),
      ]);

      if (ocrResult?.error) throw new Error(ocrResult.error);

      if (ocrResult?.extractedData) {
        setExtractedTexts((prev) => ({ ...prev, [id]: ocrResult.extractedData }));
      }

      // Store cleaned image from handwriting removal
      let finalImage = eraseResult?.cleanedImageBase64 || null;
      if (finalImage) finalImage = await protectPrintedContent(compressed, finalImage);
      if (finalImage && !(scanOptimize && scanColorMode === "color")) {
        finalImage = await postProcessScanEffect(finalImage);
      }

      setItems((prev) =>
        prev.map((it) =>
          it.id === id ? { ...it, cleanedImage: finalImage, status: "done" as const } : it
        )
      );
    } catch (err: any) {
      console.error("OCR error:", err);
      const msg = err.name === "AbortError" ? "請求超時，請稍後再試" : err.message;
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, status: "error" as const, errorMessage: msg } : it))
      );
    }
  };

  const CONCURRENCY = 1; // Sequential processing avoids image-model rate limits

  const handleProcessAll = async () => {
    const pending = itemsRef.current
      .filter((it) => it.status === "idle" || it.status === "error")
      .map((it) => it.id);
    if (pending.length === 0) return;
    const processFn = outputMode === "image" ? processOneImage : processOneText;

    // Process in batches of CONCURRENCY
    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      const batch = pending.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map((id) => processFn(id)));
    }
    toast({ title: outputMode === "image" ? "✨ 批量清除完成！" : "✨ 文字提取完成！" });
  };

  const handleRetry = (id: string) => {
    const processFn = outputMode === "image" ? processOneImage : processOneText;
    processFn(id);
  };

  const handleRemove = (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    setExtractedTexts((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };

  const handleRename = (id: string, newName: string) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, fileName: newName } : it)));
  };

  const handleReset = () => {
    setItems([]);
    setExtractedTexts({});
    setImageHistory({});
  };

  /** Push current cleanedImage to history before changing it */
  const pushHistory = (id: string) => {
    const item = itemsRef.current.find((it) => it.id === id);
    if (!item?.cleanedImage) return;
    setImageHistory((prev) => ({
      ...prev,
      [id]: {
        past: [...(prev[id]?.past || []), item.cleanedImage!],
        future: [], // clear redo stack on new action
      },
    }));
  };

  const handleUndo = (id: string) => {
    const h = imageHistory[id];
    if (!h || h.past.length === 0) return;
    const current = itemsRef.current.find((it) => it.id === id)?.cleanedImage;
    const prev = h.past[h.past.length - 1];
    setImageHistory((old) => ({
      ...old,
      [id]: {
        past: h.past.slice(0, -1),
        future: current ? [current, ...h.future] : h.future,
      },
    }));
    setItems((prev2) => prev2.map((it) => (it.id === id ? { ...it, cleanedImage: prev } : it)));
  };

  const handleRedo = (id: string) => {
    const h = imageHistory[id];
    if (!h || h.future.length === 0) return;
    const current = itemsRef.current.find((it) => it.id === id)?.cleanedImage;
    const next = h.future[0];
    setImageHistory((old) => ({
      ...old,
      [id]: {
        past: current ? [...h.past, current] : h.past,
        future: h.future.slice(1),
      },
    }));
    setItems((prev2) => prev2.map((it) => (it.id === id ? { ...it, cleanedImage: next } : it)));
  };

  const handleRegionRetry = (id: string) => {
    setRegionMode("erase");
    setRegionRetryId(id);
  };

  const handleRegionRestore = (id: string) => {
    setRegionMode("restore");
    setRegionRetryId(id);
  };

  const handleRegionRestoreConfirm = async (
    regions: { rect: { x: number; y: number; w: number; h: number }; fullWidth: number; fullHeight: number }[],
    options: { opacity: number; feather: number },
  ) => {
    if (!regionRetryId || regions.length === 0) return;

    const item = itemsRef.current.find((it) => it.id === regionRetryId);
    if (!item?.preview || !item?.cleanedImage) return;

    try {
      const [origImg, cleanImg] = await Promise.all([
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = item.preview;
        }),
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = item.cleanedImage!;
        }),
      ]);

      const canvas = document.createElement("canvas");
      canvas.width = cleanImg.naturalWidth;
      canvas.height = cleanImg.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(cleanImg, 0, 0);

      const sx = origImg.naturalWidth / cleanImg.naturalWidth;
      const sy = origImg.naturalHeight / cleanImg.naturalHeight;

      regions.forEach(({ rect }) => {
        const { x, y, w, h } = rect;
        const featherPx = options.feather;

        // Create a temporary canvas for feathered region
        const tmpCanvas = document.createElement("canvas");
        tmpCanvas.width = Math.ceil(w);
        tmpCanvas.height = Math.ceil(h);
        const tmpCtx = tmpCanvas.getContext("2d")!;

        // Draw the original image region
        tmpCtx.drawImage(
          origImg,
          x * sx, y * sy, w * sx, h * sy,
          0, 0, w, h,
        );

        // Apply feather mask if feather > 0
        if (featherPx > 0) {
          tmpCtx.globalCompositeOperation = "destination-in";
          const gradient = createFeatherGradient(tmpCtx, w, h, featherPx);
          tmpCtx.fillStyle = gradient;
          tmpCtx.fillRect(0, 0, w, h);
          tmpCtx.globalCompositeOperation = "source-over";
        }

        // Draw onto main canvas with opacity
        ctx.globalAlpha = options.opacity;
        ctx.drawImage(tmpCanvas, x, y);
        ctx.globalAlpha = 1;
      });

      const composited = canvas.toDataURL("image/png");
      pushHistory(regionRetryId);
      setItems((prev) =>
        prev.map((it) =>
          it.id === regionRetryId ? { ...it, cleanedImage: composited } : it
        )
      );
      toast({ title: `✅ 已還原 ${regions.length} 個區域！` });
    } catch (err: any) {
      console.error("Region restore error:", err);
      toast({ title: "局部還原失敗", description: err.message, variant: "destructive" });
    } finally {
      setRegionRetryId(null);
    }
  };

  /** Create a radial-like feather gradient for smooth edges */
  function createFeatherGradient(ctx: CanvasRenderingContext2D, w: number, h: number, feather: number): CanvasPattern {
    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = w;
    maskCanvas.height = h;
    const mCtx = maskCanvas.getContext("2d")!;

    // Fill fully opaque
    mCtx.fillStyle = "white";
    mCtx.fillRect(0, 0, w, h);

    // Fade edges using gradients
    // Left edge
    const gLeft = mCtx.createLinearGradient(0, 0, feather, 0);
    gLeft.addColorStop(0, "black");
    gLeft.addColorStop(1, "transparent");
    mCtx.globalCompositeOperation = "destination-out";
    mCtx.fillStyle = gLeft;
    mCtx.fillRect(0, 0, feather, h);

    // Right edge
    const gRight = mCtx.createLinearGradient(w - feather, 0, w, 0);
    gRight.addColorStop(0, "transparent");
    gRight.addColorStop(1, "black");
    mCtx.fillStyle = gRight;
    mCtx.fillRect(w - feather, 0, feather, h);

    // Top edge
    const gTop = mCtx.createLinearGradient(0, 0, 0, feather);
    gTop.addColorStop(0, "black");
    gTop.addColorStop(1, "transparent");
    mCtx.fillStyle = gTop;
    mCtx.fillRect(0, 0, w, feather);

    // Bottom edge
    const gBottom = mCtx.createLinearGradient(0, h - feather, 0, h);
    gBottom.addColorStop(0, "transparent");
    gBottom.addColorStop(1, "black");
    mCtx.fillStyle = gBottom;
    mCtx.fillRect(0, h - feather, w, feather);

    mCtx.globalCompositeOperation = "source-over";
    return ctx.createPattern(maskCanvas, "no-repeat")!;
  }

  const handleRegionCrop = async (
    regions: { croppedBase64: string; rect: { x: number; y: number; w: number; h: number }; fullWidth: number; fullHeight: number }[],
  ) => {
    if (!regionRetryId || regions.length === 0) return;
    setRegionProcessing(true);

    try {
      const item = itemsRef.current.find((it) => it.id === regionRetryId);
      const baseImage = item?.cleanedImage || item?.preview;
      if (!baseImage) throw new Error("找不到原始圖片");

      // Process all regions in parallel
      const patches = await Promise.all(
        regions.map(async ({ croppedBase64, rect }) => {
          const data = await invokeWithTimeout("erase-handwriting", { imageBase64: croppedBase64 });
          if (data?.error) throw new Error(data.error);
          let patchImage = data?.cleanedImageBase64 || null;
          if (!patchImage) throw new Error("AI 未返回圖片");
          // Guard with the ORIGINAL photo, not the already-cleaned crop: a printed
          // word the AI misread earlier (e.g. "take" -> "fake") must be recoverable.
          const originalRef = await cropRectFromOriginal(item?.preview, baseImage, rect);
          let guarded = originalRef ? await protectPrintedContent(originalRef, patchImage) : patchImage;
          if (guarded === patchImage) {
            // Original crop did not line up (e.g. after perspective correction);
            // fall back to guarding with the crop the AI was given.
            guarded = await protectPrintedContent(croppedBase64, patchImage);
          }
          patchImage = guarded;
          if (!(scanOptimize && scanColorMode === "color")) {
            patchImage = await postProcessScanEffect(patchImage);
          }
          return { patchImage, rect };
        })
      );

      // Composite: paste all cleaned patches back onto the full image

      const composited = await new Promise<string>((resolve, reject) => {
        const baseImg = new Image();
        baseImg.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = baseImg.naturalWidth;
          canvas.height = baseImg.naturalHeight;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(baseImg, 0, 0);

          let loaded = 0;
          patches.forEach(({ patchImage, rect }) => {
            const patchImg = new Image();
            patchImg.onload = () => {
              ctx.drawImage(patchImg, rect.x, rect.y, rect.w, rect.h);
              loaded++;
              if (loaded === patches.length) {
                resolve(canvas.toDataURL("image/png"));
              }
            };
            patchImg.onerror = () => reject(new Error("補丁圖片載入失敗"));
            patchImg.src = patchImage;
          });
        };
        baseImg.src = baseImage;
      });

      pushHistory(regionRetryId);
      setItems((prev) =>
        prev.map((it) =>
          it.id === regionRetryId ? { ...it, cleanedImage: composited } : it
        )
      );
      toast({ title: `✨ ${patches.length} 個區域重新清除完成！` });
    } catch (err: any) {
      console.error("Region retry error:", err);
      toast({ title: "局部重試失敗", description: err.message, variant: "destructive" });
    } finally {
      setRegionProcessing(false);
      setRegionRetryId(null);
    }
  };

  // Helper: strip file extension from name
  const stripExt = (name: string) => {
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(0, dot) : name;
  };

  // Image mode completed pairs
  const completedPairs: WorksheetPair[] = items
    .filter((it) => it.status === "done" && it.cleanedImage)
    .map((it, i) => ({ original: it.preview, cleaned: it.cleanedImage!, name: stripExt(it.fileName) || `Worksheet ${i + 1}` }));

  // Text mode completed data
  const completedTexts = items
    .filter((it) => it.status === "done" && extractedTexts[it.id])
    .map((it) => ({ data: extractedTexts[it.id], name: stripExt(it.fileName) || "Worksheet" }));

  const handleDownloadAll = async () => {
    const multi = completedPairs.length > 1;

    for (let i = 0; i < completedPairs.length; i++) {
      const name = completedPairs[i].name || "worksheet";
      const fileName = multi ? `${name}-${i + 1}.png` : `${name}.png`;

      const resp = await fetch(completedPairs[i].cleaned);
      const blob = await resp.blob();
      const file = new File([blob], fileName, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          continue;
        } catch (e: any) {
          if (e.name === "AbortError") continue;
        }
      }

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(link.href);
    }
  };

  const isProcessing = items.some((it) => it.status === "processing");
  const hasItems = items.length > 0;
  const hasPending = items.some((it) => it.status === "idle" || it.status === "error");
  const doneCount = items.filter((it) => it.status === "done").length;
  const totalCount = items.length;
  const progressValue = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;

  const modeLabel = outputMode === "image" ? "清除手寫內容" : "提取文字內容";

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-2xl">
        <button
          onClick={() => navigate("/")}
          className="mb-6 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <h1 className="font-display text-2xl font-extrabold">Quick Start</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            上傳工作表照片，選擇輸出模式後批量處理。
          </p>
        </motion.div>

        <AnimatePresence mode="wait">
          {!hasItems && (
            <motion.div
              key="upload"
              className={`mt-8 flex flex-col items-center justify-center gap-5 rounded-3xl border-2 border-dashed min-h-[50vh] p-8 transition-colors ${
                dragOver ? "border-primary bg-primary/5 scale-[1.01]" : "border-muted-foreground/30 hover:border-primary/40"
              }`}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35 }}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              {dragOver ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <Upload className="h-12 w-12 text-primary animate-bounce" />
                  <p className="text-lg font-bold text-primary">
                    放開以上傳檔案 📥
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Upload className="h-10 w-10" />
                    <p className="text-sm font-medium">拖放圖片或 PDF 到此處</p>
                  </div>

                  <div className="flex items-center gap-3 w-full max-w-xs">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-muted-foreground">或</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>

                  <div className="flex flex-col gap-3 w-full max-w-xs">
                    <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
                    <Button size="lg" className="w-full rounded-2xl py-7 font-display text-base font-bold" onClick={() => cameraInputRef.current?.click()}>
                      <Camera className="mr-2 h-5 w-5" /> 拍照
                    </Button>

                    <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={handleFile} />
                    <Button size="lg" variant="outline" className="w-full rounded-2xl py-7 font-display text-base font-bold" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="mr-2 h-5 w-5" /> 選取檔案（支援 PDF）
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {hasItems && (
            <motion.div
              key="batch"
              className={`mt-8 space-y-4 rounded-3xl border-2 border-dashed p-4 transition-colors ${dragOver ? "border-primary bg-primary/5" : "border-transparent"}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Output mode selector - only show before processing starts */}
              {hasPending && !isProcessing && (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-bold text-foreground">選擇輸出模式</p>
                    <OutputModeSelector value={outputMode} onChange={setOutputMode} />
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 rounded-2xl border-2 border-muted p-4 cursor-pointer hover:border-muted-foreground/30 transition-colors">
                      <ScanLine className="h-5 w-5 text-muted-foreground shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-bold">📸 拍照掃描優化</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">自動識別邊緣、校正角度、拉伸平整</p>
                      </div>
                      <Switch checked={scanOptimize} onCheckedChange={setScanOptimize} />
                    </label>
                    {scanOptimize && (
                      <>
                        <div className="flex gap-2 pl-2">
                          <button
                            type="button"
                            onClick={() => setScanColorMode("bw")}
                            className={`flex-1 rounded-xl border-2 px-3 py-2 text-xs font-bold transition-colors ${
                              scanColorMode === "bw"
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-muted text-muted-foreground hover:border-muted-foreground/30"
                            }`}
                          >
                            🖨️ 單色（黑白）
                          </button>
                          <button
                            type="button"
                            onClick={() => setScanColorMode("color")}
                            className={`flex-1 rounded-xl border-2 px-3 py-2 text-xs font-bold transition-colors ${
                              scanColorMode === "color"
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-muted text-muted-foreground hover:border-muted-foreground/30"
                            }`}
                          >
                            🎨 彩色
                          </button>
                        </div>
                        <label className="flex items-center gap-3 rounded-xl border-2 border-muted pl-4 pr-3 py-2.5 cursor-pointer hover:border-muted-foreground/30 transition-colors">
                          <div className="flex-1">
                            <p className="text-xs font-bold">🔍 高品質模式</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">兩步處理：先校正角度，再清理畫質（較慢）</p>
                          </div>
                          <Switch checked={scanHighQuality} onCheckedChange={setScanHighQuality} />
                        </label>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Grid */}
              <div className="grid grid-cols-2 gap-3">
                {items.map((item) => (
                  <WorksheetCard
                    key={item.id}
                    item={item}
                    mode={outputMode}
                    onRemove={handleRemove}
                    onRetry={handleRetry}
                    onRename={handleRename}
                    onRegionRetry={handleRegionRetry}
                    onRegionRestore={handleRegionRestore}
                    onRebuild={handleRebuild}
                    onUndo={handleUndo}
                    onRedo={handleRedo}
                    canUndo={(imageHistory[item.id]?.past.length || 0) > 0}
                    canRedo={(imageHistory[item.id]?.future.length || 0) > 0}
                  />
                ))}
                {!isProcessing && (
                  <button
                    onClick={() => addMoreRef.current?.click()}
                    className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-muted-foreground/30 aspect-[4/3] hover:border-primary/50 hover:bg-muted/50 transition-colors"
                  >
                    <Plus className="h-8 w-8 text-muted-foreground/50" />
                    <span className="mt-1 text-xs text-muted-foreground">新增更多</span>
                  </button>
                )}
              </div>
              <input ref={addMoreRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={handleFile} />

              {/* Progress */}
              {isProcessing && (
                <div className="space-y-2">
                  <Progress value={progressValue} className="h-2" />
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    已完成 {doneCount} / {totalCount}
                  </div>
                </div>
              )}

              {/* Process button */}
              {!isProcessing && hasPending && (
                <Button className="w-full rounded-full font-display font-bold" onClick={handleProcessAll}>
                  {modeLabel} ✨ ({items.filter((it) => it.status === "idle" || it.status === "error").length} 張)
                </Button>
              )}

              {/* Image mode results */}
              {!isProcessing && outputMode === "image" && completedPairs.length > 0 && (
                <div className="flex flex-col gap-3">
                  <Button size="lg" className="w-full rounded-full font-display font-bold" onClick={handleDownloadAll}>
                    <Download className="mr-2 h-4 w-4" /> 下載全部清除後圖片 ({completedPairs.length})
                  </Button>
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1 rounded-full font-display font-bold" onClick={() => generatePDF(completedPairs)}>
                      <FileText className="mr-1 h-4 w-4" /> PDF
                    </Button>
                    <Button variant="outline" className="flex-1 rounded-full font-display font-bold" onClick={() => generateDOCX(completedPairs)}>
                      <FileDown className="mr-1 h-4 w-4" /> DOCX
                    </Button>
                  </div>
                </div>
              )}

              {/* Text mode results — editable document export */}
              {!isProcessing && outputMode === "text" && completedTexts.length > 0 && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-bold text-foreground">📄 文字已提取，選擇匯出格式（可編輯）：</p>
                  <Button className="w-full rounded-full font-display font-bold" onClick={() => generateTextDOCX(completedTexts)}>
                    <FileDown className="mr-1 h-4 w-4" /> 文字 DOCX
                  </Button>
                </div>
              )}

              {!isProcessing && (
                <Button variant="outline" className="w-full rounded-full font-display font-bold" onClick={handleReset}>
                  <RotateCcw className="mr-1 h-4 w-4" /> 重新開始
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Region selector overlay */}
      {regionRetryId && (() => {
        const item = items.find((it) => it.id === regionRetryId);
        const src = item?.cleanedImage || item?.preview;
        if (!src) return null;
        return (
          <RegionSelector
            imageSrc={src}
            mode={regionMode}
            onCrop={handleRegionCrop}
            onRestore={handleRegionRestoreConfirm}
            onCancel={() => setRegionRetryId(null)}
            isProcessing={regionProcessing}
          />
        );
      })()}
      <Dialog open={!!rebuild} onOpenChange={(o) => { if (!o && rebuild?.status !== "processing") setRebuild(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>AI 重新製作新試卷</DialogTitle></DialogHeader>
          {rebuild?.status === "processing" && (
            <div className="flex flex-col items-center gap-3 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              AI 正在重新排版整份試卷，約需 1–2 分鐘…
            </div>
          )}
          {rebuild?.status === "error" && (
            <div className="space-y-3 py-4 text-sm">
              <p className="text-destructive">失敗：{rebuild.error}</p>
              <Button onClick={() => handleRebuild(rebuild.id)}><RotateCcw className="h-4 w-4 mr-1" />再試一次</Button>
            </div>
          )}
          {rebuild?.status === "done" && (() => {
            const item = items.find((it) => it.id === rebuild.id);
            const base = item ? (item.fileName.lastIndexOf(".") > 0 ? item.fileName.slice(0, item.fileName.lastIndexOf(".")) : item.fileName) : "worksheet";
            return (
              <div className="space-y-3">
                {rebuild.image ? (
                  <img src={rebuild.image} alt="AI 重新製作的試卷" className="w-full rounded-lg border" />
                ) : (
                  <p className="text-sm text-muted-foreground">新圖片未能製作，但仍可下載 Word 版本。</p>
                )}
                <p className="text-xs text-muted-foreground">提示：AI 重新製作的內容可能有個別字與原卷不同，請先核對。</p>
                <div className="grid grid-cols-1 gap-2">
                  {rebuild.image && (
                    <Button onClick={() => { const a = document.createElement("a"); a.href = rebuild.image!; a.download = `${base}-new.png`; a.click(); }}>
                      <Download className="h-4 w-4 mr-1" />下載新圖片
                    </Button>
                  )}
                  {rebuild.text && (
                    <Button variant="outline" onClick={() => generateTextDOCX([{ data: rebuild.text!, name: `${base}-new` }])}>
                      <FileText className="h-4 w-4 mr-1" />下載可編輯 Word
                    </Button>
                  )}
                  {rebuild.image && (
                    <Button variant="secondary" onClick={() => {
                      pushHistory(rebuild.id);
                      setItems((prev) => prev.map((it) => it.id === rebuild.id ? { ...it, cleanedImage: rebuild.image! } : it));
                      setRebuild(null);
                    }}>用新圖片取代清除結果</Button>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default QuickStart;
