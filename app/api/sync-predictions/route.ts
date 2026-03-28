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
  form_score?: number | null;
  attack_score?: number | null;
  defence_score?: number | null;
  overall_strength_score?: number | null;
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

type OddsMarketRow = {
  fixture_id: string;
  bookmaker: string;
  market: string;
  market_avg_home_pct: number | null;
  market_avg_draw_pct: number | null;
  market_avg_away_pct: number | null;
  market_avg_home_odds?: number | null;
  market_avg_draw_odds?: number | null;
  market_avg_away_odds?: number | null;
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

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function safeDiv(a: number, b: number) {
  if (!b) return 0;
  return a / b;
}

function toPct(value: number) {
  return round2(clamp(value, 0, 100));
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

function normalizeThree(home: number, draw: number, away: number) {
  const total = home + draw + away;

  if (!total) {
    return { home: 33.33, draw: 33.33, away: 33.34 };
  }

  return {
    home: (home / total) * 100,
    draw: (draw / total) * 100,
    away: (away / total) * 100,
  };
}

function strengthPct(value?: number | null) {
  return Number(value || 0);
}

function pointsPct(points?: number | null) {
  return Number(points || 0);
}

function buildInternalProbabilities(
  predictedHomeGoals: number,
  predictedAwayGoals: number,
  homeSnapshot: SnapshotRow,
  awaySnapshot: SnapshotRow
) {
  const diff = predictedHomeGoals - predictedAwayGoals;

  const homeStrength = strengthPct(homeSnapshot.overall_strength_score);
  const awayStrength = strengthPct(awaySnapshot.overall_strength_score);

  const strengthGap = homeStrength - awayStrength;
  const homePpgGap =
    pointsPct(homeSnapshot.home_points_per_game) - pointsPct(awaySnapshot.away_points_per_game);
  const formGap =
    pointsPct(homeSnapshot.last_5_points) - pointsPct(awaySnapshot.last_5_points);
  const attackGap =
    strengthPct(homeSnapshot.attack_score) - strengthPct(awaySnapshot.attack_score);
  const defenceGap =
    strengthPct(homeSnapshot.defence_score) - strengthPct(awaySnapshot.defence_score);

  let home = 33;
  let draw = 34;
  let away = 33;

  home += diff * 19;
  away -= diff * 19;

  home += strengthGap * 1.9;
  away -= strengthGap * 1.9;

  home += homePpgGap * 7;
  away -= homePpgGap * 7;

  home += formGap * 0.75;
  away -= formGap * 0.75;

  home += attackGap * 1.1;
  away -= attackGap * 1.1;

  home += defenceGap * 0.9;
  away -= defenceGap * 0.9;

  const goalTotal = predictedHomeGoals + predictedAwayGoals;
  if (Math.abs(diff) < 0.22) {
    draw += 6;
  } else if (Math.abs(diff) < 0.45) {
    draw += 2.5;
  } else {
    draw -= Math.min(Math.abs(diff) * 3.5, 8);
  }

  if (goalTotal < 2.15) draw += 3.5;
  if (goalTotal > 3.1) draw -= 2.5;

  const normalized = normalizeThree(home, draw, away);

  return {
    home: toPct(normalized.home),
    draw: toPct(normalized.draw),
    away: toPct(normalized.away),
  };
}

function buildFormStrengthProbabilities(homeSnapshot: SnapshotRow, awaySnapshot: SnapshotRow) {
  const homeStrength = strengthPct(homeSnapshot.overall_strength_score);
  const awayStrength = strengthPct(awaySnapshot.overall_strength_score);

  const homeForm = pointsPct(homeSnapshot.last_5_points);
  const awayForm = pointsPct(awaySnapshot.last_5_points);

  const homeAttack = strengthPct(homeSnapshot.attack_score);
  const awayAttack = strengthPct(awaySnapshot.attack_score);

  const homeDefence = strengthPct(homeSnapshot.defence_score);
  const awayDefence = strengthPct(awaySnapshot.defence_score);

  const homeVenue = pointsPct(homeSnapshot.home_points_per_game);
  const awayVenue = pointsPct(awaySnapshot.away_points_per_game);

  let home = 33;
  let draw = 34;
  let away = 33;

  home += (homeStrength - awayStrength) * 2.3;
  away -= (homeStrength - awayStrength) * 2.3;

  home += (homeForm - awayForm) * 1.0;
  away -= (homeForm - awayForm) * 1.0;

  home += (homeAttack - awayAttack) * 1.0;
  away -= (homeAttack - awayAttack) * 1.0;

  home += (homeDefence - awayDefence) * 0.8;
  away -= (homeDefence - awayDefence) * 0.8;

  home += (homeVenue - awayVenue) * 8;
  away -= (homeVenue - awayVenue) * 8;

  const gap = Math.abs(homeStrength - awayStrength) + Math.abs(homeForm - awayForm) * 0.4;
  if (gap < 2) {
    draw += 5;
  } else if (gap < 4) {
    draw += 2;
  } else {
    draw -= Math.min(gap, 6);
  }

  const normalized = normalizeThree(home, draw, away);

  return {
    home: toPct(normalized.home),
    draw: toPct(normalized.draw),
    away: toPct(normalized.away),
  };
}

function blendProbabilities(
  internal: { home: number; draw: number; away: number },
  market: { home: number; draw: number; away: number } | null,
  formStrength: { home: number; draw: number; away: number }
) {
  const internalWeight = market ? 0.5 : 0.7;
  const marketWeight = market ? 0.3 : 0;
  const formWeight = market ? 0.2 : 0.3;

  const home =
    internal.home * internalWeight +
    (market ? market.home * marketWeight : 0) +
    formStrength.home * formWeight;

  const draw =
    internal.draw * internalWeight +
    (market ? market.draw * marketWeight : 0) +
    formStrength.draw * formWeight;

  const away =
    internal.away * internalWeight +
    (market ? market.away * marketWeight : 0) +
    formStrength.away * formWeight;

  const normalized = normalizeThree(home, draw, away);

  return {
    home: toPct(normalized.home),
    draw: toPct(normalized.draw),
    away: toPct(normalized.away),
    used_market: !!market,
    weights: {
      internal: internalWeight,
      market: marketWeight,
      form_strength: formWeight,
    },
  };
}

function getPredictedResult(home: number, draw: number, away: number): "HOME" | "DRAW" | "AWAY" {
  if (home >= draw && home >= away) return "HOME";
  if (away >= home && away >= draw) return "AWAY";
  return "DRAW";
}

function getConfidence(
  predictedResult: "HOME" | "DRAW" | "AWAY",
  home: number,
  draw: number,
  away: number,
  marketUsed: boolean
) {
  const ordered = [home, draw, away].sort((a, b) => b - a);
  const top = ordered[0];
  const second = ordered[1];
  const edge = top - second;

  let score = top * 0.72 + edge * 1.9;

  if (predictedResult === "DRAW") score -= 6;
  if (marketUsed) score += 3;

  score = clamp(score, 40, 92);

  let label: "High" | "Medium" | "Low" = "Medium";
  if (score >= 74) label = "High";
  else if (score < 58) label = "Low";

  return {
    label,
    score: round2(score),
    edge: round2(edge),
  };
}

function buildExplanation(args: {
  predictedResult: "HOME" | "DRAW" | "AWAY";
  confidenceLabel: string;
  confidenceScore: number;
  marketUsed: boolean;
  homePct: number;
  drawPct: number;
  awayPct: number;
  homeSnapshot: SnapshotRow;
  awaySnapshot: SnapshotRow;
}) {
  const {
    predictedResult,
    confidenceLabel,
    confidenceScore,
    marketUsed,
    homePct,
    drawPct,
    awayPct,
    homeSnapshot,
    awaySnapshot,
  } = args;

  const homeStrength = strengthPct(homeSnapshot.overall_strength_score);
  const awayStrength = strengthPct(awaySnapshot.overall_strength_score);
  const strengthGap = round2(homeStrength - awayStrength);

  const homeForm = pointsPct(homeSnapshot.last_5_points);
  const awayForm = pointsPct(awaySnapshot.last_5_points);
  const formGap = homeForm - awayForm;

  const angle =
    predictedResult === "HOME"
      ? "home side"
      : predictedResult === "AWAY"
        ? "away side"
        : "draw";

  const topPct =
    predictedResult === "HOME"
      ? homePct
      : predictedResult === "AWAY"
        ? awayPct
        : drawPct;

  const parts = [
    `${angle} leads the blended model at ${round2(topPct)}%.`,
    `Confidence is ${confidenceLabel.toLowerCase()} (${round2(confidenceScore)}).`,
    `Strength gap is ${strengthGap >= 0 ? "+" : ""}${strengthGap} and recent form gap is ${formGap >= 0 ? "+" : ""}${formGap} points.`,
  ];

  if (marketUsed) {
    parts.push("Bookmaker consensus has been blended into the final probabilities.");
  } else {
    parts.push("No bookmaker consensus was available, so the model used internal stats and form weighting only.");
  }

  return parts.join(" ");
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

    const [{ data: snapshotRows, error: snapshotError }, { data: fixtures, error: fixturesError }, { data: oddsRows, error: oddsError }] =
      await Promise.all([
        supabase
          .from("team_stats_snapshot")
          .select("*")
          .eq("league_code", leagueCode)
          .eq("season", season),

        supabase
          .from("fixtures")
          .select("id, league_code, season, home_team_id, away_team_id, status, utc_date")
          .eq("league_code", leagueCode)
          .eq("season", season)
          .in("status", statuses)
          .order("utc_date", { ascending: true })
          .limit(2000),

        supabase
          .from("odds")
          .select(`
            fixture_id,
            bookmaker,
            market,
            market_avg_home_pct,
            market_avg_draw_pct,
            market_avg_away_pct,
            market_avg_home_odds,
            market_avg_draw_odds,
            market_avg_away_odds
          `)
          .eq("league_code", leagueCode)
          .eq("season", season)
          .eq("bookmaker", "__market__")
          .eq("market", "h2h"),
      ]);

    if (snapshotError) {
      return new Response(
        JSON.stringify({ ok: false, error: snapshotError.message }),
        { status: 500 }
      );
    }

    if (fixturesError) {
      return new Response(
        JSON.stringify({ ok: false, error: fixturesError.message }),
        { status: 500 }
      );
    }

    if (oddsError) {
      return new Response(
        JSON.stringify({ ok: false, error: oddsError.message }),
        { status: 500 }
      );
    }

    const typedSnapshots = (snapshotRows || []) as SnapshotRow[];
    const typedFixtures = (fixtures || []) as FixtureRow[];
    const typedOdds = (oddsRows || []) as OddsMarketRow[];

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

    const oddsMap = new Map<string, OddsMarketRow>();
    for (const row of typedOdds) {
      oddsMap.set(row.fixture_id, row);
    }

    const leagueAvgGoals =
      typedSnapshots.reduce((sum, row) => sum + safeDiv(row.goals_for, row.played), 0) /
        typedSnapshots.length || 1.35;

    let saved = 0;
    let skipped = 0;
    let marketBlended = 0;

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

      const homeAttackScore = Number(home.attack_score || 0);
      const awayAttackScore = Number(away.attack_score || 0);
      const homeDefenceScore = Number(home.defence_score || 0);
      const awayDefenceScore = Number(away.defence_score || 0);
      const homeStrengthScore = Number(home.overall_strength_score || 0);
      const awayStrengthScore = Number(away.overall_strength_score || 0);
      const homeFormScore = Number(home.form_score || 0);
      const awayFormScore = Number(away.form_score || 0);

      let predictedHomeGoals =
        leagueAvgGoals * safeDiv(homeAttack, leagueAvgGoals) * safeDiv(awayDef, leagueAvgGoals);

      let predictedAwayGoals =
        leagueAvgGoals * safeDiv(awayAttack, leagueAvgGoals) * safeDiv(homeDef, leagueAvgGoals);

      predictedHomeGoals += 0.2;

      const attackModifier = clamp((homeAttackScore - awayAttackScore) * 0.025, -0.25, 0.25);
      const defenceModifier = clamp((homeDefenceScore - awayDefenceScore) * 0.02, -0.2, 0.2);
      const strengthModifier = clamp((homeStrengthScore - awayStrengthScore) * 0.025, -0.3, 0.3);
      const formModifier = clamp((homeFormScore - awayFormScore) * 0.012, -0.18, 0.18);

      predictedHomeGoals += attackModifier * 0.45;
      predictedHomeGoals += defenceModifier * 0.15;
      predictedHomeGoals += strengthModifier * 0.18;
      predictedHomeGoals += formModifier * 0.12;

      predictedAwayGoals -= attackModifier * 0.20;
      predictedAwayGoals -= defenceModifier * 0.28;
      predictedAwayGoals -= strengthModifier * 0.16;
      predictedAwayGoals -= formModifier * 0.10;

      predictedHomeGoals = clamp(predictedHomeGoals, 0.2, 4.8);
      predictedAwayGoals = clamp(predictedAwayGoals, 0.2, 4.4);

      predictedHomeGoals = round1(predictedHomeGoals);
      predictedAwayGoals = round1(predictedAwayGoals);

      const internalProbabilities = buildInternalProbabilities(
        predictedHomeGoals,
        predictedAwayGoals,
        home,
        away
      );

      const formStrengthProbabilities = buildFormStrengthProbabilities(home, away);

      const odds = oddsMap.get(fixture.id);
      const marketProbabilities =
        odds &&
        odds.market_avg_home_pct != null &&
        odds.market_avg_draw_pct != null &&
        odds.market_avg_away_pct != null
          ? {
              home: Number(odds.market_avg_home_pct),
              draw: Number(odds.market_avg_draw_pct),
              away: Number(odds.market_avg_away_pct),
            }
          : null;

      const blended = blendProbabilities(
        internalProbabilities,
        marketProbabilities,
        formStrengthProbabilities
      );

      if (blended.used_market) {
        marketBlended++;
      }

      const predictedResult = getPredictedResult(
        blended.home,
        blended.draw,
        blended.away
      );

      const confidence = getConfidence(
        predictedResult,
        blended.home,
        blended.draw,
        blended.away,
        blended.used_market
      );

      const nowIso = new Date().toISOString();

      const explanation = buildExplanation({
        predictedResult,
        confidenceLabel: confidence.label,
        confidenceScore: confidence.score,
        marketUsed: blended.used_market,
        homePct: blended.home,
        drawPct: blended.draw,
        awayPct: blended.away,
        homeSnapshot: home,
        awaySnapshot: away,
      });

      const inputSnapshot = {
        league_average_goals: round2(leagueAvgGoals),
        internal_probabilities: internalProbabilities,
        form_strength_probabilities: formStrengthProbabilities,
        market_probabilities: marketProbabilities,
        blended_weights: blended.weights,
        home_snapshot: {
          points_per_game: home.points_per_game,
          last_5_points: home.last_5_points,
          form_score: home.form_score,
          attack_score: home.attack_score,
          defence_score: home.defence_score,
          overall_strength_score: home.overall_strength_score,
          home_points_per_game: home.home_points_per_game,
        },
        away_snapshot: {
          points_per_game: away.points_per_game,
          last_5_points: away.last_5_points,
          form_score: away.form_score,
          attack_score: away.attack_score,
          defence_score: away.defence_score,
          overall_strength_score: away.overall_strength_score,
          away_points_per_game: away.away_points_per_game,
        },
        odds_market: odds
          ? {
              bookmaker: odds.bookmaker,
              market: odds.market,
              market_avg_home_odds: odds.market_avg_home_odds,
              market_avg_draw_odds: odds.market_avg_draw_odds,
              market_avg_away_odds: odds.market_avg_away_odds,
              market_avg_home_pct: odds.market_avg_home_pct,
              market_avg_draw_pct: odds.market_avg_draw_pct,
              market_avg_away_pct: odds.market_avg_away_pct,
            }
          : null,
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
          predicted_result: predictedResult,
          confidence: confidence.label,
          home_win_pct: blended.home,
          draw_pct: blended.draw,
          away_win_pct: blended.away,
          predicted_score_home: Math.round(predictedHomeGoals),
          predicted_score_away: Math.round(predictedAwayGoals),
          confidence_score: confidence.score,
          confidence_label: confidence.label,
          model_version: blended.used_market
            ? "hybrid-v1-stats-form-market"
            : "hybrid-v1-stats-form",
          explanation,
          input_snapshot: inputSnapshot,
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
        market_blended: marketBlended,
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
