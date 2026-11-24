import { useState, useCallback, useRef } from 'react';
import { DictationLanguage } from '@/dictation/hooks/useSpeechSynthesis';

export interface ElevenLabsVoice {
  id: string;
  name: string;
  nameZh: string;
  languages: DictationLanguage[];
}

// Curated voices that work well with eleven_multilingual_v2
// Tagged by language suitability
export const ELEVENLABS_VOICES: ElevenLabsVoice[] = [
  // Cantonese-suitable voices
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', nameZh: 'Alice（女聲）', languages: ['cantonese'] },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', nameZh: 'Lily（女聲）', languages: ['cantonese'] },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', nameZh: 'Brian（男聲）', languages: ['cantonese'] },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', nameZh: 'Daniel（男聲）', languages: ['cantonese'] },
  // Mandarin-suitable voices
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', nameZh: 'Sarah（女聲）', languages: ['mandarin'] },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', nameZh: 'Laura（女聲）', languages: ['mandarin'] },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', nameZh: 'George（男聲）', languages: ['mandarin'] },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', nameZh: 'Liam（男聲）', languages: ['mandarin'] },
  // English voices (all voices work for English)
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', nameZh: 'Alice（女聲）', languages: ['english'] },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', nameZh: 'Lily（女聲）', languages: ['english'] },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', nameZh: 'Sarah（女聲）', languages: ['english'] },
  { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura', nameZh: 'Laura（女聲）', languages: ['english'] },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', nameZh: 'Brian（男聲）', languages: ['english'] },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', nameZh: 'George（男聲）', languages: ['english'] },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', nameZh: 'Liam（男聲）', languages: ['english'] },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', nameZh: 'Daniel（男聲）', languages: ['english'] },
];

export function getVoicesForLanguage(lang: DictationLanguage): ElevenLabsVoice[] {
  return ELEVENLABS_VOICES.filter(v => v.languages.includes(lang));
}

const TTS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;

export function useElevenLabsTTS() {
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setSpeaking(false);
    setLoading(false);
  }, []);

  const speak = useCallback(async (
    text: string,
    options: {
      voiceId?: string;
      speed?: number;
      onEnd?: () => void;
    } = {}
  ) => {
    stop();

    const voiceId = options.voiceId || ELEVENLABS_VOICES[0].id;
    
    setLoading(true);
    abortRef.current = new AbortController();

    try {
      const response = await fetch(TTS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ text, voiceId, speed: options.speed || 1.0 }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`TTS request failed: ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => {
        setLoading(false);
        setSpeaking(true);
      };
      audio.onended = () => {
        setSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        options.onEnd?.();
      };
      audio.onerror = () => {
        setSpeaking(false);
        setLoading(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
      };

      await audio.play();
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('ElevenLabs TTS error:', error);
        setLoading(false);
        setSpeaking(false);
        throw error;
      }
    }
  }, [stop]);

  return {
    speak,
    stop,
    speaking,
    loading,
    voices: ELEVENLABS_VOICES,
  };
}
