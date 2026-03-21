const baseUrl = "https://football-stats-agent.vercel.app";

export async function GET() {
  const results: Record<string, any> = {};

  const steps = [
    "sync-teams",
    "sync-fixtures",
    "sync-standings",
    "sync-form",
    "sync-predictions"
  ];

  for (const step of steps) {
    const res = await fetch(`${baseUrl}/api/${step}`, {
      cache: "no-store"
    });
    results[step] = await res.json();
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { "Content-Type": "application/json" }
  });
}
