import { createClient } from "@supabase/supabase-js";

type TeamRow = {
  id: string;
};

type FixtureRow = {
  id: string;
  league_code: string | null;
  season: number | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number | null;
  away_score: number | null;
  status: string | null;
  utc_date: string | null;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(url, serviceRoleKey);
}

function safeDiv(a: number, b: number) {
  if (!b) return 0;
  return a / b;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const leagueCode = "PL";
    const season = 2025;

    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("id");

    if (teamsError) {
      return new Response(
        JSON.stringify({ ok: false, error: teamsError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: fixtures, error: fixturesError } = await supabase
      .from("fixtures")
      .select(
        "id, league_code, season, home_team_id, away_team_id, home_score, away_score, status, utc_date"
      )
      .eq("league_code", leagueCode)
      .eq("season", season)
      .eq("status", "FINISHED")
      .order("utc_date", { ascending: true });

    if (fixturesError) {
      return new Response(
        JSON.stringify({ ok: false, error: fixturesError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const finishedFixtures = (fixtures || []) as FixtureRow[];

    const leagueRows = finishedFixtures.filter(
      (f) =>
        f.home_team_id &&
        f.away_team_id &&
        f.home_score !== null &&
        f.away_score !== null
    );

    const leagueAvgGoalsPerTeam =
      leagueRows.length > 0
        ? leagueRows.reduce(
            (sum, f) => sum + (f.home_score ?? 0) + (f.away_score ?? 0),
            0
          ) /
          (leagueRows.length * 2)
        : 1.35;

    let saved = 0;

    for (const team of (teams || []) as TeamRow[]) {
      const teamId = team.id;

      const teamFixtures = finishedFixtures.filter(
        (f) => f.home_team_id === teamId || f.away_team_id === teamId
      );

      let played = 0;
      let wins = 0;
      let draws = 0;
      let losses = 0;
      let goalsFor = 0;
      let goalsAgainst = 0;

      let homePlayed = 0;
      let homeWins = 0;
      let homeDraws = 0;
      let homeLosses = 0;
      let homeGoalsFor = 0;
      let homeGoalsAgainst = 0;

      let awayPlayed = 0;
      let awayWins = 0;
      let awayDraws = 0;
      let awayLosses = 0;
      let awayGoalsFor = 0;
      let awayGoalsAgainst = 0;

      let cleanSheets = 0;
      let failedToScore = 0;
      let bttsFor = 0;
      let over25For = 0;

      let last5Points = 0;
      let last5Wins = 0;
      let last5Draws = 0;
      let last5Losses = 0;
      let last5GoalsFor = 0;
      let last5GoalsAgainst = 0;

      for (const fixture of teamFixtures) {
        if (fixture.home_score === null || fixture.away_score === null) continue;

        const isHome = fixture.home_team_id === teamId;
        const gf = isHome ? fixture.home_score : fixture.away_score;
        const ga = isHome ? fixture.away_score : fixture.home_score;

        played += 1;
        goalsFor += gf;
        goalsAgainst += ga;

        if (isHome) {
          homePlayed += 1;
          homeGoalsFor += gf;
          homeGoalsAgainst += ga;
        } else {
          awayPlayed += 1;
          awayGoalsFor += gf;
          awayGoalsAgainst += ga;
        }

        if (ga === 0) cleanSheets += 1;
        if (gf === 0) failedToScore += 1;
        if (gf > 0 && ga > 0) bttsFor += 1;
        if (gf + ga > 2.5) over25For += 1;

        if (gf > ga) {
          wins += 1;
          if (isHome) homeWins += 1;
          else awayWins += 1;
        } else if (gf < ga) {
          losses += 1;
          if (isHome) homeLosses += 1;
          else awayLosses += 1;
        } else {
          draws += 1;
          if (isHome) homeDraws += 1;
          else awayDraws += 1;
        }
      }

      const last5Fixtures = [...teamFixtures].slice(-5);

      for (const fixture of last5Fixtures) {
        if (fixture.home_score === null || fixture.away_score === null) continue;

        const isHome = fixture.home_team_id === teamId;
        const gf = isHome ? fixture.home_score : fixture.away_score;
        const ga = isHome ? fixture.away_score : fixture.home_score;

        last5GoalsFor += gf;
        last5GoalsAgainst += ga;

        if (gf > ga) {
          last5Wins += 1;
          last5Points += 3;
        } else if (gf < ga) {
          last5Losses += 1;
        } else {
          last5Draws += 1;
          last5Points += 1;
        }
      }

      const points = wins * 3 + draws;
      const pointsPerGame = safeDiv(points, played);
      const homePointsPerGame = safeDiv(homeWins * 3 + homeDraws, homePlayed);
      const awayPointsPerGame = safeDiv(awayWins * 3 + awayDraws, awayPlayed);

      const attackPerGame = safeDiv(goalsFor, played);
      const defencePerGame = safeDiv(goalsAgainst, played);

      const formScore = round2(safeDiv(last5Points, 15) * 100);

      const attackScore = round2(
        clamp((attackPerGame / Math.max(leagueAvgGoalsPerTeam, 0.1)) * 100, 0, 200)
      );

      const defenceScore = round2(
        clamp(
          (1 - defencePerGame / Math.max(leagueAvgGoalsPerTeam * 1.5, 0.1)) * 100,
          0,
          200
        )
      );

      const overallStrengthScore = round2(
        clamp(
          formScore * 0.3 +
            attackScore * 0.25 +
            defenceScore * 0.2 +
            clamp(pointsPerGame / 3, 0, 1) * 100 * 0.25,
          0,
          100
        )
      );

      const snapshot = {
        league_code: leagueCode,
        season,
        team_id: teamId,

        played,
        wins,
        draws,
        losses,
        goals_for: goalsFor,
        goals_against: goalsAgainst,
        goal_difference: goalsFor - goalsAgainst,
        points,
        points_per_game: round2(pointsPerGame),

        last_5_points: last5Points,
        last_5_wins: last5Wins,
        last_5_draws: last5Draws,
        last_5_losses: last5Losses,
        last_5_goals_for: last5GoalsFor,
        last_5_goals_against: last5GoalsAgainst,

        home_played: homePlayed,
        home_wins: homeWins,
        home_draws: homeDraws,
        home_losses: homeLosses,
        home_goals_for: homeGoalsFor,
        home_goals_against: homeGoalsAgainst,
        home_points_per_game: round2(homePointsPerGame),

        away_played: awayPlayed,
        away_wins: awayWins,
        away_draws: awayDraws,
        away_losses: awayLosses,
        away_goals_for: awayGoalsFor,
        away_goals_against: awayGoalsAgainst,
        away_points_per_game: round2(awayPointsPerGame),

        clean_sheets: cleanSheets,
        failed_to_score: failedToScore,
        btts_for: bttsFor,
        over_25_for: over25For,

        form_score: formScore,
        attack_score: attackScore,
        defence_score: defenceScore,
        overall_strength_score: overallStrengthScore,

        updated_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase
        .from("team_stats_snapshot")
        .upsert(snapshot, {
          onConflict: "league_code,season,team_id",
        });

      if (upsertError) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: upsertError.message,
            failed_team_id: teamId,
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
        league_code: leagueCode,
        season,
        league_average_goals_per_team: round2(leagueAvgGoalsPerTeam),
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
