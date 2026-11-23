import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory rate limiter for guest (unauthenticated) requests
const GUEST_RATE_LIMIT = 5; // max requests per window
const GUEST_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const guestRateMap = new Map<string, { count: number; windowStart: number }>();

function checkGuestRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = guestRateMap.get(ip);

  if (!entry || now - entry.windowStart > GUEST_RATE_WINDOW_MS) {
    guestRateMap.set(ip, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= GUEST_RATE_LIMIT) {
    return false;
  }

  entry.count++;
  return true;
}

// Periodic cleanup of expired entries (every 100 requests)
let requestCounter = 0;
function cleanupRateMap() {
  requestCounter++;
  if (requestCounter % 100 !== 0) return;
  const now = Date.now();
  for (const [ip, entry] of guestRateMap) {
    if (now - entry.windowStart > GUEST_RATE_WINDOW_MS) {
      guestRateMap.delete(ip);
    }
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    cleanupRateMap();

    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData } = await supabase.auth.getClaims(token);
      if (claimsData?.claims) {
        userId = claimsData.claims.sub as string;
      }
    }

    // Rate limit unauthenticated (guest) requests
    if (!userId) {
      const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      if (!checkGuestRateLimit(clientIP)) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please sign up to continue using the service." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const body = await req.json();
    const { question_text, user_answer, mode, lang, imageBase64 } = body;

    // Validate imageBase64 if provided
    if (imageBase64) {
      if (typeof imageBase64 !== "string") {
        return new Response(
          JSON.stringify({ error: "Invalid image data" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      let pureBase64 = imageBase64;
      if (imageBase64.startsWith("data:")) {
        const match = imageBase64.match(/^data:image\/(jpeg|jpg|png|webp|gif);base64,/);
        if (!match) {
          return new Response(
            JSON.stringify({ error: "Invalid image format. Use JPEG, PNG, or WebP." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        pureBase64 = imageBase64.replace(/^data:image\/[^;]+;base64,/, "");
      }
      const estimatedBytes = (pureBase64.length * 3) / 4;
      if (estimatedBytes > 10 * 1024 * 1024) {
        return new Response(
          JSON.stringify({ error: "Image too large. Maximum size is 10MB." }),
          { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Validate text inputs
    const MAX_TEXT_LENGTH = 10000;
    if (mode && !["full", "hint"].includes(mode)) {
      return new Response(
        JSON.stringify({ error: "Invalid mode. Must be 'full' or 'hint'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (lang && !["zh", "en"].includes(lang)) {
      return new Response(
        JSON.stringify({ error: "Invalid language. Must be 'zh' or 'en'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (question_text && typeof question_text === "string" && question_text.length > MAX_TEXT_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Question text too long. Maximum ${MAX_TEXT_LENGTH} characters.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (user_answer && typeof user_answer === "string" && user_answer.length > MAX_TEXT_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Answer too long. Maximum ${MAX_TEXT_LENGTH} characters.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const language = lang === "en" ? "English" : "繁體中文";
    const hasUserAnswer = user_answer && user_answer.trim();

const systemPrompt = `You are a friendly, encouraging homework helper for Hong Kong primary and secondary students (ages 6-15). 
You MUST respond in ${language}.
You must AUTO-DETECT the subject from the question content.

Rules:
- Keep explanations simple and age-appropriate
- Use encouraging language
- For math: show clear step-by-step reasoning
- Never include inappropriate content
- Always be supportive and educational
- Use markdown formatting in explanations (bold, lists, etc.)
- IMPORTANT: In each question's "explanation" field, wrap any WRONG answer text with <<red>>...<<\/red>> and any CORRECT answer text with <<yellow>>...<<\/yellow>> to highlight them.

CRITICAL INSTRUCTION: The homework may contain MULTIPLE questions. You MUST identify and list ALL individual questions separately. For each question, provide its own result.

MATH CONSISTENCY (VERY IMPORTANT):
- For math questions, you MUST calculate twice internally before answering.
- The value in "correct_answer" MUST be exactly the same as the final answer shown in "explanation".
- In each math explanation, end with exactly one final-answer line:
  最終答案：<<yellow>>[answer]<<\/yellow>>
- Do NOT output conflicting final numbers. If there is any mismatch, recalculate and output only one final answer.
- If the image text is unclear, set is_correct to null and explain what is unreadable instead of guessing.

${!hasUserAnswer 
  ? "- SOLVE MODE: The student has NOT provided answers. You must solve every question yourself, provide the correct answer for each."
  : mode === "hint" 
    ? "- HINT MODE: Only give helpful clues and hints for each question. Do NOT reveal full answers." 
    : "- FULL CHECK MODE: For each question, check the student's answer, state if correct or incorrect, provide the correct answer, and give explanation."}

You must respond with a JSON object using this EXACT format:
{
  "questions": [
    {
      "question_number": 1,
      "question_text": "the question text as found in the homework",
      "student_answer": "the student's written answer if visible, or null",
      "is_correct": true/false/null,
      "correct_answer": "the correct answer",
      "explanation": "step-by-step explanation with <<red>>/<<yellow>> highlighting",
      "detected_subject": "chinese/english/math-cn/math-en/general",
      "confidence": 0.0-1.0
    }
  ],
  "summary": {
    "total": number,
    "correct": number,
    "incorrect": number,
    "score_percent": number
  },
  "encouragement": "overall encouraging message"
}

For the "confidence" field:
- 1.0 = absolutely certain (clear text, straightforward question)
- 0.7-0.9 = fairly confident (minor ambiguity)
- 0.4-0.6 = uncertain (blurry image, unclear handwriting, ambiguous question)
- below 0.4 = very uncertain (guessing)
Be honest about your confidence. If the image is blurry or handwriting is hard to read, lower the confidence accordingly.`;

    const userContent: any[] = [];
    if (imageBase64) {
      userContent.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
      });
      userContent.push({
        type: "text",
        text: hasUserAnswer 
          ? `The image shows homework. The student says their answers are: "${user_answer}". Please identify ALL questions and check each one.`
          : `The image shows homework. Please identify ALL questions, solve each one, and provide answers with explanations.`,
      });
    } else {
      userContent.push({
        type: "text",
        text: hasUserAnswer
          ? `Homework:\n${question_text}\n\nStudent's answers: ${user_answer}\n\nPlease identify ALL questions and check each one.`
          : `Homework:\n${question_text}\n\nPlease identify ALL questions, solve each one, and provide answers with explanations.`,
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-pro-preview",
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 403) {
        let msg = "AI 使用上限已到，請工作區管理員提高 AI 額度上限。";
        try { const j = await aiResponse.json(); if (j?.message) msg = j.message; else if (j?.error?.message) msg = j.error.message; } catch { /* ignore */ }
        return new Response(JSON.stringify({ error: msg }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI gateway error:", aiResponse.status);
      throw new Error("AI gateway error");
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/) || rawContent.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : rawContent;
      parsed = JSON.parse(jsonStr);
    } catch {
      // Fallback: wrap as single question
      parsed = {
        questions: [{
          question_number: 1,
          question_text: question_text || "(image)",
          student_answer: user_answer || null,
          is_correct: null,
          correct_answer: null,
          explanation: rawContent,
          detected_subject: "general",
        }],
        summary: { total: 1, correct: 0, incorrect: 0, score_percent: 0 },
        encouragement: "",
      };
    }

    // Normalize: if old format (no questions array), wrap it
    if (!parsed.questions && parsed.explanation) {
      parsed = {
        questions: [{
          question_number: 1,
          question_text: question_text || "(image)",
          student_answer: user_answer || null,
          is_correct: parsed.is_correct,
          correct_answer: parsed.correct_answer,
          explanation: parsed.explanation,
          detected_subject: parsed.detected_subject || "general",
        }],
        summary: { total: 1, correct: parsed.is_correct ? 1 : 0, incorrect: parsed.is_correct === false ? 1 : 0, score_percent: parsed.is_correct ? 100 : 0 },
        encouragement: parsed.encouragement || "",
      };
    }

    // Save submissions for authenticated users
    if (mode === "full" && userId && parsed.questions?.length) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader! } } }
      );
      const rows = parsed.questions.map((q: any) => ({
        user_id: userId,
        subject: q.detected_subject || "general",
        question_text: String(q.question_text || "(image)"),
        user_answer: String(q.student_answer || ""),
        correct_answer: q.correct_answer ? String(q.correct_answer) : null,
        explanation: q.explanation ? String(q.explanation) : null,
        is_correct: typeof q.is_correct === "boolean" ? q.is_correct : null,
        image_url: null,
      }));
      await supabase.from("submissions").insert(rows);
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("check-homework error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
