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
    "https://api.football-data.org/v4/competitions/PL/standings",
    {
      headers: {
        "X-Auth-Token": apiKey || "",
      },
      cache: "no-store",
    }
  );

  const data = await res.json();
  const table = data.standings?.[0]?.table || [];

  for (const row of table) {
    const teamId = teamMap.get(row.team?.id);

    if (!teamId) continue;

    await supabase.from("standings").upsert({
      team_id: teamId,
      position: row.position,
      played_games: row.playedGames,
      won: row.won,
      draw: row.draw,
      lost: row.lost,
      points: row.points,
      goals_for: row.goalsFor,
      goals_against: row.goalsAgainst,
      goal_difference: row.goalDifference,
    });
  }

  return new Response(
    JSON.stringify({ ok: true, count: table.length }),
    { headers: { "Content-Type": "application/json" } }
  );
}
