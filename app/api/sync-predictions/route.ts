import { createClient } from "@supabase/supabase-js";

type SnapshotRow = {
  team_id: string;
  league_code: string;
  season: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  points_per_game: number | null;
  last_5_points: number | null;
  home_played: number;
  home_wins: number;
  home_draws: number;
  home_losses: number;
  home_goals_for: number;
  home_goals_against: number;
  home_points_per_game: number | null;
  away_played: number;
  away_wins: number;
  away_draws: number;
  away_losses: number;
  away_goals_for: number;
  away_goals_against: number;
  away_points_per_game: number | null;
};

type FixtureRow = {
  id: string;
  league_code: string | null;
  season: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
  status: string | null;
  utc_date?: string | null;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(url, serviceRoleKey);
}

function getSnapshotKey(teamId: string, leagueCode: string, season: number) {
  return `${teamId}::${leagueCode}::${season}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function safeDiv(a: number, b: number) {
  if (!b) return 0;
  return a / b;
}

function toPct(value: number) {
  return round1(clamp(value, 0, 100));
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const leagueCode = "PL";
    const season = 2025;

    const { data: snapshotRows, error: snapshotError } = await supabase
      .from("team_stats_snapshot")
      .select("*")
      .eq("league_code", leagueCode)
      .eq("season", season);

    if (snapshotError) {
      return new Response(
        JSON.stringify({ ok: false, error: snapshotError.message }),
        { status: 500 }
      );
    }

    const snapshotMap = new Map<string, SnapshotRow>();
    for (const row of snapshotRows || []) {
      snapshotMap.set(
        getSnapshotKey(row.team_id, row.league_code, row.season),
        row
      );
    }

    const { data: fixtures, error: fixturesError } = await supabase
      .from("fixtures")
      .select("id, league_code, season, home_team_id, away_team_id, status, utc_date")
      .eq("league_code", leagueCode)
      .eq("season", season)
      .in("status", ["SCHEDULED", "TIMED"])
      .order("utc_date", { ascending: true })
      .limit(50);

    if (fixturesError) {
      return new Response(
        JSON.stringify({ ok: false, error: fixturesError.message }),
        { status: 500 }
      );
    }

    let saved = 0;
    let skipped = 0;

    for (const fixture of fixtures || []) {
      if (
        !fixture.home_team_id ||
        !fixture.away_team_id ||
        !fixture.league_code ||
        fixture.season == null
      ) {
        skipped++;
        continue;
      }

      const home = snapshotMap.get(
        getSnapshotKey(fixture.home_team_id, fixture.league_code, fixture.season)
      );
      const away = snapshotMap.get(
        getSnapshotKey(fixture.away_team_id, fixture.league_code, fixture.season)
      );

      if (!home || !away || home.played === 0 || away.played === 0) {
        skipped++;
        continue;
      }

      const leagueAvgGoals =
        snapshotRows && snapshotRows.length > 0
          ? snapshotRows.reduce(
              (sum, r) => sum + safeDiv(r.goals_for, r.played),
              0
            ) / snapshotRows.length
          : 1.35;

      const homeAttack = safeDiv(home.home_goals_for, home.home_played);
      const awayAttack = safeDiv(away.away_goals_for, away.away_played);

      const homeDef = safeDiv(home.home_goals_against, home.home_played);
      const awayDef = safeDiv(away.away_goals_against, away.away_played);

      let predictedHomeGoals =
        leagueAvgGoals * (homeAttack / leagueAvgGoals) * (awayDef / leagueAvgGoals);

      let predictedAwayGoals =
        leagueAvgGoals * (awayAttack / leagueAvgGoals) * (homeDef / leagueAvgGoals);

      predictedHomeGoals += 0.2;

      predictedHomeGoals = clamp(predictedHomeGoals, 0.2, 4.5);
      predictedAwayGoals = clamp(predictedAwayGoals, 0.2, 4.0);

      predictedHomeGoals = round1(predictedHomeGoals);
      predictedAwayGoals = round1(predictedAwayGoals);

      let predictedResult = "DRAW";
      const diff = predictedHomeGoals - predictedAwayGoals;

      if (diff > 0.3) predictedResult = "HOME";
      if (diff < -0.3) predictedResult = "AWAY";

      let confidenceLabel = "Medium";
      let confidenceScore = 0.67;

      if (Math.abs(diff) >= 0.9) {
        confidenceLabel = "High";
        confidenceScore = 0.82;
      } else if (Math.abs(diff) <= 0.2) {
        confidenceLabel = "Low";
        confidenceScore = 0.56;
      }

      let homeWinPct = 33;
      let drawPct = 34;
      let awayWinPct = 33;

      if (predictedResult === "HOME") {
        homeWinPct = toPct(46 + diff * 18);
        awayWinPct = toPct(22 - diff * 8);
        drawPct = toPct(100 - homeWinPct - awayWinPct);
      } else if (predictedResult === "AWAY") {
        awayWinPct = toPct(46 + Math.abs(diff) * 18);
        homeWinPct = toPct(22 - Math.abs(diff) * 8);
        drawPct = toPct(100 - homeWinPct - awayWinPct);
      }

      const { error: upsertError } = await supabase.from("predictions").upsert(
        {
          fixture_id: fixture.id,
          league_code: fixture.league_code,
          season: fixture.season,
          home_team_id: fixture.home_team_id,
          away_team_id: fixture.away_team_id,
          predicted_home_goals: predictedHomeGoals,
          predicted_away_goals: predictedAwayGoals,
          predicted_result: predictedResult,
          confidence: confidenceLabel,
          home_win_pct: homeWinPct,
          draw_pct: drawPct,
          away_win_pct: awayWinPct,
          predicted_score_home: Math.round(predictedHomeGoals),
          predicted_score_away: Math.round(predictedAwayGoals),
          confidence_score: confidenceScore,
          confidence_label: confidenceLabel,
          model_version: "snapshot-v2",
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "fixture_id" }
      );

      if (upsertError) {
        return new Response(
          JSON.stringify({ ok: false, error: upsertError.message }),
          { status: 500 }
        );
      }

      saved++;
    }

    return new Response(
      JSON.stringify({ ok: true, saved, skipped }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500 }
    );
  }
}
