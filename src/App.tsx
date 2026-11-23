import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import Index from "./pages/Index";

const Auth = lazy(() => import("./pages/Auth"));
const QuickStart = lazy(() => import("./pages/QuickStart"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const HomeworkDashboard = lazy(() => import("./pages/HomeworkDashboard"));
const HomeworkCheck = lazy(() => import("./pages/HomeworkCheck"));
const HomeworkHistory = lazy(() => import("./pages/HomeworkHistory"));
const ParentReport = lazy(() => import("./pages/ParentReport"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <LanguageProvider>
        <Toaster />
        <Sonner />
        <HashRouter>
          <Suspense fallback={<div role="status" className="flex min-h-screen items-center justify-center text-muted-foreground">載入中…</div>}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/quick-start" element={<QuickStart />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/homework" element={<HomeworkDashboard />} />
              <Route path="/homework/check" element={<HomeworkCheck />} />
              <Route path="/homework/history" element={<HomeworkHistory />} />
              <Route path="/homework/report" element={<ParentReport />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </HashRouter>
      </LanguageProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
