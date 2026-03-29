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

function round(v: number) {
  return Math.round(v * 100) / 100;
}

function normalize(home: number, draw: number, away: number) {
  const total = home + draw + away;
  return {
    home: round((home / total) * 100),
    draw: round((draw / total) * 100),
    away: round((away / total) * 100),
  };
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabase();
    const url = new URL(request.url);

    const league = (url.searchParams.get("competition") || DEFAULT_COMPETITION).toUpperCase();
    const season = Number(url.searchParams.get("season") || DEFAULT_SEASON);

    const [{ data: snapshots }, { data: fixtures }, { data: odds }] = await Promise.all([
      supabase.from("team_stats_snapshot").select("*").eq("league_code", league).eq("season", season),
      supabase.from("fixtures").select("*").eq("league_code", league).eq("season", season).in("status", INCLUDED_STATUSES),
      supabase.from("odds")
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
    (odds || []).forEach((o: any) => oddsMap.set(o.fixture_id, o));

    const leagueAvg =
      (snapshots || []).reduce((sum: number, s: any) => sum + safeDiv(s.goals_for, s.played), 0) /
        (snapshots?.length || 1) || 1.35;

    let saved = 0;
    let market_blended = 0;

    for (const f of fixtures || []) {
      const home = snapMap.get(`${f.home_team_id}_${league}_${season}`);
      const away = snapMap.get(`${f.away_team_id}_${league}_${season}`);

      if (!home || !away) continue;

      const homeAttack = safeDiv(home.home_goals_for, home.home_played);
      const awayAttack = safeDiv(away.away_goals_for, away.away_played);
      const homeDef = safeDiv(home.home_goals_against, home.home_played);
      const awayDef = safeDiv(away.away_goals_against, away.away_played);

      let hG = leagueAvg * (homeAttack / leagueAvg) * (awayDef / leagueAvg) + 0.2;
      let aG = leagueAvg * (awayAttack / leagueAvg) * (homeDef / leagueAvg);

      hG = clamp(hG, 0.2, 4.5);
      aG = clamp(aG, 0.2, 4.5);

      const diff = hG - aG;

      let homePct = 33 + diff * 18;
      let awayPct = 33 - diff * 18;
      let drawPct = 34;

      const norm = normalize(homePct, drawPct, awayPct);

      const market = oddsMap.get(f.id);

      let final = norm;

      if (market && market.market_avg_home_pct != null) {
        market_blended++;

        final = normalize(
          norm.home * 0.5 + market.market_avg_home_pct * 0.3,
          norm.draw * 0.5 + market.market_avg_draw_pct * 0.3,
          norm.away * 0.5 + market.market_avg_away_pct * 0.3
        );
      }

      const edge_home = round(final.home - (market?.market_avg_home_pct || 0));
      const edge_draw = round(final.draw - (market?.market_avg_draw_pct || 0));
      const edge_away = round(final.away - (market?.market_avg_away_pct || 0));

      let best_side: "HOME" | "DRAW" | "AWAY" = "HOME";
      let best_edge = edge_home;

      if (edge_draw > best_edge) {
        best_edge = edge_draw;
        best_side = "DRAW";
      }
      if (edge_away > best_edge) {
        best_edge = edge_away;
        best_side = "AWAY";
      }

      const predicted =
        final.home > final.away && final.home > final.draw
          ? "HOME"
          : final.away > final.home && final.away > final.draw
          ? "AWAY"
          : "DRAW";

      const { error } = await supabase.from("predictions").upsert(
        {
          fixture_id: f.id,
          league_code: league,
          season,
          home_team_id: f.home_team_id,
          away_team_id: f.away_team_id,

          predicted_home_goals: round(hG),
          predicted_away_goals: round(aG),
          predicted_result: predicted,

          home_win_pct: final.home,
          draw_pct: final.draw,
          away_win_pct: final.away,

          // market
          market_home_pct: market?.market_avg_home_pct || null,
          market_draw_pct: market?.market_avg_draw_pct || null,
          market_away_pct: market?.market_avg_away_pct || null,

          // edges
          edge_home_pct: edge_home,
          edge_draw_pct: edge_draw,
          edge_away_pct: edge_away,

          best_value_side: best_side,
          best_value_edge: best_edge,

          model_version: "hybrid-v2-value",
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
        market_blended,
        league,
        season,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
  }
}
