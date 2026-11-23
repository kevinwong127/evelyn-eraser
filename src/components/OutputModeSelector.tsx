import { ImageIcon, FileText } from "lucide-react";
import { motion } from "framer-motion";

export type OutputMode = "image" | "text";

type Props = {
  value: OutputMode;
  onChange: (mode: OutputMode) => void;
};

const OutputModeSelector = ({ value, onChange }: Props) => {
  return (
    <div className="flex gap-3">
      <button
        onClick={() => onChange("image")}
        className={`flex-1 flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all ${
          value === "image"
            ? "border-primary bg-primary/5 shadow-sm"
            : "border-muted hover:border-muted-foreground/30"
        }`}
      >
        <div className={`rounded-full p-2.5 ${value === "image" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
          <ImageIcon className="h-5 w-5" />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold">圖像檔</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">清除手寫後輸出圖片</p>
        </div>
      </button>
      <button
        onClick={() => onChange("text")}
        className={`flex-1 flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all ${
          value === "text"
            ? "border-primary bg-primary/5 shadow-sm"
            : "border-muted hover:border-muted-foreground/30"
        }`}
      >
        <div className={`rounded-full p-2.5 ${value === "text" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
          <FileText className="h-5 w-5" />
        </div>
        <div className="text-center">
          <p className="text-sm font-bold">文字檔</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">OCR 提取文字，可編輯 PDF/DOCX</p>
        </div>
      </button>
    </div>
  );
};

export default OutputModeSelector;
