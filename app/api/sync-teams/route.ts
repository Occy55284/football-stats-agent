import { createClient } from "@supabase/supabase-js";

const DEFAULT_SEASON = 2025;
const DEFAULT_COMPETITION = "PL";
const ALLOWED_COMPETITIONS = ["PL", "ELC"] as const;

type FootballDataTeam = {
  id: number;
  name: string;
  shortName?: string | null;
  tla?: string | null;
  crest?: string | null;
  venue?: string | null;
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

    const fdRes = await fetch(
      `https://api.football-data.org/v4/competitions/${leagueCode}/teams?season=${season}`,
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
          error: `football-data teams fetch failed: ${fdRes.status}`,
          details: text,
          league_code: leagueCode,
          season,
        }),
        { status: 500 }
      );
    }

    const payload = await fdRes.json();
    const teams = (payload?.teams || []) as FootballDataTeam[];

    if (!teams.length) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `No teams returned for ${leagueCode} ${season}`,
          league_code: leagueCode,
          season,
        }),
        { status: 400 }
      );
    }

    const rows = teams.map((team) => ({
      provider_team_id: team.id,
      name: team.name,
      short_name: team.shortName || team.tla || team.name,
      tla: team.tla || null,
      crest: team.crest || null,
      venue: team.venue || null,
      league_code: leagueCode,
      season,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from("teams").upsert(rows, {
      onConflict: "provider_team_id,league_code,season",
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
