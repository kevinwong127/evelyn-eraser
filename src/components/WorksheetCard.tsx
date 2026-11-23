import { ArrowRightLeft, Download, Loader2, Pencil, RotateCcw, X, Crop, Undo2, Undo, Redo, ZoomIn, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useState, useEffect } from "react";
import ImageCompareViewer from "./ImageCompareViewer";

export type ProcessingStage = "scan-geometry" | "scan-cleanup" | "erasing" | "extracting" | "generic";

export type WorksheetItem = {
  id: string;
  preview: string;
  cleanedImage: string | null;
  status: "idle" | "processing" | "done" | "error";
  errorMessage?: string;
  fileName: string;
  startedAt?: number;
  processingStage?: ProcessingStage;
};

type Props = {
  item: WorksheetItem;
  mode?: "image" | "text";
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  onRename?: (id: string, newName: string) => void;
  onRegionRetry?: (id: string) => void;
  onRegionRestore?: (id: string) => void;
  onRebuild?: (id: string) => void;
  onUndo?: (id: string) => void;
  onRedo?: (id: string) => void;
  canUndo?: boolean;
  canRedo?: boolean;
};

const ESTIMATED_SECONDS = 60; // estimated processing time

const WorksheetCard = ({ item, mode = "image", onRemove, onRetry, onRename, onRegionRetry, onRegionRestore, onRebuild, onUndo, onRedo, canUndo, canRedo }: Props) => {
  const [showOriginal, setShowOriginal] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [editing, setEditing] = useState(false);
  const [showCompare, setShowCompare] = useState(false);

  // Split filename into name stem + extension
  const dotIdx = item.fileName.lastIndexOf(".");
  const nameStem = dotIdx > 0 ? item.fileName.slice(0, dotIdx) : item.fileName;
  const nameExt = dotIdx > 0 ? item.fileName.slice(dotIdx) : "";
  const [editStem, setEditStem] = useState(nameStem);

  useEffect(() => {
    if (item.status !== "processing") {
      setElapsed(0);
      return;
    }
    const start = item.startedAt || Date.now();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [item.status, item.startedAt]);

  const stageLabels: Record<ProcessingStage, string> = {
    "scan-geometry": "正在校正角度…",
    "scan-cleanup": "正在清理畫質…",
    "erasing": "正在清除手寫…",
    "extracting": "正在提取文字…",
    "generic": mode === "text" ? "提取中" : "清除中",
  };
  const stageLabel = stageLabels[item.processingStage || "generic"];

  const displayImage =
    item.status === "done" && item.cleanedImage && !showOriginal
      ? item.cleanedImage
      : item.preview;

  // Simulated progress: asymptotic approach to 95%
  const simProgress = item.status === "processing"
    ? Math.min(95, Math.round((elapsed / ESTIMATED_SECONDS) * 90))
    : 0;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${sec.toString().padStart(2, "0")}` : `${sec}s`;
  };

  return (
    <div className="relative rounded-2xl border bg-card shadow-sm overflow-hidden">
      {/* Remove button */}
      {item.status !== "processing" && (
        <button
          onClick={() => onRemove(item.id)}
          className="absolute top-2 right-2 z-10 rounded-full bg-foreground/70 p-1 text-background hover:bg-foreground/90 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {/* Image */}
      <div className="relative">
        <img
          src={displayImage}
          alt={item.fileName}
          className={`w-full aspect-[4/3] object-cover ${item.status === "done" && item.cleanedImage ? "cursor-zoom-in" : ""}`}
          onClick={() => {
            if (item.status === "done" && item.cleanedImage) setShowCompare(true);
          }}
        />
        {item.status === "done" && item.cleanedImage && (
          <button
            className="absolute bottom-2 right-2 p-1 rounded-full bg-foreground/50 text-background hover:bg-foreground/70 transition-colors"
            onClick={() => setShowCompare(true)}
          >
            <ZoomIn className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Processing overlay */}
      {item.status === "processing" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/70 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-2 text-xs font-bold text-foreground">{simProgress}%</p>
          <p className="text-[10px] text-muted-foreground">{stageLabel} · {formatTime(elapsed)}</p>
          <div className="w-2/3 mt-2">
            <Progress value={simProgress} className="h-1.5" />
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div className="p-2 space-y-1.5">
        {item.status === "idle" && editing ? (
          <div className="flex items-center gap-0.5">
            <input
              autoFocus
              className="flex-1 min-w-0 text-xs font-medium bg-muted/50 border border-input rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-primary"
              value={editStem}
              onChange={(e) => setEditStem(e.target.value)}
              onBlur={() => {
                setEditing(false);
                const trimmed = editStem.trim();
                if (trimmed && trimmed !== nameStem) onRename?.(item.id, trimmed + nameExt);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") { setEditStem(nameStem); setEditing(false); }
              }}
            />
            <span className="text-xs text-muted-foreground shrink-0">{nameExt}</span>
          </div>
        ) : (
          <button
            className="flex items-center gap-1 w-full text-left group"
            onClick={() => { if (item.status === "idle") { setEditStem(nameStem); setEditing(true); } }}
            disabled={item.status !== "idle"}
          >
            <p className="text-xs font-medium truncate text-muted-foreground flex-1">{item.fileName}</p>
            {item.status === "idle" && (
              <Pencil className="h-3 w-3 text-muted-foreground/50 group-hover:text-foreground shrink-0 transition-colors" />
            )}
          </button>
        )}

        {item.status === "done" && (mode === "text" || item.cleanedImage) && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">
                ✓ {mode === "text" ? "已提取" : "完成"}
              </span>
              {mode === "image" && item.cleanedImage && (
                <div className="ml-auto flex items-center gap-1">
                  {onUndo && (
                    <button
                      className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      onClick={() => onUndo(item.id)}
                      disabled={!canUndo}
                      title="還原上一次"
                    >
                      <Undo className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {onRedo && (
                    <button
                      className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      onClick={() => onRedo(item.id)}
                      disabled={!canRedo}
                      title="回下一次"
                    >
                      <Redo className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
            {mode === "image" && item.cleanedImage && (
              <div className="flex items-center gap-1.5">
                {onRegionRestore && (
                  <button
                    className="text-[10px] font-bold text-green-600 hover:text-green-700 flex items-center gap-0.5"
                    onClick={() => onRegionRestore(item.id)}
                  >
                    <Undo2 className="h-3 w-3" />
                    局部還原
                  </button>
                )}
                {onRegionRetry && (
                  <button
                    className="text-[10px] font-bold text-primary hover:text-primary/80 flex items-center gap-0.5"
                    onClick={() => onRegionRetry(item.id)}
                  >
                    <Crop className="h-3 w-3" />
                    局部重試
                  </button>
                )}
                <button
                  className="text-[10px] font-bold text-muted-foreground hover:text-foreground flex items-center gap-0.5 ml-auto"
                  onClick={() => setShowCompare(true)}
                >
                  <ZoomIn className="h-3 w-3" />
                  對比放大
                </button>
              </div>
            )}
          </div>
        )}

        {item.status === "done" && onRebuild && (
          <button
            className="w-full text-[11px] font-bold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg py-1 flex items-center justify-center gap-1"
            onClick={() => onRebuild(item.id)}
          >
            <Sparkles className="h-3 w-3" /> AI 重新製作新試卷
          </button>
        )}

        {item.status === "done" && mode === "image" && !item.cleanedImage && (
          <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">⚠ 無法清除</span>
        )}

        {item.status === "error" && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">✕ 失敗</span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-6 text-[10px] px-2"
              onClick={() => onRetry(item.id)}
            >
              <RotateCcw className="h-3 w-3 mr-0.5" /> 重試
            </Button>
          </div>
        )}
      </div>

      {/* Fullscreen compare viewer */}
      {showCompare && item.cleanedImage && (
        <ImageCompareViewer
          originalSrc={item.preview}
          cleanedSrc={item.cleanedImage}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  );
};

export default WorksheetCard;
