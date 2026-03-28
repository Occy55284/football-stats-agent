import { createClient } from "@supabase/supabase-js";

const DEFAULT_SEASON = 2025;
const DEFAULT_COMPETITION = "PL";
const ALLOWED_COMPETITIONS = ["PL", "ELC"] as const;

type FootballDataStandingTeam = {
  id: number;
};

type FootballDataStandingRow = {
  position?: number | null;
  playedGames?: number | null;
  won?: number | null;
  draw?: number | null;
  lost?: number | null;
  points?: number | null;
  goalsFor?: number | null;
  goalsAgainst?: number | null;
  goalDifference?: number | null;
  team?: FootballDataStandingTeam | null;
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
      `https://api.football-data.org/v4/competitions/${leagueCode}/standings?season=${season}`,
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
          error: `football-data standings fetch failed: ${fdRes.status}`,
          details: text,
          league_code: leagueCode,
          season,
        }),
        { status: 500 }
      );
    }

    const payload = await fdRes.json();
    const standingsBlocks = payload?.standings || [];

    const totalTable =
      standingsBlocks.find((block: { type?: string }) => block.type === "TOTAL") ||
      standingsBlocks[0];

    const table = (totalTable?.table || []) as FootballDataStandingRow[];

    if (!table.length) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `No standings rows returned for ${leagueCode} ${season}`,
          league_code: leagueCode,
          season,
        }),
        { status: 400 }
      );
    }

    const rows = table
      .map((entry) => {
        const providerTeamId = entry.team?.id;
        if (!providerTeamId) return null;

        const teamId = teamIdMap.get(providerTeamId);
        if (!teamId) return null;

        return {
          team_id: teamId,
          position: entry.position ?? null,
          played_games: entry.playedGames ?? 0,
          won: entry.won ?? 0,
          draw: entry.draw ?? 0,
          lost: entry.lost ?? 0,
          points: entry.points ?? 0,
          goals_for: entry.goalsFor ?? 0,
          goals_against: entry.goalsAgainst ?? 0,
          goal_difference: entry.goalDifference ?? 0,
          league_code: leagueCode,
          season,
        };
      })
      .filter(Boolean);

    const { error: deleteError } = await supabase
      .from("standings")
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

    const { error: insertError } = await supabase.from("standings").insert(rows);

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
