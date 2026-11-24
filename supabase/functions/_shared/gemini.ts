export const GEMINI_TEXT_MODEL = "gemini-2.5-flash";
export const GEMINI_IMAGE_MODEL = "gemini-3-pro-image-preview";

type GeminiPart = {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
};

type GeminiRequest = {
  model: string;
  contents: Array<{
    role: "user" | "model";
    parts: GeminiPart[];
  }>;
  systemInstruction?: {
    parts: Array<{ text: string }>;
  };
  generationConfig?: Record<string, unknown>;
};

export class GeminiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

export async function generateGeminiContent(request: GeminiRequest): Promise<any> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    throw new GeminiError(500, "GEMINI_API_KEY is not configured on the Supabase Edge Function.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${request.model}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: request.contents,
        systemInstruction: request.systemInstruction,
        generationConfig: request.generationConfig,
      }),
    },
  );

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = result?.error?.message;
    throw new GeminiError(
      response.status,
      providerMessage || `Gemini API request failed (${response.status}).`,
    );
  }

  return result;
}

export function extractGeminiText(result: any): string {
  const parts = result?.candidates?.flatMap((candidate: any) => candidate?.content?.parts ?? []) ?? [];
  return parts
    .filter((part: any) => typeof part?.text === "string")
    .map((part: any) => part.text)
    .join("\n")
    .trim();
}

export function extractGeminiImage(result: any): string | null {
  const parts = result?.candidates?.flatMap((candidate: any) => candidate?.content?.parts ?? []) ?? [];
  for (const part of parts) {
    if (part?.inlineData?.data) {
      return `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
    }
  }
  return null;
}

export function imagePart(mimeType: string, pureBase64: string): GeminiPart {
  return {
    inlineData: {
      mimeType,
      data: pureBase64,
    },
  };
}
