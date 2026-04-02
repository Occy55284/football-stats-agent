import { createClient } from "@supabase/supabase-js";

type SnapshotRow = {
  team_id: string;
  league_code: string;
  season: number;
  played: number;
  goals_for: number;
  goals_against: number;
  points_per_game: number | null;
  last_5_points: number | null;
  home_played: number;
  home_goals_for: number;
  home_goals_against: number;
  home_points_per_game: number | null;
  away_played: number;
  away_goals_for: number;
  away_goals_against: number;
  away_points_per_game: number | null;
  form_score?: number | null;
  attack_score?: number | null;
  defence_score?: number | null;
  overall_strength_score?: number | null;
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

type OddsMarketRow = {
  fixture_id: string;
  market_avg_home_pct: number | null;
  market_avg_draw_pct: number | null;
  market_avg_away_pct: number | null;
};

const DEFAULT_SEASON = 2025;
const DEFAULT_COMPETITION = "PL";
const INCLUDED_STATUSES = ["SCHEDULED", "TIMED", "NS", "FINISHED", "FT"];

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function safeDiv(a: number, b: number) {
  return b ? a / b : 0;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

function round(v: number, dp = 2) {
  const m = 10 ** dp;
  return Math.round(v * m) / m;
}

function normalize(home: number, draw: number, away: number) {
  const total = home + draw + away || 1;

  return {
    home: round((home / total) * 100, 2),
    draw: round((draw / total) * 100, 2),
    away: round((away / total) * 100, 2),
  };
}

function pctToOdds(pct?: number | null) {
  const n = Number(pct || 0);
  if (n <= 0) return null;
  return round(100 / n, 2);
}

function getTopResult(home: number, draw: number, away: number): "HOME" | "DRAW" | "AWAY" {
  if (home >= draw && home >= away) return "HOME";
  if (away >= home && away >= draw) return "AWAY";
  return "DRAW";
}

function getSecondHighest(values: number[]) {
  return [...values].sort((a, b) => b - a)[1] || 0;
}

function getBestEdgeSide(edgeHome: number, edgeDraw: number, edgeAway: number) {
  let side: "HOME" | "DRAW" | "AWAY" = "HOME";
  let edge = edgeHome;

  if (edgeDraw > edge) {
    side = "DRAW";
    edge = edgeDraw;
  }

  if (edgeAway > edge) {
    side = "AWAY";
    edge = edgeAway;
  }

  return { side, edge };
}

function expectedValuePct(modelPct: number, marketPct: number | null) {
  if (marketPct == null || marketPct <= 0) return null;

  const marketOdds = 100 / marketPct;
  const winProb = modelPct / 100;
  const ev = winProb * marketOdds - 1;

  return round(ev * 100, 2);
}

function getRiskLabel(topProb: number, confidenceGap: number, drawPct: number, bestEdge: number) {
  if (topProb >= 56 && confidenceGap >= 10 && bestEdge >= 5) return "Low";
  if (topProb >= 48 && confidenceGap >= 6 && bestEdge >= 3) return "Medium";
  if (drawPct >= 30 || confidenceGap < 5) return "High";
  return "Medium";
}

function getEdgeQualityTier(score: number) {
  if (score >= 78) return "ELITE";
  if (score >= 62) return "STRONG";
  if (score >= 45) return "WATCH";
  return "PASS";
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabase();
    const url = new URL(request.url);

    const league = (url.searchParams.get("competition") || DEFAULT_COMPETITION).toUpperCase();
    const season = Number(url.searchParams.get("season") || DEFAULT_SEASON);

    const [{ data: snapshots }, { data: fixtures }, { data: odds }] = await Promise.all([
      supabase
        .from("team_stats_snapshot")
        .select("*")
        .eq("league_code", league)
        .eq("season", season),

      supabase
        .from("fixtures")
        .select("*")
        .eq("league_code", league)
        .eq("season", season)
        .in("status", INCLUDED_STATUSES),

      supabase
        .from("odds")
        .select("fixture_id, market_avg_home_pct, market_avg_draw_pct, market_avg_away_pct")
        .eq("league_code", league)
        .eq("season", season)
        .eq("bookmaker", "__market__"),
    ]);

    const snapMap = new Map<string, SnapshotRow>();
    (snapshots || []).forEach((s: any) => {
      snapMap.set(`${s.team_id}_${s.league_code}_${s.season}`, s);
    });

    const oddsMap = new Map<string, OddsMarketRow>();
    (odds || []).forEach((o: any) => {
      oddsMap.set(o.fixture_id, o);
    });

    const leagueAvg =
      (snapshots || []).reduce((sum: number, s: any) => {
        return sum + safeDiv(Number(s.goals_for || 0), Number(s.played || 0));
      }, 0) / ((snapshots || []).length || 1) || 1.35;

    let saved = 0;
    let marketBlended = 0;
    let recommendedCount = 0;

    for (const f of (fixtures || []) as FixtureRow[]) {
      const home = snapMap.get(`${f.home_team_id}_${league}_${season}`);
      const away = snapMap.get(`${f.away_team_id}_${league}_${season}`);

      if (!home || !away || !f.home_team_id || !f.away_team_id) continue;

      const homeAttackPerGame = safeDiv(Number(home.home_goals_for || 0), Number(home.home_played || 0));
      const awayAttackPerGame = safeDiv(Number(away.away_goals_for || 0), Number(away.away_played || 0));
      const homeDefPerGame = safeDiv(Number(home.home_goals_against || 0), Number(home.home_played || 0));
      const awayDefPerGame = safeDiv(Number(away.away_goals_against || 0), Number(away.away_played || 0));

      const homeFormBoost = clamp((Number(home.form_score || 50) - 50) / 100, -0.15, 0.15);
      const awayFormBoost = clamp((Number(away.form_score || 50) - 50) / 100, -0.15, 0.15);

      const homeStrengthBoost = clamp(
        ((Number(home.overall_strength_score || 50) - Number(away.overall_strength_score || 50)) / 100) * 0.4,
        -0.18,
        0.18
      );

      const awayStrengthBoost = clamp(
        ((Number(away.overall_strength_score || 50) - Number(home.overall_strength_score || 50)) / 100) * 0.4,
        -0.18,
        0.18
      );

      let expectedHomeGoals =
        leagueAvg *
          (homeAttackPerGame / leagueAvg || 1) *
          (awayDefPerGame / leagueAvg || 1) *
          (1 + homeFormBoost) *
          (1 + homeStrengthBoost) +
        0.18;

      let expectedAwayGoals =
        leagueAvg *
        (awayAttackPerGame / leagueAvg || 1) *
        (homeDefPerGame / leagueAvg || 1) *
        (1 + awayFormBoost) *
        (1 + awayStrengthBoost);

      expectedHomeGoals = clamp(expectedHomeGoals, 0.2, 4.2);
      expectedAwayGoals = clamp(expectedAwayGoals, 0.2, 4.0);

      const goalDiff = expectedHomeGoals - expectedAwayGoals;
      const strengthDiff = Number(home.overall_strength_score || 50) - Number(away.overall_strength_score || 50);
      const formDiff = Number(home.form_score || 50) - Number(away.form_score || 50);

      let rawHomePct = 33 + goalDiff * 19 + strengthDiff * 0.18 + formDiff * 0.12;
      let rawAwayPct = 33 - goalDiff * 19 - strengthDiff * 0.18 - formDiff * 0.12;

      let rawDrawPct =
        34 -
        Math.abs(goalDiff) * 7 -
        Math.abs(strengthDiff) * 0.08 -
        Math.abs(formDiff) * 0.05;

      rawDrawPct = clamp(rawDrawPct, 16, 34);
      rawHomePct = clamp(rawHomePct, 10, 75);
      rawAwayPct = clamp(rawAwayPct, 10, 75);

      const model = normalize(rawHomePct, rawDrawPct, rawAwayPct);

      const market = oddsMap.get(f.id);

      let final = model;

      if (
        market &&
        market.market_avg_home_pct != null &&
        market.market_avg_draw_pct != null &&
        market.market_avg_away_pct != null
      ) {
        marketBlended += 1;

        const absGoalDiff = Math.abs(goalDiff);
        const modelWeight = absGoalDiff >= 0.65 ? 0.62 : absGoalDiff >= 0.35 ? 0.56 : 0.5;
        const marketWeight = 1 - modelWeight;

        final = normalize(
          model.home * modelWeight + Number(market.market_avg_home_pct) * marketWeight,
          model.draw * modelWeight + Number(market.market_avg_draw_pct) * marketWeight,
          model.away * modelWeight + Number(market.market_avg_away_pct) * marketWeight
        );
      }

      const edgeHome = round(final.home - Number(market?.market_avg_home_pct || 0), 2);
      const edgeDraw = round(final.draw - Number(market?.market_avg_draw_pct || 0), 2);
      const edgeAway = round(final.away - Number(market?.market_avg_away_pct || 0), 2);

      const best = getBestEdgeSide(edgeHome, edgeDraw, edgeAway);

      const predicted = getTopResult(final.home, final.draw, final.away);
      const topProb = Math.max(final.home, final.draw, final.away);
      const secondProb = getSecondHighest([final.home, final.draw, final.away]);
      const confidenceGap = round(topProb - secondProb, 2);

      const bestModelPct =
        best.side === "HOME" ? final.home : best.side === "DRAW" ? final.draw : final.away;

      const bestMarketPct =
        best.side === "HOME"
          ? market?.market_avg_home_pct ?? null
          : best.side === "DRAW"
          ? market?.market_avg_draw_pct ?? null
          : market?.market_avg_away_pct ?? null;

      const bestEvPct = expectedValuePct(bestModelPct, bestMarketPct);

      let qualityScore = 0;

      qualityScore += clamp(best.edge * 4, 0, 32);
      qualityScore += clamp(confidenceGap * 2.4, 0, 24);
      qualityScore += clamp((topProb - 40) * 1.2, 0, 18);
      qualityScore += clamp((bestEvPct || 0) * 1.1, 0, 20);

      if (market) qualityScore += 6;
      if (final.draw >= 30) qualityScore -= 8;
      if (confidenceGap < 5) qualityScore -= 10;
      if (best.edge < 2) qualityScore -= 8;

      qualityScore = clamp(round(qualityScore, 0), 0, 100);

      const qualityTier = getEdgeQualityTier(qualityScore);
      const riskLabel = getRiskLabel(topProb, confidenceGap, final.draw, best.edge);
      const betRecommendation =
        !!market &&
        best.edge >= 3.5 &&
        (bestEvPct || 0) >= 2 &&
        confidenceGap >= 6 &&
        qualityTier !== "PASS";

      if (betRecommendation) recommendedCount += 1;

      const fairHomeOdds = pctToOdds(final.home);
      const fairDrawOdds = pctToOdds(final.draw);
      const fairAwayOdds = pctToOdds(final.away);

      const marketHomeOdds = pctToOdds(market?.market_avg_home_pct);
      const marketDrawOdds = pctToOdds(market?.market_avg_draw_pct);
      const marketAwayOdds = pctToOdds(market?.market_avg_away_pct);

      const confidenceLabel =
        topProb >= 58 && confidenceGap >= 10
          ? "High"
          : topProb >= 46 && confidenceGap >= 6
          ? "Medium"
          : "Low";

      const { error } = await supabase.from("predictions").upsert(
        {
          fixture_id: f.id,
          league_code: league,
          season,
          home_team_id: f.home_team_id,
          away_team_id: f.away_team_id,

          predicted_home_goals: round(expectedHomeGoals, 2),
          predicted_away_goals: round(expectedAwayGoals, 2),
          predicted_result: predicted,

          home_win_pct: final.home,
          draw_pct: final.draw,
          away_win_pct: final.away,

          model_home_pct: model.home,
          model_draw_pct: model.draw,
          model_away_pct: model.away,

          market_home_pct: market?.market_avg_home_pct || null,
          market_draw_pct: market?.market_avg_draw_pct || null,
          market_away_pct: market?.market_avg_away_pct || null,

          market_home_odds: marketHomeOdds,
          market_draw_odds: marketDrawOdds,
          market_away_odds: marketAwayOdds,

          fair_home_odds: fairHomeOdds,
          fair_draw_odds: fairDrawOdds,
          fair_away_odds: fairAwayOdds,

          edge_home_pct: edgeHome,
          edge_draw_pct: edgeDraw,
          edge_away_pct: edgeAway,

          best_value_side: best.side,
          best_value_edge: round(best.edge, 2),
          best_value_ev_pct: bestEvPct,

          edge_quality_score: qualityScore,
          edge_quality_tier: qualityTier,
          bet_recommendation: betRecommendation,
          risk_label: riskLabel,

          confidence: confidenceLabel,
          confidence_label: confidenceLabel,
          confidence_score: round(confidenceGap, 2),

          model_version: "hybrid-v3-edge-quality",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "fixture_id" }
      );

      if (!error) saved++;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        saved,
        market_blended: marketBlended,
        recommended: recommendedCount,
        league,
        season,
        model_version: "hybrid-v3-edge-quality",
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
