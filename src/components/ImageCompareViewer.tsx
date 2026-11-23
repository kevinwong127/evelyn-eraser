import { useState, useRef, useCallback, useEffect } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

type Props = {
  originalSrc: string;
  cleanedSrc: string;
  onClose: () => void;
};

const ImageCompareViewer = ({ originalSrc, cleanedSrc, onClose }: Props) => {
  const [showOriginal, setShowOriginal] = useState(false);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Pinch zoom state
  const lastDist = useRef(0);
  const lastScale = useRef(1);

  const clampScale = (s: number) => Math.max(0.5, Math.min(8, s));

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale((s) => clampScale(s * delta));
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "touch") return; // handled by touch events
    setDragging(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    lastPos.current = { x: e.clientX, y: e.clientY };
    setTranslate((t) => ({ x: t.x + dx, y: t.y + dy }));
  }, [dragging]);

  const onPointerUp = useCallback(() => setDragging(false), []);

  // Touch: pinch zoom + pan
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastDist.current = Math.hypot(dx, dy);
      lastScale.current = scale;
    } else if (e.touches.length === 1) {
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, [scale]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (lastDist.current > 0) {
        setScale(clampScale(lastScale.current * (dist / lastDist.current)));
      }
    } else if (e.touches.length === 1 && scale > 1) {
      const dx = e.touches[0].clientX - lastPos.current.x;
      const dy = e.touches[0].clientY - lastPos.current.y;
      lastPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      setTranslate((t) => ({ x: t.x + dx, y: t.y + dy }));
    }
  }, [scale]);

  const resetView = () => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  };

  const displaySrc = showOriginal ? originalSrc : cleanedSrc;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold">
            {showOriginal ? "原圖" : "清除後"}
          </span>
          <span className="text-xs text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            onClick={() => setScale((s) => clampScale(s * 1.3))}
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            onClick={() => setScale((s) => clampScale(s / 1.3))}
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            onClick={resetView}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            className="p-1.5 rounded-lg hover:bg-muted transition-colors ml-2"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing select-none touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
      >
        <div className="w-full h-full flex items-center justify-center">
          <img
            src={displaySrc}
            alt="Compare"
            className="max-w-full max-h-full object-contain pointer-events-none"
            draggable={false}
            style={{
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              transformOrigin: "center center",
              transition: dragging ? "none" : "transform 0.1s ease-out",
            }}
          />
        </div>
      </div>

      {/* Footer: toggle */}
      <div className="px-4 py-3 border-t shrink-0 flex items-center justify-center gap-2">
        <button
          className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
            !showOriginal
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setShowOriginal(false)}
        >
          清除後
        </button>
        <button
          className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${
            showOriginal
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setShowOriginal(true)}
        >
          原圖
        </button>
        <span className="text-[10px] text-muted-foreground ml-2">滾輪/雙指縮放 · 拖動平移</span>
      </div>
    </div>
  );
};

export default ImageCompareViewer;
