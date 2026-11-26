export const GEMINI_TEXT_MODEL = "gemini-3.1-pro-preview";
export const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";

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

type GoogleServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

export class GeminiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GeminiError";
    this.status = status;
  }
}

function base64Url(value: string | ArrayBuffer): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function getGoogleAccessToken(serviceAccount: GoogleServiceAccount): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    throw new GeminiError(500, "Unable to authenticate the Google service account.");
  }

  cachedAccessToken = {
    token: result.access_token,
    expiresAt: Date.now() + Math.max(60, Number(result.expires_in || 3600) - 60) * 1000,
  };
  return result.access_token;
}

export async function generateGeminiContent(request: GeminiRequest): Promise<any> {
  const credentials = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!credentials) {
    throw new GeminiError(500, "GOOGLE_SERVICE_ACCOUNT_JSON is not configured on the Supabase Edge Function.");
  }

  let serviceAccount: GoogleServiceAccount;
  try {
    serviceAccount = JSON.parse(credentials);
  } catch {
    throw new GeminiError(500, "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.");
  }

  const accessToken = await getGoogleAccessToken(serviceAccount);
  const endpoint = `https://aiplatform.googleapis.com/v1/projects/${serviceAccount.project_id}/locations/global/publishers/google/models/${request.model}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: request.contents,
      systemInstruction: request.systemInstruction,
      generationConfig: request.generationConfig,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new GeminiError(
      response.status,
      result?.error?.message || `Vertex AI request failed (${response.status}).`,
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
