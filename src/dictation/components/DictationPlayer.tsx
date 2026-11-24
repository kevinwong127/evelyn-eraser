import { useState, useEffect, useCallback, useRef } from 'react';
import { useLanguage } from '@/dictation/contexts/LanguageContext';
import { useElevenLabsTTS, getVoicesForLanguage } from '@/dictation/hooks/useElevenLabsTTS';
import { useSpeechSynthesis, DictationLanguage } from '@/dictation/hooks/useSpeechSynthesis';
import { useDictation, SegmentLength } from '@/dictation/hooks/useDictation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Eye, 
  EyeOff, 
  SkipBack, 
  RotateCcw, 
  SkipForward, 
  Square, 
  Volume2,
  Check,
  Loader2,
  Settings,
  ChevronDown,
  Mic,
  Languages,
  AlignLeft
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface DictationPlayerProps {
  text: string;
  dictationLanguage: DictationLanguage;
  setDictationLanguage: (lang: DictationLanguage) => void;
  selectedVoice: SpeechSynthesisVoice | null;
  setSelectedVoice: (voice: SpeechSynthesisVoice | null) => void;
  selectedElevenLabsVoiceId: string;
  setSelectedElevenLabsVoiceId: (id: string) => void;
  speed: number;
  setSpeed: (speed: number) => void;
  segmentLength: SegmentLength;
  setSegmentLength: (length: SegmentLength) => void;
  customLength?: number;
  setCustomLength?: (length: number) => void;
  onStop: () => void;
}

function CustomLengthInputPlayer({ customLength, setCustomLength }: { customLength?: number; setCustomLength: (n: number) => void }) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState(customLength || 6);

  return (
    <div className="flex items-center gap-2 mt-2">
      <Input
        type="number"
        min={2}
        max={50}
        value={draft}
        onChange={(e) => setDraft(Math.max(2, Math.min(50, parseInt(e.target.value) || 2)))}
        className="w-24"
      />
      <span className="text-sm text-muted-foreground">{t('customLengthLabel')}</span>
      <Button size="sm" onClick={() => setCustomLength(draft)} className="ml-1">
        {t('confirm')}
      </Button>
    </div>
  );
}

