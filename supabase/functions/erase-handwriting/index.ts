import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateRequest } from "../_shared/validate-request.ts";
import { GeminiError, GEMINI_IMAGE_MODEL, extractGeminiImage, generateGeminiContent, imagePart } from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const validated = await validateRequest(req);
    if (validated instanceof Response) return validated;
    const { mimeType, pureBase64 } = validated;

    const result = await generateGeminiContent({
      model: GEMINI_IMAGE_MODEL,
      contents: [{
        role: "user",
        parts: [
          {
            text: `Edit this worksheet image. Follow these rules EXACTLY:

RULE 1 — ERASE ALL HANDWRITING (ALL INK TYPES):
- Remove ALL handwritten content regardless of writing instrument or color:
  • PENCIL marks (graphite, light gray strokes)
  • BLUE PEN / BALLPOINT ink (dark blue, light blue)
  • RED PEN ink (red, pink, dark red corrections/marks)
  • BLACK PEN ink (handwritten black ink, distinguish from printed text by stroke style)
  • CRAYON, MARKER, FELT-TIP PEN marks of any color
  • HIGHLIGHTER marks (yellow, green, pink, orange — any translucent overlay color)
- Replace EVERY erased area with pure white (#FFFFFF) pixels.
- Be aggressive: if in doubt whether a mark is handwritten or printed, check stroke regularity. Handwriting has irregular pressure, wobble, and inconsistent spacing. Printed text is perfectly uniform.

RULE 2 — RESTORE EVERY ANSWER CIRCLE AND FORM FIELD:
- Every filled, blackened, shaded, ticked, crossed, circled or marked multiple-choice bubble is HANDWRITING, even when it looks like a solid printed black dot.
- Remove the fill COMPLETELY and restore each bubble to a clean HOLLOW circle with the original outline, size and position.
- Check EVERY option (A, B, C, D, etc.) in EVERY question. Never leave a selected answer bubble behind.
- Also clear names, class names, dates, scores, teacher marks and all other handwritten entries in form fields.

RULE 3 — PIXEL-PERFECT PRINTED CONTENT PRESERVATION:
- Every printed character, word, number, line, border, box, and image MUST remain EXACTLY as-is.
- DO NOT re-render, re-type, or reconstruct ANY printed text.
- Printed text is identified by: perfect uniformity, consistent font weight, machine-precise spacing and alignment.

RULE 4 — PRESERVE ORIGINAL DIMENSIONS:
- Output image MUST have the EXACT same width and height as input. No crop, resize, or scale.

RULE 5 — CLEAN WHITE BACKGROUND AND FINAL INSPECTION:
- Make ALL paper background areas uniformly pure white (#FFFFFF).
- Remove shadows, lighting gradients, page curl artifacts, and paper texture.
- Before returning, inspect the entire page again, question by question and field by field.
- If any handwritten stroke, selected bubble, filled circle, name, score or correction remains, erase it before output. The task is incomplete while any of these remain.

Output ONLY the edited image. No text response.`,
          },
          imagePart(mimeType, pureBase64),
        ],
      }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    });

    const cleanedImageBase64 = extractGeminiImage(result);
    return new Response(
      JSON.stringify({
        cleanedImageBase64,
        message: cleanedImageBase64
          ? "Worksheet cleaned successfully!"
          : "Image cleaning attempted but the AI did not return an edited image. Please try again.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("erase-handwriting error:", error);
    const status = error instanceof GeminiError ? error.status : 500;
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
