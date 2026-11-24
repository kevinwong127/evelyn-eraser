import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateRequest } from "../_shared/validate-request.ts";
import { GeminiError, GEMINI_IMAGE_MODEL, extractGeminiImage, generateGeminiContent, imagePart } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildGeometryPrompt(isColor: boolean): string {
  return `You are a professional document scanner. Edit this photo of a worksheet/document following these rules EXACTLY:

RULE 1 — DETECT ALL 4 CORNERS:
- Find the exact 4 corners of the paper/document in the photo.
- The document boundary is defined by straight edges — look for the contrast between paper and background.
- If a corner is obscured by a finger, shadow, desk edge, or is outside the photo frame, extrapolate its position from the two visible edges that would meet at that corner.
- Handle common scenarios: paper on dark desk, paper on light desk, shadows overlapping edges, fingers holding corners, slightly crumpled edges.

RULE 2 — PRECISE PERSPECTIVE TRANSFORM:
- Map the 4 detected corners to a perfect rectangle.
- The output rectangle must match the paper's real aspect ratio (e.g., A4 = 1:1.414, Letter = 1:1.294, B5 = 1:1.414).
- Do NOT stretch or distort the content — maintain the original proportions.
- Ensure all text lines that were parallel on the original document remain perfectly horizontal in the output.
- Correct any rotation, tilt, or skew from the camera angle.

RULE 3 — CROP TO PAPER ONLY:
- Crop the image to show ONLY the paper content.
- Remove any desk, table, fingers, or background visible around the paper edges.
- Include a minimal margin (1-2px) to avoid cutting off edge content.

${isColor ? `RULE 4 — COLOR OUTPUT:
- Keep the original colors of the document.
- Clean up shadows, lighting gradients, finger shadows.
- Apply white-balance correction to remove color casts from lighting.
- Make the background as clean and even as possible while preserving colored content.
- Enhance contrast slightly for better readability.` : `RULE 4 — HIGH-QUALITY BLACK & WHITE:
- Convert to a clean, high-contrast black and white image suitable for printing.
- All paper/background areas must be pure white (#FFFFFF).
- All printed text and drawings must be crisp black with high contrast.
- Remove all shadows, lighting gradients, finger shadows, and paper texture.
- Remove any yellowish/brownish color cast from the paper.`}

RULE 5 — PRESERVE ALL CONTENT (MOST IMPORTANT):
- Keep ALL content on the paper: printed text, handwritten text, drawings, images, borders, lines.
- Do NOT remove or erase any content — just flatten and clean the image.
- Maintain the original layout and proportions of the paper content.
- NEVER redraw, retype, or rewrite any text. Every printed character must remain pixel-identical to the original — treat this as a geometric transform of the original pixels, NOT a regeneration of the page.
- Do NOT "fix" or replace any character, word, or sentence, even if it looks blurry or odd. Blurry characters stay as they are, only sharper from the cleanup.

RULE 6 — OUTPUT DIMENSIONS:
- Output at high resolution for print quality — at least as large as the input image.
- Maintain the original paper aspect ratio.

Output ONLY the processed image. No text response.`;
}

function buildGeometryOnlyPrompt(): string {
  return `You are a professional document scanner. Your ONLY task is perspective correction and cropping. Do NOT adjust colors, contrast, or lighting.

RULE 1 — DETECT ALL 4 CORNERS:
- Find the exact 4 corners of the paper/document in the photo.
- The document boundary is defined by straight edges — look for the contrast between paper and background.
- If a corner is obscured by a finger, shadow, desk edge, or is outside the photo frame, extrapolate its position from the two visible edges that would meet at that corner.

RULE 2 — PRECISE PERSPECTIVE TRANSFORM:
- Map the 4 detected corners to a perfect rectangle.
- The output rectangle must match the paper's real aspect ratio (e.g., A4 = 1:1.414, Letter = 1:1.294, B5 = 1:1.414).
- Do NOT stretch or distort the content.
- Ensure all text lines that were parallel on the original document remain perfectly horizontal in the output.

RULE 3 — CROP TO PAPER ONLY:
- Crop to show ONLY the paper content. Remove background, desk, fingers.

RULE 4 — NO COLOR CHANGES:
- Keep the image exactly as-is in terms of color, brightness, and contrast.
- Do NOT clean up shadows or adjust white balance in this step.
- NEVER redraw, retype, or rewrite any text — every character must remain pixel-identical to the original. This is a pure geometric transform of the original pixels.

RULE 5 — OUTPUT DIMENSIONS:
- Output at high resolution — at least as large as the input image.

Output ONLY the processed image. No text response.`;
}

function buildCleanupPrompt(isColor: boolean): string {
  return `You are a professional document scanner. This image has already been perspective-corrected and cropped. Your ONLY task is to clean up the image quality.

${isColor ? `RULES:
- Keep the original colors of the document.
- Remove all shadows, lighting gradients, and uneven illumination.
- Apply white-balance correction to remove color casts from lighting.
- Make the paper background clean and even while preserving colored content.
- Enhance contrast slightly for better readability.
- Do NOT crop or rotate — the geometry is already correct.` : `RULES:
- Convert to a clean, high-contrast black and white image suitable for printing.
- All paper/background areas must be pure white (#FFFFFF).
- All printed text and drawings must be crisp black with high contrast.
- Remove all shadows, lighting gradients, and paper texture.
- Remove any yellowish/brownish color cast from the paper.
- Do NOT crop or rotate — the geometry is already correct.`}

- Preserve ALL content: printed text, handwritten text, drawings, images, borders, lines.
- NEVER redraw, retype, or rewrite any text — every character must remain pixel-identical to the original. Do NOT "fix" blurry or odd-looking characters.
- Output at high resolution — at least as large as the input image.

Output ONLY the processed image. No text response.`;
}

async function callAI(_apiKey: string, prompt: string, mimeType: string, pureBase64: string) {
  return generateGeminiContent({
    model: GEMINI_IMAGE_MODEL,
    contents: [{
      role: "user",
      parts: [{ text: prompt }, imagePart(mimeType, pureBase64)],
    }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
  });
}

function extractImageFromResult(result: any): string | null {
  return extractGeminiImage(result);
}

/** Parse a data-URI into { mimeType, pureBase64 } */
function parseDataUri(dataUri: string): { mimeType: string; pureBase64: string } {
  if (dataUri.startsWith("data:")) {
    const match = dataUri.match(/^data:(image\/[^;]+);base64,(.+)$/s);
    if (match) return { mimeType: match[1], pureBase64: match[2] };
  }
  return { mimeType: "image/png", pureBase64: dataUri };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const validated = await validateRequest(req, ["colorMode", "highQuality"]);
    if (validated instanceof Response) return validated;

    const { mimeType, pureBase64, extraFields } = validated;
    const isColor = extraFields?.colorMode === "color";
    const highQuality = extraFields?.highQuality === true;

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    let optimizedImageBase64: string | null = null;

    if (highQuality) {
      // Two-pass mode: geometry first, then cleanup
      const pass1Prompt = buildGeometryOnlyPrompt();
      const pass1Result = await callAI(GEMINI_API_KEY, pass1Prompt, mimeType, pureBase64);
      const geometryImage = extractImageFromResult(pass1Result);

      if (geometryImage) {
        const { mimeType: m2, pureBase64: b2 } = parseDataUri(geometryImage);
        const pass2Prompt = buildCleanupPrompt(isColor);
        const pass2Result = await callAI(GEMINI_API_KEY, pass2Prompt, m2, b2);
        optimizedImageBase64 = extractImageFromResult(pass2Result);
        // Fallback to geometry-only result if cleanup fails
        if (!optimizedImageBase64) optimizedImageBase64 = geometryImage;
      }
    } else {
      // Single-pass mode with enhanced prompt
      const prompt = buildGeometryPrompt(isColor);
      const result = await callAI(GEMINI_API_KEY, prompt, mimeType, pureBase64);
      optimizedImageBase64 = extractImageFromResult(result);
    }

    return new Response(
      JSON.stringify({
        optimizedImageBase64,
        message: optimizedImageBase64
          ? "Scan optimized successfully!"
          : "Scan optimization attempted but no image returned. Please try again.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    const status = e instanceof GeminiError ? e.status : 500;
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
