import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/dictation/contexts/AuthContext';
import { DictationLanguage } from '@/dictation/hooks/useSpeechSynthesis';

interface DictationSettings {
  dictationLanguage: DictationLanguage;
  voiceName: string | null;
  speed: number;
}

const defaultSettings: DictationSettings = {
  dictationLanguage: 'cantonese',
  voiceName: null,
  speed: 1,
};

export function useDictationSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<DictationSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load settings from database
  useEffect(() => {
    async function loadSettings() {
      if (!user) {
        // Load from localStorage for non-authenticated users
        const saved = localStorage.getItem('dictation-settings');
        if (saved) {
          try {
            setSettings(JSON.parse(saved));
          } catch {
            // Ignore parse errors
          }
        }
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('dictation_settings')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (error) {
          console.error('Error loading settings:', error);
        } else if (data) {
          setSettings({
            dictationLanguage: data.dictation_language as DictationLanguage,
            voiceName: data.voice_name,
            speed: Number(data.speed),
          });
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, [user]);

  // Save settings to database
  const saveSettings = useCallback(async (newSettings: Partial<DictationSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);

    if (!user) {
      // Save to localStorage for non-authenticated users
      localStorage.setItem('dictation-settings', JSON.stringify(updated));
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('dictation_settings')
        .update({
          dictation_language: updated.dictationLanguage,
          voice_name: updated.voiceName,
          speed: updated.speed,
        })
        .eq('user_id', user.id);

      if (error) {
        console.error('Error saving settings:', error);
      }
    } catch (error) {
      console.error('Error saving settings:', error);
    } finally {
      setSaving(false);
    }
  }, [user, settings]);

  return {
    settings,
    loading,
    saving,
    saveSettings,
  };
}
