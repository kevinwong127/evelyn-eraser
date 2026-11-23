import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateRequest } from "../_shared/validate-request.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const validated = await validateRequest(req);
    if (validated instanceof Response) return validated;

    const { mimeType, pureBase64 } = validated;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-image-preview",
        modalities: ["image", "text"],
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
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

RULE 2 — PIXEL-PERFECT PRINTED CONTENT PRESERVATION:
- Every printed character, word, number, line, border, box, and image MUST remain EXACTLY as-is.
- DO NOT re-render, re-type, or reconstruct ANY printed text.
- Printed text is identified by: perfect uniformity, consistent font weight, machine-precise spacing and alignment.

RULE 3 — PRESERVE ORIGINAL DIMENSIONS:
- Output image MUST have the EXACT same width and height as input. No crop, resize, or scale.

RULE 4 — CLEAN WHITE BACKGROUND:
- Make ALL paper background areas uniformly pure white (#FFFFFF).
- Remove shadows, lighting gradients, page curl artifacts, and paper texture.

Output ONLY the edited image. No text response.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${pureBase64}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI error:", response.status);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 403) {
        let msg = "AI 使用上限已到，請工作區管理員提高 AI 額度上限。";
        try { const j = await response.json(); if (j?.message) msg = j.message; else if (j?.error?.message) msg = j.error.message; } catch { /* ignore */ }
        return new Response(JSON.stringify({ error: msg }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Usage limit reached. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI error: ${response.status}`);
    }

    const result = await response.json();
    const choice = result.choices?.[0];
    const content = choice?.message?.content;
    const images = choice?.message?.images;

    let cleanedImageBase64: string | null = null;

    if (Array.isArray(images) && images.length > 0) {
      const imgUrl = images[0]?.image_url?.url;
      if (imgUrl) {
        cleanedImageBase64 = imgUrl;
      }
    }

    if (!cleanedImageBase64 && typeof content === "string") {
      const base64Match = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
      if (base64Match) {
        cleanedImageBase64 = base64Match[0];
      }
    }
    
    if (!cleanedImageBase64 && Array.isArray(content)) {
      for (const part of content) {
        if (part.type === "image_url" && part.image_url?.url) {
          cleanedImageBase64 = part.image_url.url;
          break;
        }
        if (part.inline_data?.data) {
          cleanedImageBase64 = `data:${part.inline_data.mime_type || "image/png"};base64,${part.inline_data.data}`;
          break;
        }
        if (part.b64_json) {
          cleanedImageBase64 = `data:image/png;base64,${part.b64_json}`;
          break;
        }
      }
    }
    
    if (!cleanedImageBase64) {
      const fullJson = JSON.stringify(result);
      const deepMatch = fullJson.match(/"url":"(data:image\/[^"]+)"/);
      if (deepMatch) {
        cleanedImageBase64 = deepMatch[1];
      }
    }

    return new Response(
      JSON.stringify({
        cleanedImageBase64,
        message: cleanedImageBase64
          ? "Worksheet cleaned successfully!"
          : "Image cleaning attempted but the AI did not return an edited image. Please try again.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("erase-handwriting error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
