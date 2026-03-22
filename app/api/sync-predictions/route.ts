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
  clean_sheets?: number | null;
  failed_to_score?: number | null;
  btts_for?: number | null;
  over_25_for?: number | null;
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

function buildExplanation(params: {
  homeStrength: number;
  awayStrength: number;
  homeAttack: number;
  awayAttack: number;
  homeDefenceWeakness: number;
  awayDefenceWeakness: number;
  predictedHomeGoals: number;
  predictedAwayGoals: number;
  predictedResult: string;
}) {
  const {
    homeStrength,
    awayStrength,
    homeAttack,
    awayAttack,
    homeDefenceWeakness,
    awayDefenceWeakness,
    predictedHomeGoals,
    predictedAwayGoals,
    predictedResult,
  } = params;

  const resultLabel =
    predictedResult === "HOME"
      ? "home win"
      : predictedResult === "AWAY"
      ? "away win"
      : "draw";

  return [
    `Prediction leans ${resultLabel}.`,
    `Home strength score ${round1(homeStrength)} vs away strength score ${round1(
      awayStrength
    )}.`,
    `Expected goals project at ${predictedHomeGoals}-${predictedAwayGoals}.`,
    `Home attack index ${round1(homeAttack)} against away defensive weakness ${round1(
      awayDefenceWeakness
    )}.`,
    `Away attack index ${round1(awayAttack)} against home defensive weakness ${round1(
      homeDefenceWeakness
    )}.`,
  ].join(" ");
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
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const snapshotMap = new Map<string, SnapshotRow>();
    for (const row of (snapshotRows || []) as SnapshotRow[]) {
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

      const home = snapshotMap.get(
        getSnapshotKey(fixture.home_team_id, fixture.league_code, fixture.season)
      );
      const away = snapshotMap.get(
        getSnapshotKey(fixture.away_team_id, fixture.league_code, fixture.season)
      );

      if (!home || !away) {
        skipped += 1;
        continue;
      }

      if (home.played === 0 || away.played === 0) {
        skipped += 1;
        continue;
      }

      const leagueAvgGoalsPerTeam =
        snapshotRows && snapshotRows.length > 0
          ? snapshotRows.reduce(
              (sum, row: any) => sum + safeDiv(row.goals_for ?? 0, row.played ?? 1),
              0
            ) / snapshotRows.length
          : 1.35;

      const homeAttack = safeDiv(home.home_goals_for, Math.max(home.home_played, 1));
      const homeDefenceWeakness = safeDiv(
        home.home_goals_against,
        Math.max(home.home_played, 1)
      );

      const awayAttack = safeDiv(away.away_goals_for, Math.max(away.away_played, 1));
      const awayDefenceWeakness = safeDiv(
        away.away_goals_against,
        Math.max(away.away_played, 1)
      );

      const homeStrength =
        (home.home_points_per_game ?? home.points_per_game ?? 0) * 0.55 +
        (home.last_5_points ?? 0) / 15 * 1.25 +
        safeDiv(home.goal_difference, Math.max(home.played, 1)) * 0.2;

      const awayStrength =
        (away.away_points_per_game ?? away.points_per_game ?? 0) * 0.55 +
        (away.last_5_points ?? 0) / 15 * 1.25 +
        safeDiv(away.goal_difference, Math.max(away.played, 1)) * 0.2;

      let predictedHomeGoals =
        leagueAvgGoalsPerTeam *
        (0.55 + homeAttack / Math.max(leagueAvgGoalsPerTeam, 0.1) * 0.45) *
        (0.55 + awayDefenceWeakness / Math.max(leagueAvgGoalsPerTeam, 0.1) * 0.45);

      let predictedAwayGoals =
        leagueAvgGoalsPerTeam *
        (0.55 + awayAttack / Math.max(leagueAvgGoalsPerTeam, 0.1) * 0.45) *
        (0.55 + homeDefenceWeakness / Math.max(leagueAvgGoalsPerTeam, 0.1) * 0.45);

      predictedHomeGoals += 0.18;

      const strengthDiff = homeStrength - awayStrength;
      predictedHomeGoals += strengthDiff * 0.18;
      predictedAwayGoals -= strengthDiff * 0.10;

      predictedHomeGoals = round1(clamp(predictedHomeGoals, 0.2, 4.5));
      predictedAwayGoals = round1(clamp(predictedAwayGoals, 0.2, 4.0));

      let predictedResult = "DRAW";
      const goalDiff = predictedHomeGoals - predictedAwayGoals;

      if (goalDiff > 0.3) predictedResult = "HOME";
      if (goalDiff < -0.3) predictedResult = "AWAY";

      let confidenceLabel = "Medium";
      let confidenceScore = 0.67;

      if (Math.abs(goalDiff) >= 0.9) {
        confidenceLabel = "High";
        confidenceScore = 0.82;
      } else if (Math.abs(goalDiff) <= 0.2) {
        confidenceLabel = "Low";
        confidenceScore = 0.56;
      }

      let homeWinPct: number;
      let drawPct: number;
      let awayWinPct: number;

      if (predictedResult === "HOME") {
        homeWinPct = toPct(46 + goalDiff * 18 + strengthDiff * 7);
        awayWinPct = toPct(20 - goalDiff * 8 - strengthDiff * 4);
        drawPct = toPct(100 - homeWinPct - awayWinPct);
      } else if (predictedResult === "AWAY") {
        awayWinPct = toPct(46 + Math.abs(goalDiff) * 18 + Math.abs(strengthDiff) * 7);
        homeWinPct = toPct(20 - Math.abs(goalDiff) * 8 - Math.abs(strengthDiff) * 4);
        drawPct = toPct(100 - homeWinPct - awayWinPct);
      } else {
        drawPct = toPct(34 + (0.3 - Math.abs(goalDiff)) * 22);
        homeWinPct = toPct((100 - drawPct) / 2 + strengthDiff * 4);
        awayWinPct = toPct(100 - drawPct - homeWinPct);
      }

      const totalPct = homeWinPct + drawPct + awayWinPct;
      if (totalPct !== 100) {
        const diff = round1(100 - totalPct);
        drawPct = toPct(drawPct + diff);
      }

      const explanation = buildExplanation({
        homeStrength,
        awayStrength,
        homeAttack,
        awayAttack,
        homeDefenceWeakness,
        awayDefenceWeakness,
        predictedHomeGoals,
        predictedAwayGoals,
        predictedResult,
      });

      const inputSnapshot = {
        home: {
          team_id: home.team_id,
          points_per_game: home.points_per_game,
          home_points_per_game: home.home_points_per_game,
          last_5_points: home.last_5_points,
          goal_difference: home.goal_difference,
          home_goals_for: home.home_goals_for,
          home_goals_against: home.home_goals_against,
          home_played: home.home_played,
        },
        away: {
          team_id: away.team_id,
          points_per_game: away.points_per_game,
          away_points_per_game: away.away_points_per_game,
          last_5_points: away.last_5_points,
          goal_difference: away.goal_difference,
          away_goals_for: away.away_goals_for,
          away_goals_against: away.away_goals_against,
          away_played: away.away_played,
        },
        model_inputs: {
          league_average_goals_per_team: round1(leagueAvgGoalsPerTeam),
          home_attack: round1(homeAttack),
          away_attack: round1(awayAttack),
          home_defence_weakness: round1(homeDefenceWeakness),
          away_defence_weakness: round1(awayDefenceWeakness),
          home_strength: round1(homeStrength),
          away_strength: round1(awayStrength),
        },
      };

      const { error: upsertError } = await supabase.from("predictions").upsert(
        {
          fixture_id: fixture.id,
          league_code: fixture.league_code,
          season: fixture.season,
          home_team_id: fixture.home_team_id,
          away_team_id: fixture.away_team_id,
          predicted_home_goals: predictedHomeGoals,
          predicted_away_goals: predictedAwayGoals,
          predicted_result,
          confidence: confidenceLabel,
          home_win_pct: homeWinPct,
          draw_pct: drawPct,
          away_win_pct: awayWinPct,
          predicted_score_home: Math.round(predictedHomeGoals),
          predicted_score_away: Math.round(predictedAwayGoals),
          confidence_score: confidenceScore,
          confidence_label: confidenceLabel,
          model_version: "snapshot-v2",
          explanation,
          input_snapshot: inputSnapshot,
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "fixture_id" }
      );

      if (upsertError) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: upsertError.message,
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
        league_code: leagueCode,
        season,
        model_version: "snapshot-v2",
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
