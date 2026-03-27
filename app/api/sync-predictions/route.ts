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

const DEFAULT_SEASON = 2025;
const DEFAULT_COMPETITION = "PL";
const ALLOWED_COMPETITIONS = ["PL", "ELC"] as const;
const INCLUDED_STATUSES = ["SCHEDULED", "TIMED", "NS", "FINISHED", "FT"];

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

function parseCompetition(url: URL) {
  const requested = (
    url.searchParams.get("competition") ||
    url.searchParams.get("league_code") ||
    DEFAULT_COMPETITION
  ).toUpperCase();

  return ALLOWED_COMPETITIONS.includes(
    requested as (typeof ALLOWED_COMPETITIONS)[number]
  )
    ? requested
    : DEFAULT_COMPETITION;
}

function parseSeason(url: URL) {
  const raw = Number(url.searchParams.get("season") || DEFAULT_SEASON);
  return Number.isFinite(raw) ? raw : DEFAULT_SEASON;
}

function shouldIncludeFinished(url: URL) {
  const raw = (url.searchParams.get("include_finished") || "true").toLowerCase();
  return raw !== "false";
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseAdmin();
    const url = new URL(request.url);

    const leagueCode = parseCompetition(url);
    const season = parseSeason(url);
    const includeFinished = shouldIncludeFinished(url);

    const statuses = includeFinished
      ? INCLUDED_STATUSES
      : ["SCHEDULED", "TIMED", "NS"];

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

    const typedSnapshots = (snapshotRows || []) as SnapshotRow[];

    if (typedSnapshots.length === 0) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `No team_stats_snapshot rows found for ${leagueCode} ${season}`,
        }),
        { status: 400 }
      );
    }

    const snapshotMap = new Map<string, SnapshotRow>();
    for (const row of typedSnapshots) {
      snapshotMap.set(
        getSnapshotKey(row.team_id, row.league_code, row.season),
        row
      );
    }

    const leagueAvgGoals =
      typedSnapshots.reduce((sum, row) => sum + safeDiv(row.goals_for, row.played), 0) /
        typedSnapshots.length || 1.35;

    const { data: fixtures, error: fixturesError } = await supabase
      .from("fixtures")
      .select("id, league_code, season, home_team_id, away_team_id, status, utc_date")
      .eq("league_code", leagueCode)
      .eq("season", season)
      .in("status", statuses)
      .order("utc_date", { ascending: true })
      .limit(1000);

    if (fixturesError) {
      return new Response(
        JSON.stringify({ ok: false, error: fixturesError.message }),
        { status: 500 }
      );
    }

    const typedFixtures = (fixtures || []) as FixtureRow[];

    let saved = 0;
    let skipped = 0;

    for (const fixture of typedFixtures) {
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

      const homeAttack = safeDiv(home.home_goals_for, home.home_played);
      const awayAttack = safeDiv(away.away_goals_for, away.away_played);

      const homeDef = safeDiv(home.home_goals_against, home.home_played);
      const awayDef = safeDiv(away.away_goals_against, away.away_played);

      let predictedHomeGoals =
        leagueAvgGoals * safeDiv(homeAttack, leagueAvgGoals) * safeDiv(awayDef, leagueAvgGoals);

      let predictedAwayGoals =
        leagueAvgGoals * safeDiv(awayAttack, leagueAvgGoals) * safeDiv(homeDef, leagueAvgGoals);

      predictedHomeGoals += 0.2;

      predictedHomeGoals = clamp(predictedHomeGoals, 0.2, 4.5);
      predictedAwayGoals = clamp(predictedAwayGoals, 0.2, 4.0);

      predictedHomeGoals = round1(predictedHomeGoals);
      predictedAwayGoals = round1(predictedAwayGoals);

      let predictedResult: "HOME" | "DRAW" | "AWAY" = "DRAW";
      const diff = predictedHomeGoals - predictedAwayGoals;

      if (diff > 0.3) predictedResult = "HOME";
      if (diff < -0.3) predictedResult = "AWAY";

      let confidenceLabel: "High" | "Medium" | "Low" = "Medium";
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

      const nowIso = new Date().toISOString();

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
          model_version: includeFinished ? "snapshot-v3-multi-league" : "snapshot-v3-upcoming",
          generated_at: nowIso,
          updated_at: nowIso,
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
      JSON.stringify({
        ok: true,
        saved,
        skipped,
        league_code: leagueCode,
        season,
        include_finished: includeFinished,
        fixtures_considered: typedFixtures.length,
      }),
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
