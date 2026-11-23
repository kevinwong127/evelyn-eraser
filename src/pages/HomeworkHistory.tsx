import { ArrowLeft, History, CheckCircle2, XCircle, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import AuthGuard from "@/components/AuthGuard";
import { format } from "date-fns";

type Submission = {
  id: string;
  subject: string;
  question_text: string;
  user_answer: string;
  correct_answer: string | null;
  is_correct: boolean | null;
  created_at: string;
};

const subjectEmoji: Record<string, string> = {
  chinese: "📖",
  english: "🔤",
  "math-cn": "🔢",
  "math-en": "➕",
};

const HomeworkHistoryInner = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSubject, setFilterSubject] = useState<string | null>(null);

  useEffect(() => {
    const fetchSubmissions = async () => {
      let query = supabase
        .from("submissions")
        .select("id, subject, question_text, user_answer, correct_answer, is_correct, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (filterSubject) query = query.eq("subject", filterSubject);
      const { data } = await query;
      setSubmissions((data as Submission[]) || []);
      setLoading(false);
    };
    fetchSubmissions();
  }, [filterSubject]);

  const stats = submissions.reduce(
    (acc, s) => {
      if (s.is_correct === true) acc.correct++;
      if (s.is_correct === false) acc.incorrect++;
      return acc;
    },
    { correct: 0, incorrect: 0 }
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/5 via-background to-primary/5">
      <header className="flex items-center gap-3 px-4 py-3 border-b bg-card/80 backdrop-blur-sm">
        <Button variant="ghost" size="sm" onClick={() => navigate("/homework")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {t("返回", "Back")}
        </Button>
        <h1 className="font-display text-lg font-bold flex items-center gap-2">
          <History className="h-5 w-5 text-secondary" />
          {t("批改紀錄", "History")}
        </h1>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Stats */}
        {submissions.length > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="rounded-xl bg-success/10 p-3 text-center">
              <p className="text-2xl font-extrabold text-success">{stats.correct}</p>
              <p className="text-xs text-muted-foreground">{t("正確", "Correct")}</p>
            </div>
            <div className="rounded-xl bg-destructive/10 p-3 text-center">
              <p className="text-2xl font-extrabold text-destructive">{stats.incorrect}</p>
              <p className="text-xs text-muted-foreground">{t("不正確", "Incorrect")}</p>
            </div>
          </div>
        )}

        {/* Filter */}
        <div className="flex gap-2 mb-4 flex-wrap">
          <Button
            variant={filterSubject === null ? "secondary" : "ghost"}
            size="sm"
            className="rounded-full text-xs"
            onClick={() => setFilterSubject(null)}
          >
            {t("全部", "All")}
          </Button>
          {["chinese", "english", "math-cn", "math-en"].map((s) => (
            <Button
              key={s}
              variant={filterSubject === s ? "secondary" : "ghost"}
              size="sm"
              className="rounded-full text-xs"
              onClick={() => setFilterSubject(s)}
            >
              {subjectEmoji[s]} {s}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : submissions.length === 0 ? (
          <motion.div
            className="text-center py-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-muted">
              <History className="h-10 w-10 text-muted-foreground" />
            </div>
            <h2 className="mt-4 font-display text-xl font-bold">{t("暫無紀錄", "No Records Yet")}</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              {t("完成第一次批改後，紀錄會出現在這裡", "Records will appear here after your first check")}
            </p>
            <Button variant="secondary" className="mt-6 rounded-full" onClick={() => navigate("/homework")}>
              {t("開始批改", "Start Checking")}
            </Button>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {submissions.map((s, i) => (
              <motion.div
                key={s.id}
                className="rounded-xl border bg-card p-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{subjectEmoji[s.subject]} {s.subject}</span>
                      <span>·</span>
                      <span>{format(new Date(s.created_at), "MM/dd HH:mm")}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium truncate">{s.question_text}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t("你的答案：", "Your answer: ")}{s.user_answer}</p>
                  </div>
                  {s.is_correct !== null && (
                    s.is_correct ? (
                      <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                    ) : (
                      <XCircle className="h-5 w-5 text-destructive shrink-0" />
                    )
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

const HomeworkHistory = () => (
  <AuthGuard>
    <HomeworkHistoryInner />
  </AuthGuard>
);

export default HomeworkHistory;
