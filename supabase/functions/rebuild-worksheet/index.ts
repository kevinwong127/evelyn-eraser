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
            text: `Recreate this school worksheet as a brand-new, clean, printable BLANK worksheet.

- Read the worksheet carefully and re-typeset ALL printed content (titles, instructions, questions, options, numbering, tables, boxes) in a crisp clean printed font, on a pure white page.
- If the original photo is tilted, skewed, warped or taken at an angle, STRAIGHTEN everything: all text lines must be perfectly horizontal and the page perfectly upright, as if scanned flat.
- If any printed characters are blurry, faint, smudged or low-resolution in the photo, re-render them as sharp, clear, well-formed printed characters of the correct word. Use surrounding context ONLY to identify what the blurry character is; never change clear characters.
- Keep the same language (Traditional Chinese / Simplified Chinese / English exactly as printed), the same question order, numbering and overall layout (columns, spacing, answer lines, boxes, circles).
- COPY EVERY PRINTED CHARACTER VERBATIM, character by character. Never paraphrase, reword, simplify or "improve" any sentence. Every visible printed character must appear unchanged in the same order.
- Only when a printed character is truly hidden under handwriting may you fill it in, and then ONLY that exact number of characters (e.g. one hidden Chinese character = exactly one character). Keep all surrounding characters identical. If unsure, leave a small empty box □ instead of guessing. Never replace several words to make a sentence "sound right".
- Redraw any printed pictures/diagrams cleanly and simply in the same positions.
- REMOVE all student handwriting, answers, ticks, crosses, grading marks, scores, filled-in bubbles and highlighter. Answer blanks must be empty (blank underline / empty box / empty circle).
- Portrait page with the same aspect ratio as the input (A4 if the input is A4). No shadows, no paper texture, no photo look — it must look like a freshly printed original.

Output ONLY the image.`,
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
    console.error("rebuild-worksheet error:", error);
    const status = error instanceof GeminiError ? error.status : 500;
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
