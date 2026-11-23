import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { X, Crop, Loader2, Trash2, Undo2 } from "lucide-react";

type Rect = { x: number; y: number; w: number; h: number };

type Props = {
  imageSrc: string;
  mode?: "erase" | "restore";
  onCrop: (regions: { croppedBase64: string; rect: Rect; fullWidth: number; fullHeight: number }[]) => void;
  onRestore?: (regions: { rect: Rect; fullWidth: number; fullHeight: number }[], options: { opacity: number; feather: number }) => void;
  onCancel: () => void;
  isProcessing?: boolean;
};

const RegionSelector = ({ imageSrc, mode = "erase", onCrop, onRestore, onCancel, isProcessing }: Props) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [currentRect, setCurrentRect] = useState<Rect | null>(null);
  const [savedRects, setSavedRects] = useState<Rect[]>([]);
  const [opacity, setOpacity] = useState(100);
  const [feather, setFeather] = useState(8);

  const isRestore = mode === "restore";
  const accentColor = isRestore ? "green" : "primary";

  const getRelPos = useCallback((e: React.PointerEvent) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (isProcessing) return;
    const pos = getRelPos(e);
    setStart(pos);
    setCurrentRect(null);
    setDrawing(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [getRelPos, isProcessing]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drawing || !start) return;
    const pos = getRelPos(e);
    setCurrentRect({
      x: Math.min(start.x, pos.x),
      y: Math.min(start.y, pos.y),
      w: Math.abs(pos.x - start.x),
      h: Math.abs(pos.y - start.y),
    });
  }, [drawing, start, getRelPos]);

  const onPointerUp = useCallback(() => {
    setDrawing(false);
    if (currentRect && currentRect.w >= 0.02 && currentRect.h >= 0.02) {
      setSavedRects((prev) => [...prev, currentRect]);
    }
    setCurrentRect(null);
  }, [currentRect]);

  const removeRect = (index: number) => {
    setSavedRects((prev) => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = useCallback(() => {
    if (savedRects.length === 0) return;

    if (isRestore && onRestore) {
      // For restore mode, we just need the rect coordinates (relative)
      // We need the image dimensions to convert to absolute coords
      const img = new Image();
      img.onload = () => {
        const { naturalWidth: nw, naturalHeight: nh } = img;
        const regions = savedRects.map((rect) => ({
          rect: {
            x: rect.x * nw,
            y: rect.y * nh,
            w: rect.w * nw,
            h: rect.h * nh,
          },
          fullWidth: nw,
          fullHeight: nh,
        }));
        onRestore(regions, { opacity: opacity / 100, feather });
      };
      img.src = imageSrc;
      return;
    }

    // Erase mode - crop regions and send
    const img = new Image();
    img.onload = () => {
      const { naturalWidth: nw, naturalHeight: nh } = img;
      const regions = savedRects.map((rect) => {
        const pad = 0.05;
        const cx = Math.max(0, rect.x - pad) * nw;
        const cy = Math.max(0, rect.y - pad) * nh;
        const cw = Math.min(nw - cx, (rect.w + pad * 2) * nw);
        const ch = Math.min(nh - cy, (rect.h + pad * 2) * nh);

        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, cx, cy, cw, ch, 0, 0, cw, ch);

        return {
          croppedBase64: canvas.toDataURL("image/png"),
          rect: { x: cx, y: cy, w: cw, h: ch },
          fullWidth: nw,
          fullHeight: nh,
        };
      });
      onCrop(regions);
    };
    img.src = imageSrc;
  }, [savedRects, imageSrc, onCrop, onRestore, isRestore, opacity, feather]);

  const allRects = [...savedRects, ...(currentRect && currentRect.w > 0.01 && currentRect.h > 0.01 ? [currentRect] : [])];

  const borderClass = isRestore ? "border-green-500" : "border-primary";
  const badgeBgClass = isRestore ? "bg-green-500 text-white" : "bg-primary text-primary-foreground";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="text-sm font-bold">
          {isRestore ? "框選需要還原的區域（可多選）" : "框選需要重新清除的區域（可多選）"}
        </h3>
        <div className="flex items-center gap-2">
          {savedRects.length > 0 && !isProcessing && (
            <Button variant="ghost" size="sm" onClick={() => setSavedRects([])}>
              <Trash2 className="h-3.5 w-3.5 mr-1" />清除全部
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isProcessing}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Image with selection overlays */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
        <div
          ref={containerRef}
          className="relative select-none touch-none max-w-full max-h-full"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <img
            src={imageSrc}
            alt="Select region"
            className="max-w-full max-h-[70vh] object-contain rounded-lg"
            draggable={false}
          />

          {/* Render all rects */}
          {allRects.length > 0 && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 bg-background/40" />
              {allRects.map((r, i) => (
                <div key={i}>
                  <div
                    className={`absolute border-2 ${borderClass}`}
                    style={{
                      left: `${r.x * 100}%`,
                      top: `${r.y * 100}%`,
                      width: `${r.w * 100}%`,
                      height: `${r.h * 100}%`,
                      backgroundColor: "transparent",
                      boxShadow: "none",
                    }}
                  >
                    <div className="absolute inset-0 bg-background/0" style={{ backdropFilter: "none" }} />
                    <span className={`absolute -top-2.5 -left-2.5 ${badgeBgClass} text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center pointer-events-auto`}>
                      {i < savedRects.length ? i + 1 : ""}
                    </span>
                    {i < savedRects.length && !isProcessing && (
                      <button
                        className="absolute -top-2.5 -right-2.5 bg-destructive text-destructive-foreground w-4 h-4 rounded-full flex items-center justify-center pointer-events-auto hover:bg-destructive/80"
                        onClick={(e) => { e.stopPropagation(); removeRect(i); }}
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t space-y-2">
        {isRestore && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">透明度</span>
              <Slider
                value={[opacity]}
                onValueChange={([v]) => setOpacity(v)}
                min={20}
                max={100}
                step={5}
                className="flex-1"
              />
              <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{opacity}%</span>
            </div>
            <div className="flex items-center gap-2 flex-1">
              <span className="text-[10px] font-bold text-muted-foreground whitespace-nowrap">羽化</span>
              <Slider
                value={[feather]}
                onValueChange={([v]) => setFeather(v)}
                min={0}
                max={30}
                step={1}
                className="flex-1"
              />
              <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">{feather}px</span>
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <p className="flex-1 text-xs text-muted-foreground">
            {savedRects.length > 0
              ? `已選取 ${savedRects.length} 個區域，可繼續框選或點擊確認`
              : "用手指或滑鼠拖動框選區域，可框選多個"}
          </p>
          <Button
            onClick={handleConfirm}
            disabled={savedRects.length === 0 || isProcessing}
            className={`rounded-full font-bold ${isRestore ? "bg-green-600 hover:bg-green-700" : ""}`}
          >
            {isProcessing ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 處理中…</>
            ) : isRestore ? (
              <><Undo2 className="h-4 w-4 mr-1" /> 還原 {savedRects.length > 0 ? `(${savedRects.length})` : ""}</>
            ) : (
              <><Crop className="h-4 w-4 mr-1" /> 重新清除 {savedRects.length > 0 ? `(${savedRects.length})` : ""}</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default RegionSelector;
