

# Enhancing Document Scan Quality

## Current Architecture
The scan optimization currently works in two stages:
1. **Client-side**: Compress image to 2400px / 92% JPEG quality, then send to backend
2. **Backend (scan-optimize)**: Uses `google/gemini-3-pro-image-preview` AI model to detect edges, correct perspective, and clean up the image in a single pass

## Proposed Improvements

### 1. Higher Resolution Input for Scan Optimization
Currently the image is compressed to 2400px before being sent for scan optimization. Increasing this to 3200px specifically for the scan step will give the AI model more detail to work with for edge detection and perspective correction.

### 2. Enhanced AI Prompt with Explicit Geometry Instructions
Strengthen the scan-optimize prompt with more precise instructions:
- Explicitly request detection of all 4 corners of the document
- Add instructions for handling partial paper visibility (only 3 corners visible)
- Add specific guidance for common scenarios: paper on dark/light desk, shadow overlap, finger holding corner
- Request the output maintain at least the input resolution

### 3. Client-Side Pre-Processing for Better AI Input
Add a lightweight client-side preprocessing step before sending to the AI:
- **Auto-contrast enhancement**: Stretch the histogram to improve edge visibility in low-contrast photos
- **Slight sharpening**: Apply a mild unsharp mask to help the AI detect text and edges more clearly
These are simple canvas operations that take milliseconds and can significantly improve results from poorly-lit photos.

### 4. Two-Step Processing Option for Difficult Photos
Add a "high quality" mode that processes the image twice:
- First pass: perspective correction and cropping only
- Second pass: clean up (white balance, contrast, shadow removal) on the already-flattened image
This separation gives the AI model a simpler task in each step, improving accuracy for heavily skewed or shadowed photos.

---

## Technical Details

### Files to modify:

**`src/pages/QuickStart.tsx`**
- Add `preprocessForScan()` function: auto-contrast + mild sharpen before sending
- Increase `compressImage` maxDim to 3200 for scan-optimize calls specifically
- Add optional "High Quality" toggle that enables two-pass processing

**`supabase/functions/scan-optimize/index.ts`**
- Enhance the prompt with more detailed edge detection and geometry correction instructions
- Add support for a `highQuality` parameter that triggers a geometry-only first pass
- Add a second API call for cleanup when in high-quality mode

**`src/components/OutputModeSelector.tsx`** or scan settings area in QuickStart
- Add UI for "High Quality Scan" option under the existing scan optimize toggle

### Prompt improvements (scan-optimize):
```text
RULE 1 - DETECT ALL 4 CORNERS:
- Find the exact 4 corners of the paper/document
- If a corner is obscured (by a finger, shadow, or cropping),
  extrapolate its position from the visible edges
- The document boundary is defined by straight edges - 
  look for the contrast between paper and background

RULE 2 - PRECISE PERSPECTIVE TRANSFORM:
- Map the 4 detected corners to a perfect rectangle
- The output rectangle must match the paper's real aspect ratio
  (e.g., A4 = 1:1.414, Letter = 1:1.294)
- Do NOT stretch or distort the content
- Ensure all text lines that were parallel on the original 
  document remain perfectly horizontal in the output
```

