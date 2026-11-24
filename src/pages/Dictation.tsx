import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useLanguage, LanguageProvider } from "@/dictation/contexts/LanguageContext";
import { AuthProvider, useAuth } from "@/dictation/contexts/AuthContext";
import { useDictationSettings } from "@/dictation/hooks/useDictationSettings";
import { DictationLanguage } from "@/dictation/hooks/useSpeechSynthesis";
import { SegmentLength } from "@/dictation/hooks/useDictation";
import { ELEVENLABS_VOICES, getVoicesForLanguage } from "@/dictation/hooks/useElevenLabsTTS";
import { LanguageToggle } from "@/dictation/components/LanguageToggle";
import { UserMenu } from "@/dictation/components/UserMenu";
import { DictationSetup } from "@/dictation/components/DictationSetup";
import { DictationPlayer } from "@/dictation/components/DictationPlayer";
import { ArrowLeft, BookOpen } from "lucide-react";

function DictationApp() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { settings, saveSettings, loading: settingsLoading } = useDictationSettings();
  const [isActive, setIsActive] = useState(false);
  const [dictationLanguage, setDictationLanguage] = useState<DictationLanguage>("cantonese");
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [selectedElevenLabsVoiceId, setSelectedElevenLabsVoiceId] = useState(getVoicesForLanguage("cantonese")[0].id);
  const [speed, setSpeed] = useState(0.7);
  const [text, setText] = useState("");
  const [segmentLength, setSegmentLength] = useState<SegmentLength>("short");
  const [customLength, setCustomLength] = useState(6);

  useEffect(() => {
    if (!settingsLoading) {
      setDictationLanguage(settings.dictationLanguage);
      setSpeed(settings.speed);
      if (settings.voiceName) {
        const elevenLabsVoice = ELEVENLABS_VOICES.find((voice) => voice.id === settings.voiceName);
        if (elevenLabsVoice) setSelectedElevenLabsVoiceId(elevenLabsVoice.id);
      }
    }
  }, [settingsLoading, settings]);

  useEffect(() => {
    if (!text.trim()) return;
    const chineseChars = text.match(/[\u4e00-\u9fff]/g)?.length || 0;
    const englishChars = text.match(/[a-zA-Z]/g)?.length || 0;
    if (englishChars > chineseChars && dictationLanguage !== "english") {
      setDictationLanguage("english");
    } else if (chineseChars > englishChars && dictationLanguage === "english") {
      setDictationLanguage("cantonese");
    }
  }, [text, dictationLanguage]);

  useEffect(() => {
    const voices = getVoicesForLanguage(dictationLanguage);
    if (!voices.some((voice) => voice.id === selectedElevenLabsVoiceId) && voices.length > 0) {
      setSelectedElevenLabsVoiceId(voices[0].id);
    }
  }, [dictationLanguage, selectedElevenLabsVoiceId]);

  useEffect(() => {
    if (!settingsLoading && user) {
      const timeout = setTimeout(() => {
        saveSettings({ dictationLanguage, voiceName: selectedElevenLabsVoiceId, speed });
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [dictationLanguage, selectedElevenLabsVoiceId, speed, user, settingsLoading, saveSettings]);

  return (
    <div className="dictation-theme min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
        <div className="container mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/" aria-label="返回首頁" className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="rounded-xl bg-primary p-2 text-primary-foreground">
              <BookOpen className="h-5 w-5" />
            </div>
            <h1 className="text-lg font-bold sm:text-xl">{t("appTitle")}</h1>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-8">
        {!isActive ? (
          <DictationSetup
            dictationLanguage={dictationLanguage}
            setDictationLanguage={setDictationLanguage}
            selectedVoice={selectedVoice}
            setSelectedVoice={setSelectedVoice}
            selectedElevenLabsVoiceId={selectedElevenLabsVoiceId}
            setSelectedElevenLabsVoiceId={setSelectedElevenLabsVoiceId}
            speed={speed}
            setSpeed={setSpeed}
            text={text}
            setText={setText}
            segmentLength={segmentLength}
            setSegmentLength={setSegmentLength}
            customLength={customLength}
            setCustomLength={setCustomLength}
            onStart={() => { if (text.trim()) setIsActive(true); }}
          />
        ) : (
          <DictationPlayer
            text={text}
            dictationLanguage={dictationLanguage}
            setDictationLanguage={setDictationLanguage}
            selectedVoice={selectedVoice}
            setSelectedVoice={setSelectedVoice}
            selectedElevenLabsVoiceId={selectedElevenLabsVoiceId}
            setSelectedElevenLabsVoiceId={setSelectedElevenLabsVoiceId}
            speed={speed}
            setSpeed={setSpeed}
            segmentLength={segmentLength}
            setSegmentLength={setSegmentLength}
            customLength={customLength}
            setCustomLength={setCustomLength}
            onStop={() => setIsActive(false)}
          />
        )}
      </main>
    </div>
  );
}

export default function Dictation() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <DictationApp />
      </LanguageProvider>
    </AuthProvider>
  );
}
