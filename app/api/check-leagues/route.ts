import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  return new Response(
    JSON.stringify({
      urlExists: !!url,
      urlStart: url ? url.slice(0, 30) : null,
      keyExists: !!serviceKey,
      keyStart: serviceKey ? serviceKey.slice(0, 12) : null,
      keyLength: serviceKey.length
    }),
    {
      headers: { "Content-Type": "application/json" }
    }
  );
}
