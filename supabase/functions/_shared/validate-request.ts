import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export interface ValidatedRequest {
  userId: string | null;
  imageBase64: string;
  mimeType: string;
  pureBase64: string;
  extraFields?: Record<string, unknown>;
}

/**
 * Validates image input for edge functions.
 * Auth is optional — if a valid Bearer token is present, userId is extracted.
 * Otherwise userId is null (guest mode).
 */
export async function validateRequest(
  req: Request,
  extraFieldNames?: string[]
): Promise<ValidatedRequest | Response> {
  // 1. Auth check (optional — guest mode allowed)
  let userId: string | null = null;
  const authHeader = req.headers.get("Authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    // Only attempt auth validation if token looks like a JWT (has dots), not just the anon key
    if (token.split(".").length === 3) {
      try {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } }
        );
        const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
        if (!claimsError && claimsData?.claims?.sub) {
          userId = claimsData.claims.sub as string;
        }
      } catch {
        // Auth failed silently — continue as guest
      }
    }
  }

  // 2. Parse body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const imageBase64 = body.imageBase64;

  // 3. Validate imageBase64 presence and type
  if (!imageBase64 || typeof imageBase64 !== "string") {
    return new Response(
      JSON.stringify({ error: "No image provided" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 4. Parse mime type and extract pure base64
  let mimeType = "image/jpeg";
  let pureBase64 = imageBase64;
  if (imageBase64.startsWith("data:")) {
    const match = imageBase64.match(/^data:(image\/(jpeg|jpg|png|webp|gif));base64,/);
    if (!match) {
      return new Response(
        JSON.stringify({ error: "Invalid image format. Use JPEG, PNG, or WebP." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    mimeType = match[1];
    pureBase64 = imageBase64.replace(/^data:image\/[^;]+;base64,/, "");
  }

  // 5. Validate size
  const estimatedBytes = (pureBase64.length * 3) / 4;
  if (estimatedBytes > MAX_IMAGE_SIZE_BYTES) {
    return new Response(
      JSON.stringify({ error: "Image too large. Maximum size is 10MB." }),
      { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // 6. Extract extra fields
  const extraFields: Record<string, unknown> = {};
  if (extraFieldNames) {
    for (const name of extraFieldNames) {
      extraFields[name] = body[name];
    }
  }

  return { userId, imageBase64, mimeType, pureBase64, extraFields };
}
