import { createClient } from "@supabase/supabase-js";

type FixtureRow = {
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
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

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: fixtures, error } = await supabase
    .from("fixtures")
    .select("home_team_id, away_team_id, home_score, away_score, status")
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
      match.home_score === null ||
      match.away_score === null
    ) {
      continue;
    }

    if (!formMap.has(match.home_team_id)) {
      formMap.set(match.home_team_id, {
        team_id: match.home_team_id,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goals_for: 0,
        goals_against: 0,
        points: 0,
      });
    }

    if (!formMap.has(match.away_team_id)) {
      formMap.set(match.away_team_id, {
        team_id: match.away_team_id,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goals_for: 0,
        goals_against: 0,
        points: 0,
      });
    }

    const home = formMap.get(match.home_team_id)!;
    const away = formMap.get(match.away_team_id)!;

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

  for (const row of formMap.values()) {
    await supabase.from("team_form").upsert(row, {
      onConflict: "team_id",
    });
  }

  return new Response(
    JSON.stringify({ ok: true, count: formMap.size }),
    { headers: { "Content-Type": "application/json" } }
  );
}
