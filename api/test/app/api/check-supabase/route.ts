export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!url) {
    return new Response(
      JSON.stringify({ ok: false, message: "Supabase URL missing" }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, message: "Supabase URL found ✅" }),
    { headers: { "Content-Type": "application/json" } }
  );
}
