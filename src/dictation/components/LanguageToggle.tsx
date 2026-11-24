import { useLanguage } from '@/dictation/contexts/LanguageContext';
import { Button } from '@/components/ui/button';

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
      className="font-medium min-w-[3rem]"
    >
      {language === 'en' ? '中' : 'EN'}
    </Button>
  );
}
