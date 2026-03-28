import { createClient } from "@supabase/supabase-js";

const DEFAULT_SEASON = 2025;
const DEFAULT_COMPETITION = "PL";
const ALLOWED_COMPETITIONS = ["PL", "ELC"] as const;
const FORM_MATCH_LIMIT = 5;

type TeamRow = {
  id: string;
};

type FixtureRow = {
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  utc_date: string | null;
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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const leagueCode = parseCompetition(url);
    const season = parseSeason(url);

    const supabase = getSupabaseAdmin();

    const [{ data: leagueFixtures, error: fixturesError }, { data: finishedFixtures, error: finishedError }] =
      await Promise.all([
        supabase
          .from("fixtures")
          .select("home_team_id, away_team_id")
          .eq("league_code", leagueCode)
          .eq("season", season),

        supabase
          .from("fixtures")
          .select("home_team_id, away_team_id, home_score, away_score, utc_date, status")
          .eq("league_code", leagueCode)
          .eq("season", season)
          .in("status", ["FINISHED", "FT"])
          .order("utc_date", { ascending: false }),
      ]);

    if (fixturesError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: fixturesError.message,
          league_code: leagueCode,
          season,
        }),
        { status: 500 }
      );
    }

    if (finishedError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: finishedError.message,
          league_code: leagueCode,
          season,
        }),
        { status: 500 }
      );
    }

    const typedLeagueFixtures = (leagueFixtures || []) as Array<{
      home_team_id: string | null;
      away_team_id: string | null;
    }>;

    const typedFinishedFixtures = (finishedFixtures || []) as FixtureRow[];

    const leagueTeamIds = new Set<string>();
    for (const fixture of typedLeagueFixtures) {
      if (fixture.home_team_id) leagueTeamIds.add(fixture.home_team_id);
      if (fixture.away_team_id) leagueTeamIds.add(fixture.away_team_id);
    }

    const recentByTeam = new Map<string, FixtureRow[]>();

    for (const fixture of typedFinishedFixtures) {
      if (fixture.home_team_id && leagueTeamIds.has(fixture.home_team_id)) {
        const arr = recentByTeam.get(fixture.home_team_id) || [];
        if (arr.length < FORM_MATCH_LIMIT) {
          arr.push(fixture);
          recentByTeam.set(fixture.home_team_id, arr);
        }
      }

      if (fixture.away_team_id && leagueTeamIds.has(fixture.away_team_id)) {
        const arr = recentByTeam.get(fixture.away_team_id) || [];
        if (arr.length < FORM_MATCH_LIMIT) {
          arr.push(fixture);
          recentByTeam.set(fixture.away_team_id, arr);
        }
      }
    }

    const rows = Array.from(leagueTeamIds).map((teamId) => {
      const recent = recentByTeam.get(teamId) || [];

      let played = 0;
      let won = 0;
      let drawn = 0;
      let lost = 0;
      let goalsFor = 0;
      let goalsAgainst = 0;
      let points = 0;

      for (const match of recent) {
        const isHome = match.home_team_id === teamId;
        const gf = isHome ? match.home_score ?? 0 : match.away_score ?? 0;
        const ga = isHome ? match.away_score ?? 0 : match.home_score ?? 0;

        played += 1;
        goalsFor += gf;
        goalsAgainst += ga;

        if (gf > ga) {
          won += 1;
          points += 3;
        } else if (gf === ga) {
          drawn += 1;
          points += 1;
        } else {
          lost += 1;
        }
      }

      return {
        team_id: teamId,
        played,
        won,
        drawn,
        lost,
        goals_for: goalsFor,
        goals_against: goalsAgainst,
        points,
        league_code: leagueCode,
        season,
      };
    });

    const { error: deleteError } = await supabase
      .from("team_form")
      .delete()
      .eq("league_code", leagueCode)
      .eq("season", season);

    if (deleteError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: deleteError.message,
          league_code: leagueCode,
          season,
        }),
        { status: 500 }
      );
    }

    const { error: insertError } = await supabase.from("team_form").insert(rows);

    if (insertError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: insertError.message,
          league_code: leagueCode,
          season,
        }),
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        count: rows.length,
        league_code: leagueCode,
        season,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
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
