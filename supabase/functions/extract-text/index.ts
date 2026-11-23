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
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `You are an expert OCR and document layout extraction tool specializing in Chinese and English documents.

TASK: Analyze this worksheet/document image and extract ALL PRINTED text content with high accuracy.

CRITICAL RULES FOR CHINESE TEXT:
- You MUST correctly recognize every Traditional Chinese (繁體中文) and Simplified Chinese (簡體中文) character with extreme precision
- Pay special attention to visually similar Chinese characters (e.g. 己/已/巳, 未/末, 土/士, 日/曰, 大/太/犬)
- Preserve the original language exactly — do NOT translate, do NOT convert between Traditional and Simplified Chinese
- Recognize Chinese punctuation correctly: 。，、；：「」『』（）！？—— etc.
- For mixed Chinese-English content, preserve both languages exactly as printed
- IGNORE all handwritten content — only extract printed/typed text

VERBATIM COPY RULES (MOST IMPORTANT):
- Copy every visible printed character EXACTLY as printed, character by character. Do NOT rewrite, rephrase, polish, or "improve" any sentence to make it read better.
- Do NOT replace a word with a synonym or a more natural-sounding phrase, even if the original seems odd. The original wording is always correct.
- Only characters genuinely obscured by handwriting may be filled in — and you MUST fill in the SAME NUMBER of characters as were obscured (one hidden character = one filled character). Never change neighboring visible characters to accommodate your guess.
- If you are not confident what an obscured character is, output "□" for each obscured character instead of guessing. Do NOT output "null" or skip it.

OUTPUT FORMAT — Return ONLY a JSON object:
{
  "title": "The document title if visible, or empty string if none",
  "sections": [
    {
      "type": "heading" | "paragraph" | "question" | "instruction" | "table" | "list",
      "content": "The text content (MUST NOT be null or empty)",
      "number": "Question/item number if applicable (e.g. '1', '2a', '三')",
      "indent": 0,
      "rows": [["cell", "cell"], ["cell", "cell"]],
      "children": [
        {
          "type": "option" | "blank" | "subquestion",
          "content": "Text content (MUST NOT be null or empty)",
          "number": "Sub-number if any"
        }
      ]
    }
  ]
}

ADDITIONAL RULES:
- Every section and child MUST have non-empty "content". If a section has no meaningful text, omit it entirely.
- Preserve the logical structure and reading order of the document
- For fill-in-the-blank questions, use underscores matching the visual length of the blank line
- For multiple choice, list each option as a child with type "option"
- TABLES: Any grid/boxed layout with rows and columns (including answer boxes, matching tables, forms, bordered boxes) MUST be type "table" with "rows": a 2D array of cell strings, one inner array per row, same column count per row (use "" for empty/answer cells, and repeat or leave "" for merged cells). Set "content" to a short caption like "表格" or the table title. Copy cell text verbatim.
- Do NOT include the filename, watermarks, or page numbers
- Return ONLY valid JSON, no markdown code blocks, no other text`,
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
    const content = result.choices?.[0]?.message?.content;

    // Parse JSON from the response
    let extractedData = null;
    if (typeof content === "string") {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      try {
        extractedData = JSON.parse(jsonMatch[1]!.trim());
      } catch (e) {
        console.error("Failed to parse OCR JSON:", e);
        extractedData = { title: "", sections: [{ type: "paragraph", content }] };
      }
    }

    return new Response(
      JSON.stringify({ extractedData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("extract-text error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
