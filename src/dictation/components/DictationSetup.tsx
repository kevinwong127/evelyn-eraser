import { useState } from 'react';
import { createWorker } from 'tesseract.js';
import { useLanguage } from '@/dictation/contexts/LanguageContext';
import { useSpeechSynthesis, DictationLanguage } from '@/dictation/hooks/useSpeechSynthesis';
import { SegmentLength } from '@/dictation/hooks/useDictation';
import { getVoicesForLanguage } from '@/dictation/hooks/useElevenLabsTTS';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Upload, Play, BookOpen, Languages, Volume2, Loader2, Mic, AlignLeft } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface DictationSetupProps {
  dictationLanguage: DictationLanguage;
  setDictationLanguage: (lang: DictationLanguage) => void;
  selectedVoice: SpeechSynthesisVoice | null;
  setSelectedVoice: (voice: SpeechSynthesisVoice | null) => void;
  selectedElevenLabsVoiceId: string;
  setSelectedElevenLabsVoiceId: (id: string) => void;
  speed: number;
  setSpeed: (speed: number) => void;
  text: string;
  setText: (text: string) => void;
  segmentLength: SegmentLength;
  setSegmentLength: (length: SegmentLength) => void;
  customLength: number;
  setCustomLength: (length: number) => void;
  onStart: () => void;
}

function CustomLengthInput({ customLength, setCustomLength }: { customLength: number; setCustomLength: (n: number) => void }) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState(customLength);

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

export function DictationSetup({
  dictationLanguage,
  setDictationLanguage,
  selectedVoice,
  setSelectedVoice,
  selectedElevenLabsVoiceId,
  setSelectedElevenLabsVoiceId,
  speed,
  setSpeed,
  text,
  setText,
  segmentLength,
  setSegmentLength,
  customLength,
  setCustomLength,
  onStart,
}: DictationSetupProps) {
  const browserTTS = useSpeechSynthesis();
  const usesBrowserTTS = true;
  const browserVoices = browserTTS.getVoicesForLanguage(dictationLanguage);
  const { t, language } = useLanguage();
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);

  const handleImageUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/webp';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        setIsProcessingOCR(true);
        try {
          const ocrLang = dictationLanguage === 'english' ? 'eng' : 'chi_tra+eng';
          
          const worker = await createWorker(ocrLang);
          const { data: { text: extractedText } } = await worker.recognize(file);
          await worker.terminate();
          
          if (extractedText.trim()) {
            setText(text ? text + '\n' + extractedText.trim() : extractedText.trim());
            toast({
              title: t('ocrSuccess'),
              description: t('ocrSuccessDesc'),
            });
          } else {
            toast({
              title: t('ocrNoText'),
              description: t('ocrNoTextDesc'),
              variant: 'destructive',
            });
          }
        } catch (error) {
          console.error('OCR error:', error);
          toast({
            title: t('ocrError'),
            description: t('ocrErrorDesc'),
            variant: 'destructive',
          });
        } finally {
          setIsProcessingOCR(false);
        }
      }
    };
    input.click();
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 shadow-soft">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-xl bg-primary/10">
            <Languages className="w-5 h-5 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">{t('setupTitle')}</h2>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Language Selection */}
          <div className="space-y-2">
            <Label>{t('dictationLanguage')}</Label>
            <Select value={dictationLanguage} onValueChange={(v) => setDictationLanguage(v as DictationLanguage)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cantonese">{t('cantonese')}</SelectItem>
                <SelectItem value="english">{t('english')}</SelectItem>
                <SelectItem value="mandarin">{t('mandarin')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Voice Selection - Browser for Cantonese, ElevenLabs for others */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Mic className="w-4 h-4" />
              {usesBrowserTTS ? t('voice') : t('aiVoice')}
            </Label>
            {usesBrowserTTS ? (
              <Select
                value={selectedVoice?.name || ''}
                onValueChange={(name) => {
                  const voice = browserVoices.find(v => v.name === name) || null;
                  setSelectedVoice(voice);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('selectVoice')} />
                </SelectTrigger>
                <SelectContent>
                  {browserVoices.map((voice) => (
                    <SelectItem key={voice.name} value={voice.name}>
                      {voice.name} ({voice.lang})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select
                value={selectedElevenLabsVoiceId}
                onValueChange={setSelectedElevenLabsVoiceId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('selectVoice')} />
                </SelectTrigger>
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

          {/* Segment Length Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <AlignLeft className="w-4 h-4" />
              {t('segmentLength')}
            </Label>
            <Select value={segmentLength} onValueChange={(v) => setSegmentLength(v as SegmentLength)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">{t('segmentShort')}</SelectItem>
                <SelectItem value="medium">{t('segmentMedium')}</SelectItem>
                <SelectItem value="long">{t('segmentLong')}</SelectItem>
                <SelectItem value="custom">{t('segmentCustom')}</SelectItem>
              </SelectContent>
            </Select>
            {segmentLength === 'custom' && (
              <CustomLengthInput customLength={customLength} setCustomLength={setCustomLength} />
            )}
          </div>
        </div>

        {/* Speed Control */}
        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Volume2 className="w-4 h-4" />
              {t('speed')}
            </Label>
            <span className="text-sm font-medium text-muted-foreground">{speed.toFixed(2)}x</span>
          </div>
          <Slider
            value={[speed]}
            onValueChange={([v]) => setSpeed(v)}
            min={0.5}
            max={1.2}
            step={0.05}
            className="w-full"
          />
        </div>
      </Card>

      {/* Text Input */}
      <Card className="p-6 shadow-soft">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-secondary/10">
              <BookOpen className="w-5 h-5 text-secondary" />
            </div>
            <Label className="text-lg font-medium">{t('inputText')}</Label>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleImageUpload}
            className="gap-2"
            disabled={isProcessingOCR}
          >
            {isProcessingOCR ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('processingOCR')}
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                {t('uploadImage')}
              </>
            )}
          </Button>
        </div>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('inputPlaceholder')}
          className="min-h-[200px] resize-none text-base leading-relaxed"
        />
        <p className="mt-2 text-xs text-muted-foreground">{t('ocrSupport')}</p>
      </Card>

      {/* Start Button */}
      <Button
        onClick={onStart}
        disabled={!text.trim()}
        className="w-full py-6 text-lg font-semibold gap-3 shadow-card hover:shadow-soft transition-all"
        size="lg"
      >
        <Play className="w-5 h-5" />
        {t('startDictation')}
      </Button>
    </div>
  );
}
