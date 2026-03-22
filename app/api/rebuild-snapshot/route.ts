import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const leagueCode = "PL";
    const season = 2025;

    // 1. Load data
    const { data: teams } = await supabase.from("teams").select("id");

    const { data: fixtures } = await supabase
      .from("fixtures")
      .select("*")
      .eq("league_code", leagueCode)
      .eq("season", season)
      .eq("status", "FINISHED");

    const { data: standings } = await supabase
      .from("standings")
      .select("*")
      .eq("league_code", leagueCode)
      .eq("season", season);

    const { data: form } = await supabase
      .from("team_form")
      .select("*")
      .eq("league_code", leagueCode)
      .eq("season", season);

    // Maps
    const tableMap = new Map(standings?.map((s) => [s.team_id, s]) || []);
    const formMap = new Map(form?.map((f) => [f.team_id, f]) || []);

    let saved = 0;

    for (const team of teams || []) {
      const teamId = team.id;

      const teamFixtures = (fixtures || []).filter(
        (f) =>
          f.home_team_id === teamId || f.away_team_id === teamId
      );

      let played = 0,
        wins = 0,
        draws = 0,
        losses = 0,
        gf = 0,
        ga = 0;

      let homePlayed = 0,
        homeWins = 0,
        homeDraws = 0,
        homeLosses = 0,
        homeGF = 0,
        homeGA = 0;

      let awayPlayed = 0,
        awayWins = 0,
        awayDraws = 0,
        awayLosses = 0,
        awayGF = 0,
        awayGA = 0;

      for (const f of teamFixtures) {
        if (f.home_score == null || f.away_score == null) continue;

        const isHome = f.home_team_id === teamId;
        const goalsFor = isHome ? f.home_score : f.away_score;
        const goalsAgainst = isHome ? f.away_score : f.home_score;

        played++;
        gf += goalsFor;
        ga += goalsAgainst;

        if (isHome) {
          homePlayed++;
          homeGF += goalsFor;
          homeGA += goalsAgainst;
        } else {
          awayPlayed++;
          awayGF += goalsFor;
          awayGA += goalsAgainst;
        }

        if (goalsFor > goalsAgainst) {
          wins++;
          isHome ? homeWins++ : awayWins++;
        } else if (goalsFor < goalsAgainst) {
          losses++;
          isHome ? homeLosses++ : awayLosses++;
        } else {
          draws++;
          isHome ? homeDraws++ : awayDraws++;
        }
      }

      const points = wins * 3 + draws;

      const formRow = formMap.get(teamId);

      const snapshot = {
        league_code: leagueCode,
        season,
        team_id: teamId,

        played,
        wins,
        draws,
        losses,
        goals_for: gf,
        goals_against: ga,
        goal_difference: gf - ga,
        points,
        points_per_game: played ? points / played : 0,

        last_5_points: formRow?.points ?? 0,

        home_played: homePlayed,
        home_wins: homeWins,
        home_draws: homeDraws,
        home_losses: homeLosses,
        home_goals_for: homeGF,
        home_goals_against: homeGA,
        home_points_per_game: homePlayed
          ? (homeWins * 3 + homeDraws) / homePlayed
          : 0,

        away_played: awayPlayed,
        away_wins: awayWins,
        away_draws: awayDraws,
        away_losses: awayLosses,
        away_goals_for: awayGF,
        away_goals_against: awayGA,
        away_points_per_game: awayPlayed
          ? (awayWins * 3 + awayDraws) / awayPlayed
          : 0,

        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("team_stats_snapshot")
        .upsert(snapshot, {
          onConflict: "league_code,season,team_id",
        });

      if (error) {
        return new Response(
          JSON.stringify({ ok: false, error: error.message }),
          { status: 500 }
        );
      }

      saved++;
    }

    return new Response(
      JSON.stringify({ ok: true, saved }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500 }
    );
  }
}
