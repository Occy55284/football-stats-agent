import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const apiKey = process.env.FOOTBALL_DATA_API_KEY;

  const res = await fetch(
    "https://api.football-data.org/v4/competitions/PL/teams",
    {
      headers: {
        "X-Auth-Token": apiKey || "",
      },
      cache: "no-store",
    }
  );

  const data = await res.json();

  for (const team of data.teams) {
    await supabase.from("teams").upsert({
      name: team.name,
      short_name: team.shortName,
      tla: team.tla,
      crest: team.crest,
      provider_team_id: team.id,
    });
  }

  return new Response(
    JSON.stringify({ ok: true, count: data.teams.length }),
    { headers: { "Content-Type": "application/json" } }
  );
}
