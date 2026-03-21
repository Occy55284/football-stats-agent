import { createClient } from "@supabase/supabase-js";

type TeamFormRow = {
  team_id: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  points: number;
};

type FixtureRow = {
  id: string;
  home_team_id: string | null;
  away_team_id: string | null;
  status: string | null;
};

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: formRows, error: formError } = await supabase
    .from("team_form")
    .select("*");

  if (formError) {
    return new Response(
      JSON.stringify({ ok: false, error: formError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const formMap = new Map<string, TeamFormRow>();
  for (const row of (formRows || []) as TeamFormRow[]) {
    formMap.set(row.team_id, row);
  }

  const { data: fixtures, error: fixturesError } = await supabase
    .from("fixtures")
    .select("id, home_team_id, away_team_id, status")
    .in("status", ["SCHEDULED", "TIMED"])
    .order("utc_date", { ascending: true })
    .limit(20);

  if (fixturesError) {
    return new Response(
      JSON.stringify({ ok: false, error: fixturesError.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let saved = 0;

  for (const fixture of (fixtures || []) as FixtureRow[]) {
    if (!fixture.home_team_id || !fixture.away_team_id) continue;

    const home = formMap.get(fixture.home_team_id);
    const away = formMap.get(fixture.away_team_id);

    if (!home || !away || home.played === 0 || away.played === 0) continue;

    const homeAvgGoalsFor = home.goals_for / home.played;
    const homeAvgGoalsAgainst = home.goals_against / home.played;

    const awayAvgGoalsFor = away.goals_for / away.played;
    const awayAvgGoalsAgainst = away.goals_against / away.played;

    const predictedHomeGoals = Number(
      ((homeAvgGoalsFor + awayAvgGoalsAgainst) / 2 + 0.2).toFixed(1)
    );

    const predictedAwayGoals = Number(
      ((awayAvgGoalsFor + homeAvgGoalsAgainst) / 2).toFixed(1)
    );

    let predictedResult = "DRAW";
    let confidence = "Medium";

    const diff = predictedHomeGoals - predictedAwayGoals;

    if (diff > 0.35) predictedResult = "HOME";
    if (diff < -0.35) predictedResult = "AWAY";

    if (Math.abs(diff) >= 0.8) confidence = "High";
    if (Math.abs(diff) <= 0.2) confidence = "Low";

    const { error: insertError } = await supabase.from("predictions").upsert(
      {
        fixture_id: fixture.id,
        predicted_home_goals: predictedHomeGoals,
        predicted_away_goals: predictedAwayGoals,
        predicted_result: predictedResult,
        confidence,
      },
      { onConflict: "fixture_id" }
    );

    if (!insertError) saved += 1;
  }

  return new Response(
    JSON.stringify({ ok: true, saved }),
    { headers: { "Content-Type": "application/json" } }
  );
}
