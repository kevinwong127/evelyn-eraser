import React, { createContext, useContext, useState, ReactNode } from 'react';

type Language = 'en' | 'zh';

interface Translations {
  [key: string]: {
    en: string;
    zh: string;
  };
}

const translations: Translations = {
  appTitle: { en: 'Dictation Helper', zh: '默書小助手' },
  setupTitle: { en: 'Setup Your Dictation', zh: '設定您的默書' },
  dictationLanguage: { en: 'Dictation Language', zh: '默書語言' },
  cantonese: { en: 'Cantonese', zh: '粵語' },
  english: { en: 'English', zh: '英文' },
  mandarin: { en: 'Mandarin', zh: '普通話' },
  voice: { en: 'Voice', zh: '語音' },
  selectVoice: { en: 'Select a voice...', zh: '選擇語音...' },
  systemDefault: { en: 'System Default', zh: '系統預設' },
  speed: { en: 'Speed', zh: '語速' },
  inputText: { en: 'Enter dictation text', zh: '輸入默書文字' },
  inputPlaceholder: { en: 'Type or paste the text you want to practice...', zh: '輸入或貼上您想練習的文章/文字...' },
  uploadImage: { en: 'Upload Image for OCR', zh: '上傳圖片進行OCR' },
  startDictation: { en: 'Start Dictation', zh: '開始默書' },
  stopDictation: { en: 'Stop Dictation', zh: '停止默書' },
  previous: { en: 'Previous', zh: '上一段' },
  repeat: { en: 'Repeat', zh: '重複' },
  next: { en: 'Next', zh: '下一段' },
  finish: { en: 'Finish', zh: '完成' },
  showText: { en: 'Show Text', zh: '顯示文字' },
  hideText: { en: 'Hide Text', zh: '隱藏文字' },
  readPunctuation: { en: 'Read Punctuation', zh: '朗讀標點符號' },
  experimental: { en: '(Experimental)', zh: '(試用中)' },
  clickToHear: { en: 'Click any word to hear its pronunciation', zh: '點擊任何字詞即可單獨聽其發音' },
  currentSegment: { en: 'Current Segment', zh: '當前段落' },
  noTextEntered: { en: 'Please enter some text first', zh: '請先輸入文字' },
  ocrSupport: { en: 'Supports PNG, JPG, GIF, WEBP', zh: '支援 PNG, JPG, GIF, WEBP' },
  ocrSuccess: { en: 'Text Extracted', zh: '文字已提取' },
  ocrSuccessDesc: { en: 'Text from image has been added to the input.', zh: '圖片中的文字已添加到輸入框。' },
  ocrNoText: { en: 'No Text Found', zh: '未找到文字' },
  ocrNoTextDesc: { en: 'Could not find any text in the image.', zh: '無法在圖片中找到文字。' },
  ocrError: { en: 'OCR Failed', zh: 'OCR 失敗' },
  ocrErrorDesc: { en: 'Could not process the image. Please try another.', zh: '無法處理圖片，請嘗試其他圖片。' },
  processingOCR: { en: 'Processing...', zh: '處理中...' },
  // Auth translations
  login: { en: 'Login', zh: '登入' },
  signup: { en: 'Sign Up', zh: '註冊' },
  logout: { en: 'Logout', zh: '登出' },
  email: { en: 'Email', zh: '電郵' },
  password: { en: 'Password', zh: '密碼' },
  displayName: { en: 'Display Name', zh: '顯示名稱' },
  displayNamePlaceholder: { en: 'Your name', zh: '您的名稱' },
  passwordHint: { en: 'At least 6 characters', zh: '至少 6 個字元' },
  or: { en: 'or', zh: '或' },
  continueWithGoogle: { en: 'Continue with Google', zh: '使用 Google 登入' },
  loginSuccess: { en: 'Login Successful', zh: '登入成功' },
  loginSuccessDesc: { en: 'Welcome back!', zh: '歡迎回來！' },
  loginError: { en: 'Login Failed', zh: '登入失敗' },
  signupSuccess: { en: 'Sign Up Successful', zh: '註冊成功' },
  signupSuccessDesc: { en: 'Please check your email to verify your account.', zh: '請檢查您的電郵以驗證帳戶。' },
  signupError: { en: 'Sign Up Failed', zh: '註冊失敗' },
  settingsSaved: { en: 'Settings Saved', zh: '設定已儲存' },
  settingsSavedDesc: { en: 'Your preferences have been saved.', zh: '您的偏好設定已儲存。' },
  aiVoice: { en: 'AI Voice', zh: 'AI 語音' },
  loadingAudio: { en: 'Loading audio...', zh: '載入語音中...' },
  ttsFallback: { en: 'Using System Voice', zh: '使用系統語音' },
  ttsFallbackDesc: { en: 'AI voice unavailable, using browser voice instead.', zh: 'AI 語音不可用，改用瀏覽器語音。' },
  segmentLength: { en: 'Segment Length', zh: '每段長度' },
  segmentShort: { en: 'Short (few words)', zh: '短句（幾個字）' },
  segmentMedium: { en: 'Medium', zh: '中等' },
  segmentLong: { en: 'Long (full sentence)', zh: '長句（整句）' },
  segmentCustom: { en: 'Custom', zh: '自訂' },
  customLengthLabel: { en: 'Characters per segment', zh: '每段字數' },
  confirm: { en: 'Confirm', zh: '確定' },
  getReady: { en: 'Get ready...', zh: '準備開始...' },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('zh');

  const t = (key: string): string => {
    return translations[key]?.[language] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
