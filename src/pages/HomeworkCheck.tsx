import { useState, useRef, useEffect } from "react";
import { ArrowLeft, Camera, Upload, Send, Lightbulb, CheckCircle2, XCircle, ImageIcon, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import AuthGuard from "@/components/AuthGuard";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import ReactMarkdown from "react-markdown";

/** Normalize AI highlight tags to a consistent format before parsing */
const normalizeHighlightTags = (text: string): string => {
  // Normalize variations: <yellow>, <<yellow>, <<yellow>>, </yellow>, <</yellow>>, etc.
  return text
    .replace(/<{1,2}red>{1,2}/g, "<<red>>")
    .replace(/<{1,2}\/red>{1,2}/g, "<</red>>")
    .replace(/<{1,2}yellow>{1,2}/g, "<<yellow>>")
    .replace(/<{1,2}\/yellow>{1,2}/g, "<</yellow>>");
};

/** Renders explanation with markdown + colored highlights */
const FormattedExplanation = ({ text }: { text: string }) => {
  const normalized = normalizeHighlightTags(text);
  // Split by double-newline into paragraphs first, then handle highlights within each
  const paragraphs = normalized.split(/\n{2,}/);

  return (
    <div className="text-sm leading-relaxed space-y-2">
      {paragraphs.map((para, pi) => {
        const parts = para.split(/(<<(?:red|yellow)>>.*?<<\/(?:red|yellow)>>)/gs);
        const hasHighlight = parts.some(p => p.startsWith("<<red>>") || p.startsWith("<<yellow>>"));

        if (hasHighlight) {
          // Render inline so highlights don't break the line
          return (
            <p key={pi} className="whitespace-pre-wrap">
              {parts.map((part, i) => {
                const redMatch = part.match(/^<<red>>(.*?)<<\/red>>$/s);
                if (redMatch) return <span key={i} className="hw-red">{redMatch[1]}</span>;
                const yellowMatch = part.match(/^<<yellow>>(.*?)<<\/yellow>>$/s);
                if (yellowMatch) return <span key={i} className="hw-yellow">{yellowMatch[1]}</span>;
                return <span key={i}>{part}</span>;
              })}
            </p>
          );
        }

        // No highlights: use ReactMarkdown for full formatting
        return <ReactMarkdown key={pi}>{para}</ReactMarkdown>;
      })}
    </div>
  );
};

/** Collapsible original homework image preview */
const OriginalImagePreview = ({ imagePreview, lang, t }: { imagePreview: string; lang: string; t: (zh: string, en: string) => string }) => {
  const [expanded, setExpanded] = useState(true);
  return (
    <div className="rounded-2xl bg-card border p-4 space-y-2">
      <button
        className="flex items-center justify-between w-full text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
          <ImageIcon className="h-4 w-4" />
          {t("📷 功課原圖", "📷 Original Homework")}
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <img
              src={imagePreview}
              alt="Original homework"
              className="w-full rounded-xl object-contain max-h-[500px] mt-2 cursor-zoom-in"
              onClick={() => window.open(imagePreview, "_blank")}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

type QuestionResult = {
  question_number: number;
  question_text: string;
  student_answer: string | null;
  is_correct: boolean | null;
  correct_answer: string | null;
  explanation: string;
  detected_subject?: string;
  confidence?: number;
};

type CheckResponse = {
  questions: QuestionResult[];
  summary: {
    total: number;
    correct: number;
    incorrect: number;
    score_percent: number;
  };
  encouragement: string;
};

const HomeworkCheckInner = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { lang, t } = useLanguage();
  const { toast } = useToast();

  const [questionText, setQuestionText] = useState("");
  const [userAnswer, setUserAnswer] = useState("");
  const [hintMode, setHintMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: t("檔案太大", "File too large"), description: t("請選擇 10MB 以下的圖片", "Please select an image under 10MB"), variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImagePreview(dataUrl);
      setImageBase64(dataUrl.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!questionText.trim() && !imageBase64) {
      toast({ title: t("請輸入題目", "Enter a question"), description: t("請輸入題目或上傳圖片", "Enter a question or upload an image"), variant: "destructive" });
      return;
    }

    setLoading(true);
    setResult(null);
    setElapsed(0);
    setProgress(0);
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const sec = Math.floor((Date.now() - startTime) / 1000);
      setElapsed(sec);
      setProgress(Math.min(95, Math.round((1 - Math.exp(-sec / 12)) * 100)));
    }, 500);

    try {
      const { data, error } = await supabase.functions.invoke("check-homework", {
        body: {
          question_text: questionText,
          user_answer: userAnswer || "",
          mode: hintMode ? "hint" : "full",
          lang,
          imageBase64,
        },
      });

      if (error) {
        let msg = error.message;
        try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* ignore */ }
        throw new Error(msg);
      }

      // Safely parse response
      const safe: CheckResponse = {
        questions: Array.isArray(data?.questions)
          ? data.questions.map((q: any, idx: number) => ({
              question_number: q.question_number || idx + 1,
              question_text: String(q.question_text || ""),
              student_answer: q.student_answer ? String(q.student_answer) : null,
              is_correct: typeof q.is_correct === "boolean" ? q.is_correct : null,
              correct_answer: q.correct_answer ? String(q.correct_answer) : null,
              explanation: q.explanation ? String(q.explanation) : "",
              detected_subject: q.detected_subject ? String(q.detected_subject) : undefined,
              confidence: typeof q.confidence === "number" ? q.confidence : undefined,
            }))
          : [],
        summary: {
          total: Number(data?.summary?.total || 0),
          correct: Number(data?.summary?.correct || 0),
          incorrect: Number(data?.summary?.incorrect || 0),
          score_percent: Number(data?.summary?.score_percent || 0),
        },
        encouragement: data?.encouragement ? String(data.encouragement) : "",
      };
      setResult(safe);
    } catch (err: any) {
      toast({ title: t("出錯了", "Error"), description: err.message, variant: "destructive" });
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setProgress(100);
      setTimeout(() => setLoading(false), 300);
    }
  };

  const handleReset = () => {
    setResult(null);
    setQuestionText("");
    setUserAnswer("");
    setImagePreview(null);
    setImageBase64(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/5 via-background to-primary/5">
      <header className="flex items-center gap-3 px-4 py-3 border-b bg-card/80 backdrop-blur-sm">
        <Button variant="ghost" size="sm" onClick={() => navigate("/homework")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {t("返回", "Back")}
        </Button>
        <h1 className="font-display text-lg font-bold">
          📝 {t("功課批改", "Homework Check")}
        </h1>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {result && result.questions.length > 0 ? (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {/* Original homework image preview */}
              {imagePreview && (
                <OriginalImagePreview imagePreview={imagePreview} lang={lang} t={t} />
              )}

              {/* Summary bar */}
              <div className="rounded-2xl bg-card border p-4">
                <div className="flex items-center justify-between">
                  <div className="text-center flex-1">
                    <p className="text-2xl font-extrabold text-foreground">{result.summary.total}</p>
                    <p className="text-xs text-muted-foreground">{t("總題數", "Total")}</p>
                  </div>
                  <div className="text-center flex-1">
                    <p className="text-2xl font-extrabold text-success">{result.summary.correct}</p>
                    <p className="text-xs text-muted-foreground">{t("正確", "Correct")}</p>
                  </div>
                  <div className="text-center flex-1">
                    <p className="text-2xl font-extrabold text-destructive">{result.summary.incorrect}</p>
                    <p className="text-xs text-muted-foreground">{t("錯誤", "Wrong")}</p>
                  </div>
                  <div className="text-center flex-1">
                    <p className="text-2xl font-extrabold text-secondary">{result.summary.score_percent}%</p>
                    <p className="text-xs text-muted-foreground">{t("分數", "Score")}</p>
                  </div>
                </div>
              </div>

              {/* Per-question results */}
              {result.questions.map((q, i) => (
                <motion.div
                  key={q.question_number}
                  className={`rounded-2xl border-2 bg-card p-4 space-y-2 ${
                    q.is_correct === true
                      ? "border-success/50"
                      : q.is_correct === false
                      ? "border-destructive/50"
                      : "border-muted"
                  }`}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08 }}
                >
                  {/* Question header */}
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-bold text-muted-foreground">
                      {t(`第 ${q.question_number} 題`, `Q${q.question_number}`)}
                    </p>
                    {q.is_correct === true && (
                      <span className="flex items-center gap-1 text-sm font-bold text-success">
                        <CheckCircle2 className="h-4 w-4" /> {t("正確", "Correct")}
                      </span>
                    )}
                    {q.is_correct === false && (
                      <span className="flex items-center gap-1 text-sm font-bold text-destructive">
                        <XCircle className="h-4 w-4" /> {t("錯誤", "Wrong")}
                      </span>
                    )}
                    {q.confidence != null && (
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        q.confidence >= 0.8 ? "bg-success/15 text-success" :
                        q.confidence >= 0.5 ? "bg-accent/15 text-accent-foreground" :
                        "bg-destructive/15 text-destructive"
                      }`}>
                        {t("信心", "Conf")} {Math.round(q.confidence * 100)}%
                      </span>
                    )}
                  </div>

                  {/* Question text */}
                  <p className="text-sm text-foreground">{q.question_text}</p>

                  {/* Student answer (if wrong) */}
                  {q.student_answer && q.is_correct === false && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">{t("你的答案：", "Your answer: ")}</span>
                      <FormattedExplanation text={q.student_answer} />
                    </div>
                  )}

                  {/* Correct answer */}
                  {q.correct_answer && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">{t("正確答案：", "Correct answer: ")}</span>
                      <FormattedExplanation text={q.correct_answer} />
                    </div>
                  )}

                  {/* Explanation (only for wrong / solve mode) */}
                  {q.explanation && (q.is_correct !== true) && (
                    <div className="pt-1 border-t">
                      <p className="text-xs text-muted-foreground mb-1">{t("📝 解釋", "📝 Explanation")}</p>
                      <div className="prose prose-sm max-w-none text-foreground [&_strong]:text-foreground [&_li]:text-foreground">
                        <FormattedExplanation text={q.explanation} />
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}

              {/* Encouragement */}
              {result.encouragement && (
                <p className="text-center text-sm font-semibold text-secondary">{result.encouragement}</p>
              )}

              {/* Actions */}
              <div className="flex gap-3 justify-center pt-2">
                <Button variant="outline" className="rounded-full" onClick={handleReset}>
                  {t("再批改一份", "Check Another")}
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="input" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
              {/* Photo upload */}
              <motion.div
                className="rounded-2xl border-2 border-dashed border-muted bg-card p-8 text-center"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                {imagePreview ? (
                  <div className="space-y-3">
                    <img src={imagePreview} alt="Homework" className="mx-auto max-h-48 rounded-xl object-contain" />
                    <Button variant="ghost" size="sm" onClick={() => { setImagePreview(null); setImageBase64(null); }}>
                      {t("移除圖片", "Remove Image")}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-secondary/10">
                      <Camera className="h-7 w-7 text-secondary" />
                    </div>
                    <h3 className="mt-3 font-display text-base font-bold">{t("上傳功課相片", "Upload Homework Photo")}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("拍照或選擇圖片，AI 會自動辨識中文功課、英文功課、數學功課", "Take a photo or select an image, AI auto-detects Chinese, English & Math homework")}
                    </p>
                    <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
                      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />
                      <Button className="rounded-full" onClick={() => fileInputRef.current?.click()}>
                        <Camera className="h-4 w-4 mr-1" /> {t("拍照", "Camera")}
                      </Button>
                      <Button variant="outline" className="rounded-full" onClick={() => { if (fileInputRef.current) { fileInputRef.current.removeAttribute("capture"); fileInputRef.current.click(); } }}>
                        <Upload className="h-4 w-4 mr-1" /> {t("選擇檔案", "Choose File")}
                      </Button>
                    </div>
                  </>
                )}
              </motion.div>

              {/* Manual input */}
              <motion.div
                className="rounded-2xl border bg-card p-6 space-y-3"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.15 }}
              >
                <h3 className="font-display font-bold">{t("或手動輸入題目", "Or Enter Question Manually")}</h3>
                <textarea
                  className="w-full rounded-xl border border-input bg-background p-3 text-sm min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={t("在此輸入或貼上題目...", "Type or paste the question here...")}
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                />
                <textarea
                  className="w-full rounded-xl border border-input bg-background p-3 text-sm min-h-[60px] resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={t("（選填）輸入你的答案，讓 AI 幫你批改...", "(Optional) Enter your answer for AI to check...")}
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                />

                {/* Hint mode toggle */}
                <div className="flex items-center gap-2">
                  <Switch id="hint-mode" checked={hintMode} onCheckedChange={setHintMode} />
                  <Label htmlFor="hint-mode" className="flex items-center gap-1 text-sm cursor-pointer">
                    <Lightbulb className="h-4 w-4 text-accent" />
                    {t("提示模式（先給線索，不直接給答案）", "Hint Mode (clues only, no full answer)")}
                  </Label>
                </div>

                {loading && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{t("AI 批改中...", "AI Checking...")}</span>
                      <span>{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")} · {progress}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-secondary transition-all duration-500 ease-out"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                <Button className="w-full rounded-full" onClick={handleSubmit} disabled={loading}>
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                      {t("批改中...", "Checking...")}
                    </span>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-1" /> {t("開始批改", "Check Homework")}
                    </>
                  )}
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

const HomeworkCheck = () => {
  const [searchParams] = useSearchParams();
  const isGuest = searchParams.get("guest") === "1";

  if (isGuest) return <HomeworkCheckInner />;

  return (
    <AuthGuard>
      <HomeworkCheckInner />
    </AuthGuard>
  );
};

export default HomeworkCheck;
