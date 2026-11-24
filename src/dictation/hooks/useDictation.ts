import { useState, useCallback, useMemo } from 'react';

export type SegmentLength = 'short' | 'medium' | 'long' | 'custom';

interface DictationOptions {
  segmentLength?: SegmentLength;
  customLength?: number;
}

export function useDictation(text: string, options: DictationOptions = {}) {
  const { segmentLength = 'medium', customLength } = options;
  const [currentIndex, setCurrentIndex] = useState(0);

  const segments = useMemo(() => {
    if (!text.trim()) return [];

    const chineseSegmentLengthMap = { short: 4, medium: 8, long: 15, custom: customLength || 8 };
    const chineseMaxLen = chineseSegmentLengthMap[segmentLength];

    // Check if text is primarily Chinese or English
    const chineseChars = text.match(/[\u4e00-\u9fff]/g)?.length || 0;
    const englishChars = text.match(/[a-zA-Z]/g)?.length || 0;
    const isChinese = chineseChars > englishChars;

    const result: string[] = [];

    if (isChinese) {
      let currentSegment = '';
      const punctuation = /[。，！？；：、．]/;
      
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        currentSegment += char;

        if (punctuation.test(char) || currentSegment.length >= chineseMaxLen) {
          if (currentSegment.trim()) {
            result.push(currentSegment.trim());
          }
          currentSegment = '';
        }
      }

      if (currentSegment.trim()) {
        result.push(currentSegment.trim());
      }
    } else {
      if (segmentLength === 'short') {
        // Split by commas and sentence punctuation
        const parts = text.split(/(?<=[.!?,;])\s+/);
        for (const part of parts) {
          if (part.trim()) {
            result.push(part.trim());
          }
        }
      } else {
        // Medium and long: split by sentence punctuation only
        const sentences = text.split(/(?<=[.!?])\s+/);
        for (const sentence of sentences) {
          if (sentence.trim()) {
            result.push(sentence.trim());
          }
        }
      }
    }

    return result;
  }, [text, segmentLength, customLength]);

  const currentSegment = segments[currentIndex] || '';
  const totalSegments = segments.length;
  const isFirstSegment = currentIndex === 0;
  const isLastSegment = currentIndex === segments.length - 1;

  const goToNext = useCallback(() => {
    if (currentIndex < segments.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, segments.length]);

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  const reset = useCallback(() => {
    setCurrentIndex(0);
  }, []);

  return {
    segments,
    currentSegment,
    currentIndex,
    totalSegments,
    isFirstSegment,
    isLastSegment,
    goToNext,
    goToPrevious,
    reset,
  };
}
