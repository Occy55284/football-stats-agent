import { createClient } from "@supabase/supabase-js";

type TeamFormRow = {
  team_id: string;
  league_code: string;
  season: number;
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
  league_code: string | null;
  season: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
  status: string | null;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(url, serviceRoleKey);
}

function getFormKey(teamId: string, leagueCode: string, season: number) {
  return `${teamId}::${leagueCode}::${season}`;
}

function clampPct(value: number) {
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value * 10) / 10;
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data: formRows, error: formError } = await supabase
      .from("team_form")
      .select("*")
      .eq("league_code", "PL")
      .eq("season", 2025);

    if (formError) {
      return new Response(
        JSON.stringify({ ok: false, error: formError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const formMap = new Map<string, TeamFormRow>();
    for (const row of (formRows || []) as TeamFormRow[]) {
      formMap.set(getFormKey(row.team_id, row.league_code, row.season), row);
    }

    const { data: fixtures, error: fixturesError } = await supabase
      .from("fixtures")
      .select("id, league_code, season, home_team_id, away_team_id, status")
      .eq("league_code", "PL")
      .eq("season", 2025)
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
    let skipped = 0;

    for (const fixture of (fixtures || []) as FixtureRow[]) {
      if (
        !fixture.home_team_id ||
        !fixture.away_team_id ||
        !fixture.league_code ||
        fixture.season == null
      ) {
        skipped += 1;
        continue;
      }

      const home = formMap.get(
        getFormKey(fixture.home_team_id, fixture.league_code, fixture.season)
      );
      const away = formMap.get(
        getFormKey(fixture.away_team_id, fixture.league_code, fixture.season)
      );

      if (!home || !away || home.played === 0 || away.played === 0) {
        skipped += 1;
        continue;
      }

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

      let homeWinPct = 33.3;
      let drawPct = 33.3;
      let awayWinPct = 33.4;

      if (predictedResult === "HOME") {
        homeWinPct = clampPct(45 + diff * 18);
        awayWinPct = clampPct(22 - diff * 8);
        drawPct = clampPct(100 - homeWinPct - awayWinPct);
      } else if (predictedResult === "AWAY") {
        awayWinPct = clampPct(45 + Math.abs(diff) * 18);
        homeWinPct = clampPct(22 - Math.abs(diff) * 8);
        drawPct = clampPct(100 - homeWinPct - awayWinPct);
      } else {
        drawPct = clampPct(38 - Math.abs(diff) * 10);
        homeWinPct = clampPct((100 - drawPct) / 2);
        awayWinPct = clampPct(100 - drawPct - homeWinPct);
      }

      const confidenceScore =
        confidence === "High" ? 0.82 : confidence === "Low" ? 0.56 : 0.68;

      const explanation = `Model prediction based on team form and average goals: home ${predictedHomeGoals} vs away ${predictedAwayGoals}.`;

      const { error: insertError } = await supabase.from("predictions").upsert(
        {
          fixture_id: fixture.id,
          league_code: fixture.league_code,
          season: fixture.season,
          home_team_id: fixture.home_team_id,
          away_team_id: fixture.away_team_id,
          predicted_home_goals: predictedHomeGoals,
          predicted_away_goals: predictedAwayGoals,
          predicted_result: predictedResult,
          confidence,
          home_win_pct: homeWinPct,
          draw_pct: drawPct,
          away_win_pct: awayWinPct,
          predicted_score_home: Math.round(predictedHomeGoals),
          predicted_score_away: Math.round(predictedAwayGoals),
          confidence_score: confidenceScore,
          confidence_label: confidence,
          model_version: "form-v1",
          explanation,
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "fixture_id" }
      );

      if (insertError) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: insertError.message,
            failed_fixture_id: fixture.id,
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      saved += 1;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        saved,
        skipped,
        league_code: "PL",
        season: 2025,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
