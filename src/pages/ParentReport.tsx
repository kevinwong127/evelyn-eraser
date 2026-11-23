import { ArrowLeft, BarChart3, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import AuthGuard from "@/components/AuthGuard";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { format, subDays, startOfDay } from "date-fns";
import jsPDF from "jspdf";

const COLORS = ["hsl(262,83%,58%)", "hsl(174,72%,56%)", "hsl(36,100%,62%)", "hsl(0,84%,60%)"];

type Submission = {
  id: string;
  subject: string;
  is_correct: boolean | null;
  created_at: string;
};

const ParentReportInner = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [childProfiles, setChildProfiles] = useState<{ id: string; display_name: string }[]>([]);
  const [selectedChild, setSelectedChild] = useState<string | null>(null);

  useEffect(() => {
    const fetchChildren = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("parent_id", session.user.id);
      if (data?.length) {
        setChildProfiles(data);
        setSelectedChild(data[0].id);
      }
    };
    fetchChildren();
  }, []);

  useEffect(() => {
    if (!selectedChild) { setLoading(false); return; }
    const fetchData = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("submissions")
        .select("id, subject, is_correct, created_at")
        .eq("user_id", selectedChild)
        .gte("created_at", subDays(new Date(), 30).toISOString())
        .order("created_at", { ascending: true });
      setSubmissions((data as Submission[]) || []);
      setLoading(false);
    };
    fetchData();
  }, [selectedChild]);

  // Weekly accuracy data
  const weeklyData = Array.from({ length: 7 }, (_, i) => {
    const day = startOfDay(subDays(new Date(), 6 - i));
    const dayStr = format(day, "MM/dd");
    const daySubs = submissions.filter(s => {
      const d = startOfDay(new Date(s.created_at));
      return d.getTime() === day.getTime();
    });
    const correct = daySubs.filter(s => s.is_correct === true).length;
    const total = daySubs.filter(s => s.is_correct !== null).length;
    return { day: dayStr, accuracy: total > 0 ? Math.round((correct / total) * 100) : 0, total };
  });

  // Subject breakdown
  const subjectData = ["chinese", "english", "math-cn", "math-en"].map(sub => {
    const subs = submissions.filter(s => s.subject === sub && s.is_correct !== null);
    return { name: sub, value: subs.length, correct: subs.filter(s => s.is_correct).length };
  }).filter(d => d.value > 0);

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Homework Helper HK - Parent Report", 20, 20);
    doc.setFontSize(12);
    doc.text(`Generated: ${format(new Date(), "yyyy-MM-dd HH:mm")}`, 20, 30);
    doc.text(`Total submissions: ${submissions.length}`, 20, 40);
    const correct = submissions.filter(s => s.is_correct === true).length;
    const total = submissions.filter(s => s.is_correct !== null).length;
    doc.text(`Overall accuracy: ${total > 0 ? Math.round((correct / total) * 100) : 0}%`, 20, 50);
    doc.save("homework-report.pdf");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-secondary/5">
      <header className="flex items-center gap-3 px-4 py-3 border-b bg-card/80 backdrop-blur-sm">
        <Button variant="ghost" size="sm" onClick={() => navigate("/homework")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> {t("返回", "Back")}
        </Button>
        <h1 className="font-display text-lg font-bold flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          {t("家長報告", "Parent Report")}
        </h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Child selector */}
        {childProfiles.length > 1 && (
          <div className="flex gap-2 mb-6 flex-wrap">
            {childProfiles.map(c => (
              <Button
                key={c.id}
                variant={selectedChild === c.id ? "secondary" : "ghost"}
                size="sm"
                className="rounded-full"
                onClick={() => setSelectedChild(c.id)}
              >
                {c.display_name}
              </Button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : submissions.length === 0 ? (
          <motion.div className="text-center py-12" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <p className="text-muted-foreground">{t("暫無數據。請先讓小朋友完成一些批改。", "No data yet. Have your child complete some homework checks first.")}</p>
          </motion.div>
        ) : (
          <div className="space-y-6">
            {/* Accuracy trend */}
            <motion.div className="rounded-2xl border bg-card p-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <h3 className="font-display font-bold mb-3">{t("過去 7 天準確率", "7-Day Accuracy Trend")}</h3>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" fontSize={12} />
                  <YAxis domain={[0, 100]} fontSize={12} />
                  <Tooltip />
                  <Line type="monotone" dataKey="accuracy" stroke="hsl(174,72%,56%)" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </motion.div>

            {/* Subject breakdown */}
            <motion.div className="rounded-2xl border bg-card p-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <h3 className="font-display font-bold mb-3">{t("科目分佈", "Subject Breakdown")}</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={subjectData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                    {subjectData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </motion.div>

            <Button variant="outline" className="w-full rounded-full" onClick={handleExportPDF}>
              <Download className="h-4 w-4 mr-1" /> {t("匯出 PDF 報告", "Export PDF Report")}
            </Button>
          </div>
        )}
      </main>
    </div>
  );
};

const ParentReport = () => (
  <AuthGuard requiredRole="parent">
    <ParentReportInner />
  </AuthGuard>
);

export default ParentReport;
