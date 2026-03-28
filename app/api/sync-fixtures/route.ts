import { createClient } from "@supabase/supabase-js";

const DEFAULT_SEASON = 2025;
const DEFAULT_COMPETITION = "PL";
const ALLOWED_COMPETITIONS = ["PL", "ELC"] as const;

type FootballDataMatch = {
  id: number;
  utcDate?: string | null;
  status?: string | null;
  matchday?: number | null;
  score?: {
    fullTime?: {
      home?: number | null;
      away?: number | null;
    } | null;
    winner?: string | null;
  } | null;
  homeTeam?: {
    id: number;
  } | null;
  awayTeam?: {
    id: number;
  } | null;
};

type TeamRow = {
  id: string;
  provider_team_id: number;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(url, serviceRoleKey);
}

function getApiToken() {
  const token = process.env.FD_API_TOKEN;
  if (!token) {
    throw new Error("Missing FD_API_TOKEN");
  }
  return token;
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

    const apiToken = getApiToken();
    const supabase = getSupabaseAdmin();

    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id, provider_team_id");

    if (teamsError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: teamsError.message,
          league_code: leagueCode,
          season,
        }),
        { status: 500 }
      );
    }

    const typedTeams = (teams || []) as TeamRow[];
    const teamIdMap = new Map<number, string>();

    for (const team of typedTeams) {
      teamIdMap.set(team.provider_team_id, team.id);
    }

    const fdRes = await fetch(
      `https://api.football-data.org/v4/competitions/${leagueCode}/matches?season=${season}`,
      {
        headers: {
          "X-Auth-Token": apiToken,
        },
        cache: "no-store",
      }
    );

    if (!fdRes.ok) {
      const text = await fdRes.text();

      return new Response(
        JSON.stringify({
          ok: false,
          error: `football-data fixtures fetch failed: ${fdRes.status}`,
          details: text,
          league_code: leagueCode,
          season,
        }),
        { status: 500 }
      );
    }

    const payload = await fdRes.json();
    const matches = (payload?.matches || []) as FootballDataMatch[];

    if (!matches.length) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `No fixtures returned for ${leagueCode} ${season}`,
          league_code: leagueCode,
          season,
        }),
        { status: 400 }
      );
    }

    const rows = matches
      .map((match) => {
        const homeProviderId = match.homeTeam?.id;
        const awayProviderId = match.awayTeam?.id;

        if (!homeProviderId || !awayProviderId) return null;

        const homeTeamId = teamIdMap.get(homeProviderId);
        const awayTeamId = teamIdMap.get(awayProviderId);

        if (!homeTeamId || !awayTeamId) return null;

        return {
          provider_match_id: match.id,
          home_team_id: homeTeamId,
          away_team_id: awayTeamId,
          competition_code: leagueCode,
          league_code: leagueCode,
          season,
          utc_date: match.utcDate || null,
          status: match.status || null,
          matchday: match.matchday || null,
          home_score: match.score?.fullTime?.home ?? null,
          away_score: match.score?.fullTime?.away ?? null,
          winner: match.score?.winner || null,
        };
      })
      .filter(Boolean);

    const { error } = await supabase.from("fixtures").upsert(rows, {
      onConflict: "provider_match_id",
    });

    if (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: error.message,
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
