import { createClient } from "@supabase/supabase-js";

type TeamRow = {
  id: string;
  provider_team_id: number | null;
};

type FootballDataMatch = {
  id: number;
  utcDate: string;
  status: string;
  matchday: number | null;
  homeTeam?: { id?: number | null };
  awayTeam?: { id?: number | null };
  competition?: { code?: string | null };
  season?: { startDate?: string | null };
  score?: {
    winner?: string | null;
    fullTime?: {
      home?: number | null;
      away?: number | null;
    };
  };
};

type FootballDataResponse = {
  competition?: { code?: string | null };
  season?: { startDate?: string | null };
  matches?: FootballDataMatch[];
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
      "https://api.football-data.org/v4/competitions/PL/matches",
      {
        headers: {
          "X-Auth-Token": apiKey,
        },
        cache: "no-store",
      }
    );

    const rawText = await res.text();
    let data: FootballDataResponse;

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

    const matches = data.matches || [];
    const leagueCode = data.competition?.code || "PL";
    const season = getSeasonYear(data.season?.startDate);

    let saved = 0;
    let skipped = 0;

    for (const match of matches) {
      const homeTeamId = match.homeTeam?.id
        ? teamMap.get(match.homeTeam.id) || null
        : null;
      const awayTeamId = match.awayTeam?.id
        ? teamMap.get(match.awayTeam.id) || null
        : null;

      if (!homeTeamId || !awayTeamId) {
        skipped += 1;
        continue;
      }

      const row = {
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        competition_code: match.competition?.code || leagueCode,
        league_code: match.competition?.code || leagueCode,
        season: getSeasonYear(match.season?.startDate) || season,
        provider_match_id: match.id,
        utc_date: match.utcDate,
        status: match.status,
        matchday: match.matchday,
        home_score: match.score?.fullTime?.home ?? null,
        away_score: match.score?.fullTime?.away ?? null,
        winner: match.score?.winner ?? null,
      };

      const { error: upsertError } = await supabase
        .from("fixtures")
        .upsert(row, { onConflict: "provider_match_id" });

      if (upsertError) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: upsertError.message,
            failed_match_id: match.id,
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
        count: matches.length,
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
