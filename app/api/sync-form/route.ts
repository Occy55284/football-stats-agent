import { createClient } from "@supabase/supabase-js";

type FixtureRow = {
  league_code: string | null;
  season: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
};

type FormRow = {
  team_id: string;
  league_code: string;
  season: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  points: number;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(url, serviceRoleKey);
}

function getFormKey(teamId: string, leagueCode: string, season: number) {
  return `${teamId}::${leagueCode}::${season}`;
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data: fixtures, error } = await supabase
      .from("fixtures")
      .select(
        "league_code, season, home_team_id, away_team_id, home_score, away_score, status"
      )
      .eq("league_code", "PL")
      .eq("season", 2025)
      .in("status", ["FINISHED"]);

    if (error) {
      return new Response(
        JSON.stringify({ ok: false, error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const formMap = new Map<string, FormRow>();

    for (const match of (fixtures || []) as FixtureRow[]) {
      if (
        !match.home_team_id ||
        !match.away_team_id ||
        !match.league_code ||
        match.season == null ||
        match.home_score === null ||
        match.away_score === null
      ) {
        continue;
      }

      const leagueCode = match.league_code;
      const season = match.season;

      const homeKey = getFormKey(match.home_team_id, leagueCode, season);
      const awayKey = getFormKey(match.away_team_id, leagueCode, season);

      if (!formMap.has(homeKey)) {
        formMap.set(homeKey, {
          team_id: match.home_team_id,
          league_code: leagueCode,
          season,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goals_for: 0,
          goals_against: 0,
          points: 0,
        });
      }

      if (!formMap.has(awayKey)) {
        formMap.set(awayKey, {
          team_id: match.away_team_id,
          league_code: leagueCode,
          season,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goals_for: 0,
          goals_against: 0,
          points: 0,
        });
      }

      const home = formMap.get(homeKey)!;
      const away = formMap.get(awayKey)!;

      home.played += 1;
      away.played += 1;

      home.goals_for += match.home_score;
      home.goals_against += match.away_score;

      away.goals_for += match.away_score;
      away.goals_against += match.home_score;

      if (match.home_score > match.away_score) {
        home.won += 1;
        home.points += 3;
        away.lost += 1;
      } else if (match.home_score < match.away_score) {
        away.won += 1;
        away.points += 3;
        home.lost += 1;
      } else {
        home.drawn += 1;
        away.drawn += 1;
        home.points += 1;
        away.points += 1;
      }
    }

    let saved = 0;

    for (const row of formMap.values()) {
      const { error: upsertError } = await supabase.from("team_form").upsert(
        row,
        {
          onConflict: "team_id,league_code,season",
        }
      );

      if (upsertError) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: upsertError.message,
            failed_row: row,
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      saved += 1;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        saved,
        count: formMap.size,
        league_code: "PL",
        season: 2025,
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
