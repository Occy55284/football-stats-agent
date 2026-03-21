import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const apiKey = process.env.FOOTBALL_DATA_API_KEY;

  const teamsRes = await supabase
    .from("teams")
    .select("id, provider_team_id");

  if (teamsRes.error) {
    return new Response(
      JSON.stringify({ ok: false, error: teamsRes.error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const teamMap = new Map<number, string>();
  for (const team of teamsRes.data) {
    teamMap.set(team.provider_team_id, team.id);
  }

  const res = await fetch(
    "https://api.football-data.org/v4/competitions/PL/matches",
    {
      headers: {
        "X-Auth-Token": apiKey || "",
      },
      cache: "no-store",
    }
  );

  const data = await res.json();

  for (const match of data.matches) {
    const homeTeamId = teamMap.get(match.homeTeam?.id);
    const awayTeamId = teamMap.get(match.awayTeam?.id);

    await supabase.from("fixtures").upsert({
      home_team_id: homeTeamId || null,
      away_team_id: awayTeamId || null,
      competition_code: match.competition?.code || "PL",
      provider_match_id: match.id,
      utc_date: match.utcDate,
      status: match.status,
      matchday: match.matchday,
      home_score: match.score?.fullTime?.home ?? null,
      away_score: match.score?.fullTime?.away ?? null,
      winner: match.score?.winner ?? null,
    });
  }

  return new Response(
    JSON.stringify({ ok: true, count: data.matches.length }),
    { headers: { "Content-Type": "application/json" } }
  );
}
