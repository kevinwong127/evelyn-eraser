import { BookOpen, History, ArrowLeft, Languages, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import AuthGuard from "@/components/AuthGuard";

const subjects = [
  { id: "chinese", label: "中文", emoji: "📖", desc: "閱讀、理解、作文", descEn: "Reading, Comprehension, Writing" },
  { id: "english", label: "English", emoji: "🔤", desc: "Grammar, Reading, Writing", descEn: "Grammar, Reading, Writing" },
  { id: "math-cn", label: "中數", emoji: "🔢", desc: "中文數學題", descEn: "Chinese Math" },
  { id: "math-en", label: "英數", emoji: "➕", desc: "English Math", descEn: "English Math" },
];

const HomeworkDashboardInner = () => {
  const navigate = useNavigate();
  const { lang, setLang, t } = useLanguage();
  const [displayName, setDisplayName] = useState("");
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", session.user.id)
        .maybeSingle();
      if (profile) setDisplayName(profile.display_name || "");

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id);
      if (roles?.length) setUserRole(roles[0].role);
    };
    fetchProfile();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-secondary/5 via-background to-primary/5">
      <header className="flex items-center justify-between px-4 py-3 border-b bg-card/80 backdrop-blur-sm">
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {t("返回", "Back")}
        </Button>
        <h1 className="font-display text-lg font-bold flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-secondary" />
          {t("功課小幫手", "Homework Helper")}
        </h1>
        <Button variant="ghost" size="sm" onClick={() => setLang(lang === "zh" ? "en" : "zh")}>
          <Languages className="h-4 w-4 mr-1" />
          {lang === "zh" ? "EN" : "繁"}
        </Button>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {displayName && (
            <p className="text-center text-muted-foreground mb-1">
              {t(`👋 你好，${displayName}！`, `👋 Hello, ${displayName}!`)}
            </p>
          )}
          <h2 className="font-display text-2xl font-extrabold text-center md:text-3xl">
            {t("選擇科目", "Choose a Subject")}
          </h2>
          <p className="text-center text-muted-foreground mt-1">
            {t("上傳功課相片，AI 即時批改", "Upload homework photo, AI checks instantly")}
          </p>
        </motion.div>

        <div className="grid grid-cols-2 gap-4 mt-8">
          {subjects.map((s, i) => (
            <motion.button
              key={s.id}
              className="flex flex-col items-center gap-2 rounded-2xl border-2 border-muted bg-card p-6 hover:border-secondary hover:shadow-md transition-all active:scale-95"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.08 }}
              onClick={() => navigate(`/homework/check?subject=${s.id}`)}
            >
              <span className="text-4xl">{s.emoji}</span>
              <span className="font-display text-lg font-bold">{s.label}</span>
              <span className="text-xs text-muted-foreground">{lang === "zh" ? s.desc : s.descEn}</span>
            </motion.button>
          ))}
        </div>

        <div className="flex gap-3 mt-10 justify-center flex-wrap">
          <Button variant="outline" className="rounded-full" onClick={() => navigate("/homework/history")}>
            <History className="h-4 w-4 mr-1" />
            {t("批改紀錄", "History")}
          </Button>
          {userRole === "parent" && (
            <Button variant="outline" className="rounded-full" onClick={() => navigate("/homework/report")}>
              <BarChart3 className="h-4 w-4 mr-1" />
              {t("家長報告", "Parent Report")}
            </Button>
          )}
        </div>
      </main>
    </div>
  );
};

const HomeworkDashboard = () => (
  <AuthGuard>
    <HomeworkDashboardInner />
  </AuthGuard>
);

export default HomeworkDashboard;
