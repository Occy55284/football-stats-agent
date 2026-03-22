import { createClient } from "@supabase/supabase-js";

type TeamRow = {
  id: string;
  provider_team_id: number | null;
};

type StandingApiRow = {
  position: number;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  team?: {
    id?: number | null;
  };
};

type StandingsResponse = {
  competition?: { code?: string | null };
  season?: { startDate?: string | null };
  standings?: Array<{
    table?: StandingApiRow[];
  }>;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(url, serviceRoleKey);
}

function getSeasonYear(startDate?: string | null) {
  if (!startDate) return 2025;
  const year = new Date(startDate).getUTCFullYear();
  return Number.isFinite(year) ? year : 2025;
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const apiKey = process.env.FOOTBALL_DATA_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing FOOTBALL_DATA_API_KEY" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id, provider_team_id");

    if (teamsError) {
      return new Response(
        JSON.stringify({ ok: false, error: teamsError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const teamMap = new Map<number, string>();
    for (const team of (teams || []) as TeamRow[]) {
      if (team.provider_team_id != null) {
        teamMap.set(team.provider_team_id, team.id);
      }
    }

    const res = await fetch(
      "https://api.football-data.org/v4/competitions/PL/standings",
      {
        headers: {
          "X-Auth-Token": apiKey,
        },
        cache: "no-store",
      }
    );

    const rawText = await res.text();
    let data: StandingsResponse;

    try {
      data = JSON.parse(rawText);
    } catch {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Invalid JSON returned by football-data API",
          raw: rawText,
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!res.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "football-data API request failed",
          status: res.status,
          details: data,
        }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }

    const leagueCode = data.competition?.code || "PL";
    const season = getSeasonYear(data.season?.startDate);
    const table = data.standings?.[0]?.table || [];

    let saved = 0;
    let skipped = 0;

    for (const row of table) {
      const providerTeamId = row.team?.id;
      if (!providerTeamId) {
        skipped += 1;
        continue;
      }

      const teamId = teamMap.get(providerTeamId);
      if (!teamId) {
        skipped += 1;
        continue;
      }

      const { error: upsertError } = await supabase.from("standings").upsert(
        {
          team_id: teamId,
          league_code: leagueCode,
          season,
          position: row.position,
          played_games: row.playedGames,
          won: row.won,
          draw: row.draw,
          lost: row.lost,
          points: row.points,
          goals_for: row.goalsFor,
          goals_against: row.goalsAgainst,
          goal_difference: row.goalDifference,
        },
        {
          onConflict: "team_id,league_code,season",
        }
      );

      if (upsertError) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: upsertError.message,
            failed_team_id: providerTeamId,
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      saved += 1;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        league_code: leagueCode,
        season,
        saved,
        skipped,
        count: table.length,
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
