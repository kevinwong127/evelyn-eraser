import { ArrowRight, Eraser, BookOpen, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Three-column Hero */}
      <main className="flex-1 flex flex-col md:grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
        {/* LEFT — Evelyn's Eraser */}
        <motion.div
          className="relative flex flex-col items-center justify-center px-8 py-16 md:py-0 overflow-hidden"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="pointer-events-none absolute -top-20 -left-20 h-72 w-72 rounded-full bg-primary/15 blur-3xl hidden md:block" />
          <div className="relative z-10 max-w-md text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10">
              <Eraser className="h-10 w-10 text-primary" />
            </div>
            <h2 className="mt-6 font-display text-3xl font-black leading-tight tracking-tight md:text-4xl">
              WorkSheet <span className="text-primary">Eraser</span>
            </h2>
            <p className="mt-3 text-muted-foreground md:text-lg">
              AI 清除手寫答案，讓練習卷可以重複使用。拍照上傳，一鍵還原空白試卷。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button
                size="lg"
                className="rounded-full font-display text-base font-bold"
                onClick={() => navigate("/quick-start")}
              >
                立即使用 <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </motion.div>

        {/* CENTER — 功課小幫手 HK */}
        <motion.div
          className="relative flex flex-col items-center justify-center px-8 py-16 md:py-0 overflow-hidden"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          <div className="pointer-events-none absolute -bottom-20 -right-20 h-72 w-72 rounded-full bg-secondary/15 blur-3xl" />
          <div className="relative z-10 max-w-md text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-secondary/10">
              <BookOpen className="h-10 w-10 text-secondary" />
            </div>
            <h2 className="mt-6 font-display text-3xl font-black leading-tight tracking-tight md:text-4xl">
              功課小幫手 <span className="text-secondary">HK</span>
            </h2>
            <p className="mt-3 text-muted-foreground md:text-lg">
              AI 批改功課，即時檢查答案。支援中文、英文、數學科目，適合小學至中學生。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button
                size="lg"
                variant="secondary"
                className="rounded-full font-display text-base font-bold"
                onClick={() => navigate("/homework")}
              >
                開始批改 <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        </motion.div>

        {/* RIGHT — 默書小助手 */}
        <motion.div
          className="relative flex flex-col items-center justify-center px-8 py-16 md:py-0 overflow-hidden"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div className="pointer-events-none absolute -top-20 -right-20 h-72 w-72 rounded-full bg-orange-500/15 blur-3xl" />
          <div className="relative z-10 max-w-md text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-orange-500/10">
              <Volume2 className="h-10 w-10 text-orange-500" />
            </div>
            <h2 className="mt-6 font-display text-3xl font-black leading-tight tracking-tight md:text-4xl">
              默書<span className="text-orange-500">小助手</span>
            </h2>
            <p className="mt-3 text-muted-foreground md:text-lg">
              AI 粵語默書練習，支援 OCR 圖片識別，語速可調。輸入或上傳文字，開始練習。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button
                size="lg"
                className="rounded-full font-display text-base font-bold bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => navigate("/dictation")}
              >
                開始默書 <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
              <p className="text-xs text-muted-foreground mt-2">（試用中）</p>
            </div>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t px-6 py-6 text-center text-sm text-muted-foreground">
        <p>© {new Date().getFullYear()} WorkSheet Eraser. Made with ❤️</p>
      </footer>
    </div>
  );
};

export default Index;
