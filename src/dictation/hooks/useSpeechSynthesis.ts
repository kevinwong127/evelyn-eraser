import { useState, useEffect, useCallback } from 'react';

export type DictationLanguage = 'cantonese' | 'english' | 'mandarin';

const languageCodeMap: Record<DictationLanguage, string[]> = {
  cantonese: ['zh-HK', 'yue', 'zh-Hant-HK'],
  english: ['en-US', 'en-GB', 'en-AU', 'en'],
  mandarin: ['zh-CN', 'zh-TW', 'cmn', 'zh'],
};

export function useSpeechSynthesis() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      setSupported(true);

      const loadVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices();
        setVoices(availableVoices);
      };

      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;

      return () => {
        window.speechSynthesis.onvoiceschanged = null;
      };
    }
  }, []);

  const getVoicesForLanguage = useCallback((language: DictationLanguage): SpeechSynthesisVoice[] => {
    const codes = languageCodeMap[language];
    
    // First try exact matches (e.g. zh-CN, zh-HK)
    const exactMatches = voices.filter(voice =>
      codes.some(code => voice.lang === code || voice.lang.startsWith(code + '-'))
    );
    
    if (exactMatches.length > 0) return exactMatches;
    
    // Fallback: match by language prefix (e.g. zh)
    return voices.filter(voice =>
      codes.some(code => voice.lang.startsWith(code.split('-')[0]))
    );
  }, [voices]);

  const speak = useCallback((
    text: string, 
    options: {
      voice?: SpeechSynthesisVoice | null;
      rate?: number;
      language?: DictationLanguage;
      onEnd?: () => void;
    } = {}
  ) => {
    if (!supported) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    
    if (options.voice) {
      utterance.voice = options.voice;
    } else if (options.language) {
      const langVoices = getVoicesForLanguage(options.language);
      if (langVoices.length > 0) {
        utterance.voice = langVoices[0];
      }
    }

    utterance.rate = options.rate || 1;

    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => {
      setSpeaking(false);
      options.onEnd?.();
    };
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [supported, getVoicesForLanguage]);

  const stop = useCallback(() => {
    if (supported) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
  }, [supported]);

  return {
    voices,
    speaking,
    supported,
    getVoicesForLanguage,
    speak,
    stop,
  };
}