export function DictationPlayer({
  text,
  dictationLanguage,
  setDictationLanguage,
  selectedVoice,
  setSelectedVoice,
  selectedElevenLabsVoiceId,
  setSelectedElevenLabsVoiceId,
  speed,
  setSpeed,
  segmentLength,
  setSegmentLength,
  customLength,
  setCustomLength,
  onStop,
}: DictationPlayerProps) {
  const { t, language } = useLanguage();
  const elevenLabs = useElevenLabsTTS();
  const browserTTS = useSpeechSynthesis();
  const [isTextVisible, setIsTextVisible] = useState(false);
  const [readPunctuation, setReadPunctuation] = useState(true);
  const [countdown, setCountdown] = useState(3);
  const [isCountingDown, setIsCountingDown] = useState(true);
  const speakingRef = useRef(false);
  
  const {
    currentSegment,
    currentIndex,
    totalSegments,
    isFirstSegment,
    isLastSegment,
    goToNext,
    goToPrevious,
    reset,
  } = useDictation(text, { segmentLength, customLength });

  const speaking = elevenLabs.speaking || browserTTS.speaking;
  const loading = elevenLabs.loading;
  const usesBrowserTTS = true;

  const speakText = useCallback(async (textToSpeak: string, onEnd?: () => void) => {
    if (usesBrowserTTS) {
      // Cantonese: use browser TTS with zh-HK voice
      browserTTS.speak(textToSpeak, {
        voice: selectedVoice,
        rate: speed,
        language: dictationLanguage,
        onEnd,
      });
      return;
    }

    // Mandarin & English: use ElevenLabs
    try {
      await elevenLabs.speak(textToSpeak, {
        voiceId: selectedElevenLabsVoiceId,
        speed,
        onEnd,
      });
    } catch {
      console.warn('ElevenLabs failed, falling back to browser TTS');
      toast({
        title: t('ttsFallback'),
        description: t('ttsFallbackDesc'),
      });
      browserTTS.speak(textToSpeak, {
        voice: selectedVoice,
        rate: speed,
        language: dictationLanguage,
        onEnd,
      });
    }
  }, [usesBrowserTTS, elevenLabs, browserTTS, selectedElevenLabsVoiceId, selectedVoice, speed, dictationLanguage, t]);

  const speakCurrentSegment = useCallback(() => {
    let textToSpeak = currentSegment;

    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    if (readPunctuation) {
      const isEnglish = dictationLanguage === 'english';
      const punctuationMap: Record<string, string> = {
        // Chinese punctuation
        '。': isEnglish ? ' period ' : ' 句號 ',
        '，': isEnglish ? ' comma ' : ' 逗號 ',
        '！': isEnglish ? ' exclamation mark ' : ' 感嘆號 ',
        '？': isEnglish ? ' question mark ' : ' 問號 ',
        '；': isEnglish ? ' semicolon ' : ' 分號 ',
        '：': isEnglish ? ' colon ' : ' 冒號 ',
        '、': isEnglish ? ' comma ' : ' 頓號 ',
        '「': isEnglish ? ' open quote ' : ' 開引號 ',
        '」': isEnglish ? ' close quote ' : ' 閉引號 ',
        '《': isEnglish ? ' open bracket ' : ' 開書名號 ',
        '》': isEnglish ? ' close bracket ' : ' 閉書名號 ',
        // English punctuation (also language-aware)
        '.': isEnglish ? ' period ' : ' 句號 ',
        ',': isEnglish ? ' comma ' : ' 逗號 ',
        '!': isEnglish ? ' exclamation mark ' : ' 感嘆號 ',
        '?': isEnglish ? ' question mark ' : ' 問號 ',
        ';': isEnglish ? ' semicolon ' : ' 分號 ',
        ':': isEnglish ? ' colon ' : ' 冒號 ',
        '(': isEnglish ? ' open parenthesis ' : ' 左括號 ',
        ')': isEnglish ? ' close parenthesis ' : ' 右括號 ',
        "'": isEnglish ? ' apostrophe ' : ' 撇號 ',
        '"': isEnglish ? ' quotation mark ' : ' 引號 ',
      };
      
      Object.entries(punctuationMap).forEach(([punct, replacement]) => {
        textToSpeak = textToSpeak.replace(new RegExp(escapeRegExp(punct), 'g'), replacement);
      });
    }

    // Add sentence-end short pauses
    textToSpeak = textToSpeak.replace(/(句號|問號|感嘆號|period|question mark|exclamation mark)\s*/g, '$1 ... ');

    // Add long pause at segment end
    textToSpeak = textToSpeak.trimEnd() + ' ...... ';
    
    speakText(textToSpeak);
  }, [currentSegment, dictationLanguage, readPunctuation, speakText]);

  // 3-second countdown before first segment
  useEffect(() => {
    if (!isCountingDown) return;
    if (countdown <= 0) {
      setIsCountingDown(false);
      speakCurrentSegment();
      return;
    }
    const timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, isCountingDown]);

  useEffect(() => {
    if (!isCountingDown && currentSegment) {
      speakCurrentSegment();
    }
  }, [currentIndex]); // Only re-speak when segment changes

  const handleWordClick = (word: string) => {
    if (isTextVisible) {
      speakText(word);
    }
  };

  const stopAll = useCallback(() => {
    elevenLabs.stop();
    browserTTS.stop();
  }, [elevenLabs, browserTTS]);

  const maskText = (text: string): string => {
    return text.replace(/./g, '●');
  };

  const renderClickableText = () => {
    if (!isTextVisible) {
      return (
        <p className="text-3xl md:text-4xl font-medium tracking-wider text-center leading-relaxed">
          {maskText(currentSegment)}
        </p>
      );
    }

    const chineseChars = currentSegment.match(/[\u4e00-\u9fff]/g)?.length || 0;
    const englishChars = currentSegment.match(/[a-zA-Z]/g)?.length || 0;
    const isChinese = chineseChars > englishChars;

    if (isChinese) {
      return (
        <p className="text-3xl md:text-4xl font-medium tracking-wider text-center leading-relaxed flex flex-wrap justify-center gap-1">
          {currentSegment.split('').map((char, i) => (
            <span
              key={i}
              onClick={() => handleWordClick(char)}
              className="cursor-pointer hover:text-primary hover:bg-primary/10 px-1 py-0.5 rounded transition-colors"
            >
              {char}
            </span>
          ))}
        </p>
      );
    } else {
      const words = currentSegment.split(/(\s+)/);
      return (
        <p className="text-2xl md:text-3xl font-medium text-center leading-relaxed">
          {words.map((word, i) => (
            word.trim() ? (
              <span
                key={i}
                onClick={() => handleWordClick(word)}
                className="cursor-pointer hover:text-primary hover:bg-primary/10 px-1 py-0.5 rounded transition-colors"
              >
                {word}
              </span>
            ) : (
              <span key={i}>{word}</span>
            )
          ))}
        </p>
      );
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-8 md:p-12 shadow-card">
        <div className="flex items-center justify-between mb-6">
          <span className="text-sm font-medium text-muted-foreground">
            {t('currentSegment')}: {currentIndex + 1} / {totalSegments}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsTextVisible(!isTextVisible)}
            className="gap-2"
          >
            {isTextVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {isTextVisible ? t('hideText') : t('showText')}
          </Button>
        </div>

        <div className="min-h-[150px] flex items-center justify-center py-8">
          {isCountingDown ? (
            <div className="flex flex-col items-center gap-3">
              <span className="text-6xl font-bold text-primary animate-pulse">{countdown || '⏵'}</span>
              <span className="text-muted-foreground">{t('getReady') || '準備開始...'}</span>
            </div>
          ) : loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{t('loadingAudio')}</span>
            </div>
          ) : (
            renderClickableText()
          )}
        </div>

        {isTextVisible && (
          <p className="text-sm text-center text-muted-foreground mt-4">
            {t('clickToHear')}
          </p>
        )}
      </Card>

      {/* Collapsible Settings */}
      <Collapsible defaultOpen>
        <Card className="p-4 shadow-soft">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full flex items-center justify-between gap-2 p-2">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                <span className="font-medium">{t('setupTitle')}</span>
              </div>
              <ChevronDown className="w-4 h-4 transition-transform [[data-state=open]_&]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {/* Language */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Languages className="w-4 h-4" />
                  {t('dictationLanguage')}
                </Label>
                <Select value={dictationLanguage} onValueChange={(v) => setDictationLanguage(v as DictationLanguage)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cantonese">{t('cantonese')}</SelectItem>
                    <SelectItem value="english">{t('english')}</SelectItem>
                    <SelectItem value="mandarin">{t('mandarin')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Voice */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Mic className="w-4 h-4" />
                  {usesBrowserTTS ? t('voice') : t('aiVoice')}
                </Label>
                {usesBrowserTTS ? (
                  <Select
                    value={selectedVoice?.name || ''}
                    onValueChange={(name) => {
                      const voice = browserTTS.getVoicesForLanguage(dictationLanguage).find(v => v.name === name) || null;
                      setSelectedVoice(voice);
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder={t('selectVoice')} /></SelectTrigger>
                    <SelectContent>
                      {browserTTS.getVoicesForLanguage(dictationLanguage).map((voice) => (
                        <SelectItem key={voice.name} value={voice.name}>
                          {voice.name} ({voice.lang})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={selectedElevenLabsVoiceId} onValueChange={setSelectedElevenLabsVoiceId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {getVoicesForLanguage(dictationLanguage).map((voice) => (
                        <SelectItem key={voice.id} value={voice.id}>
                          {language === 'zh' ? voice.nameZh : voice.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Segment Length */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <AlignLeft className="w-4 h-4" />
                  {t('segmentLength')}
                </Label>
                <Select value={segmentLength} onValueChange={(v) => setSegmentLength(v as SegmentLength)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">{t('segmentShort')}</SelectItem>
                    <SelectItem value="medium">{t('segmentMedium')}</SelectItem>
                    <SelectItem value="long">{t('segmentLong')}</SelectItem>
                    <SelectItem value="custom">{t('segmentCustom')}</SelectItem>
                  </SelectContent>
                </Select>
                {segmentLength === 'custom' && setCustomLength && (
                  <CustomLengthInputPlayer customLength={customLength} setCustomLength={setCustomLength} />
                )}
              </div>
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Card className="p-6 shadow-soft">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Switch
                id="punctuation"
                checked={readPunctuation}
                onCheckedChange={setReadPunctuation}
              />
              <Label htmlFor="punctuation" className="cursor-pointer">
                {t('readPunctuation')} <span className="text-muted-foreground text-xs">{t('experimental')}</span>
              </Label>
            </div>

            <div className="flex items-center gap-3 min-w-[200px]">
              <Volume2 className="w-4 h-4 text-muted-foreground" />
              <Slider
                value={[speed]}
                onValueChange={([v]) => setSpeed(v)}
                min={0.5}
                max={1.2}
                step={0.05}
                className="flex-1"
              />
              <span className="text-sm font-medium w-12">{speed.toFixed(2)}x</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="lg"
              onClick={reset}
              disabled={isFirstSegment}
              className="gap-2"
            >
              <SkipBack className="w-5 h-5" />
              <SkipBack className="w-5 h-5 -ml-4" />
            </Button>

            <Button
              variant="outline"
              size="lg"
              onClick={goToPrevious}
              disabled={isFirstSegment}
              className="gap-2"
            >
              <SkipBack className="w-5 h-5" />
              {t('previous')}
            </Button>

            <Button
              variant="outline"
              size="lg"
              onClick={speakCurrentSegment}
              disabled={speaking || loading}
              className="gap-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <RotateCcw className="w-5 h-5" />
              )}
              {t('repeat')}
            </Button>

            <Button
              size="lg"
              onClick={goToNext}
              className="gap-2"
            >
              {isLastSegment ? (
                <>
                  <Check className="w-5 h-5" />
                  {t('finish')}
                </>
              ) : (
                <>
                  <SkipForward className="w-5 h-5" />
                  {t('next')}
                </>
              )}
            </Button>
          </div>

          <Button
            variant="destructive"
            onClick={() => {
              stopAll();
              onStop();
            }}
            className="gap-2"
          >
            <Square className="w-4 h-4" />
            {t('stopDictation')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
