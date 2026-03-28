import { createClient } from "@supabase/supabase-js";

const DEFAULT_SEASON = 2025;
const DEFAULT_COMPETITION = "PL";
const ALLOWED_COMPETITIONS = ["PL", "ELC"] as const;

type StandingRow = {
  team_id: string;
  played_games: number;
  won: number;
  draw: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
};

type FormRow = {
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
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) throw new Error("Missing Supabase env");

  return createClient(url, key);
}

function parseCompetition(url: URL) {
  const requested = (
    url.searchParams.get("competition") ||
    DEFAULT_COMPETITION
  ).toUpperCase();

  return ALLOWED_COMPETITIONS.includes(requested as any)
    ? requested
    : DEFAULT_COMPETITION;
}

function parseSeason(url: URL) {
  const raw = Number(url.searchParams.get("season") || DEFAULT_SEASON);
  return Number.isFinite(raw) ? raw : DEFAULT_SEASON;
}

function safeDiv(a: number, b: number) {
  if (!b) return 0;
  return a / b;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const leagueCode = parseCompetition(url);
    const season = parseSeason(url);

    const supabase = getSupabaseAdmin();

    const [{ data: standings }, { data: form }, { data: fixtures }] =
      await Promise.all([
        supabase
          .from("standings")
          .select("*")
          .eq("league_code", leagueCode)
          .eq("season", season),

        supabase
          .from("team_form")
          .select("*")
          .eq("league_code", leagueCode)
          .eq("season", season),

        supabase
          .from("fixtures")
          .select("home_team_id, away_team_id, home_score, away_score, status")
          .eq("league_code", leagueCode)
          .eq("season", season)
          .eq("status", "FINISHED"),
      ]);

    const standingsRows = (standings || []) as StandingRow[];
    const formRows = (form || []) as FormRow[];
    const fixtureRows = (fixtures || []) as FixtureRow[];

    const formMap = new Map<string, FormRow>();
    for (const f of formRows) {
      formMap.set(f.team_id, f);
    }

    const homeStats = new Map<string, { played: number; gf: number; ga: number; pts: number }>();
    const awayStats = new Map<string, { played: number; gf: number; ga: number; pts: number }>();

    for (const fix of fixtureRows) {
      if (!fix.home_team_id || !fix.away_team_id) continue;

      const home = homeStats.get(fix.home_team_id) || { played: 0, gf: 0, ga: 0, pts: 0 };
      const away = awayStats.get(fix.away_team_id) || { played: 0, gf: 0, ga: 0, pts: 0 };

      const hs = fix.home_score ?? 0;
      const as = fix.away_score ?? 0;

      home.played++;
      home.gf += hs;
      home.ga += as;

      away.played++;
      away.gf += as;
      away.ga += hs;

      if (hs > as) {
        home.pts += 3;
      } else if (hs < as) {
        away.pts += 3;
      } else {
        home.pts += 1;
        away.pts += 1;
      }

      homeStats.set(fix.home_team_id, home);
      awayStats.set(fix.away_team_id, away);
    }

    const rows = standingsRows.map((s) => {
      const form = formMap.get(s.team_id);

      const home = homeStats.get(s.team_id) || { played: 0, gf: 0, ga: 0, pts: 0 };
      const away = awayStats.get(s.team_id) || { played: 0, gf: 0, ga: 0, pts: 0 };

      const ppg = safeDiv(s.points, s.played_games);
      const formScore = safeDiv(form?.points || 0, (form?.played || 1)) * 10;

      const attack =
        safeDiv(s.goals_for, s.played_games) * 0.6 +
        safeDiv(home.gf, home.played) * 0.2 +
        safeDiv(away.gf, away.played) * 0.2;

      const defence =
        3 - (
          safeDiv(s.goals_against, s.played_games) * 0.6 +
          safeDiv(home.ga, home.played) * 0.2 +
          safeDiv(away.ga, away.played) * 0.2
        );

      const strength =
        ppg * 2 +
        formScore * 0.5 +
        attack * 1.5 +
        defence * 1.5;

      return {
        team_id: s.team_id,
        league_code: leagueCode,
        season,

        played: s.played_games,
        wins: s.won,
        draws: s.draw,
        losses: s.lost,
        goals_for: s.goals_for,
        goals_against: s.goals_against,
        goal_difference: s.goal_difference,
        points: s.points,
        points_per_game: ppg,

        last_5_points: form?.points || 0,

        home_played: home.played,
        home_goals_for: home.gf,
        home_goals_against: home.ga,
        home_points_per_game: safeDiv(home.pts, home.played),

        away_played: away.played,
        away_goals_for: away.gf,
        away_goals_against: away.ga,
        away_points_per_game: safeDiv(away.pts, away.played),

        form_score: formScore,
        attack_score: attack,
        defence_score: defence,
        overall_strength_score: strength,
      };
    });

    await supabase
      .from("team_stats_snapshot")
      .delete()
      .eq("league_code", leagueCode)
      .eq("season", season);

    const { error } = await supabase.from("team_stats_snapshot").insert(rows);

    if (error) {
      return new Response(
        JSON.stringify({ ok: false, error: error.message }),
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        saved: rows.length,
        league_code: leagueCode,
        season,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : "Unknown",
      }),
      { status: 500 }
    );
  }
}
