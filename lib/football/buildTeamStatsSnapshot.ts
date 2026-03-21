import { createClient } from "@supabase/supabase-js";

type FixtureRow = {
  id: number;
  league_code: string;
  season: number;
  status: string;
  home_team_id: number;
  away_team_id: number;
  home_score: number | null;
  away_score: number | null;
  utc_date: string;
};

type StandingRow = {
  team_id: number;
  league_code: string;
  season: number;
  played_games: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
};

type TeamSnapshot = {
  league_code: string;
  season: number;
  team_id: number;

  played: number;
  wins: number;
  draws: number;
  losses: number;

  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  points_per_game: number;

  last_5_points: number;
  last_5_wins: number;
  last_5_draws: number;
  last_5_losses: number;
  last_5_goals_for: number;
  last_5_goals_against: number;

  home_played: number;
  home_wins: number;
  home_draws: number;
  home_losses: number;
  home_goals_for: number;
  home_goals_against: number;
  home_points_per_game: number;

  away_played: number;
  away_wins: number;
  away_draws: number;
  away_losses: number;
  away_goals_for: number;
  away_goals_against: number;
  away_points_per_game: number;

  clean_sheets: number;
  failed_to_score: number;
  btts_for: number;
  over_25_for: number;

  form_score: number;
  attack_score: number;
  defence_score: number;
  overall_strength_score: number;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase env vars");
  }

  return createClient(url, serviceRoleKey);
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

function pointsFromResult(result: "W" | "D" | "L") {
  if (result === "W") return 3;
  if (result === "D") return 1;
  return 0;
}

function calculateFormScore(results: Array<"W" | "D" | "L">) {
  const weights = [1, 2, 3, 4, 5];
  const padded = results.slice(-5);
  const start = Math.max(0, 5 - padded.length);

  let weightedPoints = 0;
  let maxPoints = 0;

  for (let i = 0; i < padded.length; i++) {
    const weight = weights[start + i];
    weightedPoints += pointsFromResult(padded[i]) * weight;
    maxPoints += 3 * weight;
  }

  if (maxPoints === 0) return 0;
  return round3(weightedPoints / maxPoints);
}

function calculateAttackScore(
  seasonGoalsForPerGame: number,
  recentGoalsForPerGame: number,
  failedToScoreRate: number
) {
  return round3(
    recentGoalsForPerGame * 0.5 +
      seasonGoalsForPerGame * 0.35 +
      (1 - failedToScoreRate) * 0.15
  );
}

function calculateDefenceScore(
  seasonGoalsAgainstPerGame: number,
  recentGoalsAgainstPerGame: number,
  cleanSheetRate: number
) {
  return round3(
    (1 / (1 + recentGoalsAgainstPerGame)) * 0.5 +
      (1 / (1 + seasonGoalsAgainstPerGame)) * 0.35 +
      cleanSheetRate * 0.15
  );
}

function calculateOverallStrength(
  pointsPerGame: number,
  formScore: number,
  attackScore: number,
  defenceScore: number
) {
  return round3(
    pointsPerGame * 0.45 +
      formScore * 0.3 +
      attackScore * 0.15 +
      defenceScore * 0.1
  );
}

export async function rebuildTeamStatsSnapshot(
  leagueCode: string,
  season: number
) {
  const supabase = getSupabaseAdmin();

  const { data: standings, error: standingsError } = await supabase
    .from("standings")
    .select(
      `
      team_id,
      league_code,
      season,
      played_games,
      won,
      draw,
      lost,
      points,
      goals_for,
      goals_against,
      goal_difference
    `
    )
    .eq("league_code", leagueCode)
    .eq("season", season);

  if (standingsError) throw standingsError;

  const { data: fixtures, error: fixturesError } = await supabase
    .from("fixtures")
    .select(
      `
      id,
      league_code,
      season,
      status,
      home_team_id,
      away_team_id,
      home_score,
      away_score,
      utc_date
    `
    )
    .eq("league_code", leagueCode)
    .eq("season", season)
    .in("status", ["FINISHED"])
    .order("utc_date", { ascending: true });

  if (fixturesError) throw fixturesError;

  const standingRows = (standings || []) as StandingRow[];
  const fixtureRows = (fixtures || []) as FixtureRow[];

  const snapshots: TeamSnapshot[] = [];

  for (const standing of standingRows) {
    const teamId = standing.team_id;

    const teamFixtures = fixtureRows.filter(
      (f) => f.home_team_id === teamId || f.away_team_id === teamId
    );

    const recentFixtures = teamFixtures.slice(-5);

    let last5Points = 0;
    let last5Wins = 0;
    let last5Draws = 0;
    let last5Losses = 0;
    let last5GoalsFor = 0;
    let last5GoalsAgainst = 0;

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

    const recentResults: Array<"W" | "D" | "L"> = [];

    for (const fixture of teamFixtures) {
      const isHome = fixture.home_team_id === teamId;
      const gf = isHome ? fixture.home_score ?? 0 : fixture.away_score ?? 0;
      const ga = isHome ? fixture.away_score ?? 0 : fixture.home_score ?? 0;

      if (isHome) {
        homePlayed += 1;
        homeGoalsFor += gf;
        homeGoalsAgainst += ga;
      } else {
        awayPlayed += 1;
        awayGoalsFor += gf;
        awayGoalsAgainst += ga;
      }

      if (gf > ga) {
        if (isHome) homeWins += 1;
        else awayWins += 1;
      } else if (gf === ga) {
        if (isHome) homeDraws += 1;
        else awayDraws += 1;
      } else {
        if (isHome) homeLosses += 1;
        else awayLosses += 1;
      }

      if (ga === 0) cleanSheets += 1;
      if (gf === 0) failedToScore += 1;
      if (gf > 0 && ga > 0) bttsFor += 1;
      if (gf + ga > 2) over25For += 1;
    }

    for (const fixture of recentFixtures) {
      const isHome = fixture.home_team_id === teamId;
      const gf = isHome ? fixture.home_score ?? 0 : fixture.away_score ?? 0;
      const ga = isHome ? fixture.away_score ?? 0 : fixture.home_score ?? 0;

      last5GoalsFor += gf;
      last5GoalsAgainst += ga;

      if (gf > ga) {
        recentResults.push("W");
        last5Wins += 1;
        last5Points += 3;
      } else if (gf === ga) {
        recentResults.push("D");
        last5Draws += 1;
        last5Points += 1;
      } else {
        recentResults.push("L");
        last5Losses += 1;
      }
    }

    const played = standing.played_games || 0;
    const pointsPerGame = played > 0 ? standing.points / played : 0;

    const homePoints = homeWins * 3 + homeDraws;
    const awayPoints = awayWins * 3 + awayDraws;

    const homePointsPerGame = homePlayed > 0 ? homePoints / homePlayed : 0;
    const awayPointsPerGame = awayPlayed > 0 ? awayPoints / awayPlayed : 0;

    const seasonGoalsForPerGame = played > 0 ? standing.goals_for / played : 0;
    const seasonGoalsAgainstPerGame =
      played > 0 ? standing.goals_against / played : 0;

    const recentPlayed = recentFixtures.length;
    const recentGoalsForPerGame =
      recentPlayed > 0 ? last5GoalsFor / recentPlayed : 0;
    const recentGoalsAgainstPerGame =
      recentPlayed > 0 ? last5GoalsAgainst / recentPlayed : 0;

    const cleanSheetRate = played > 0 ? cleanSheets / played : 0;
    const failedToScoreRate = played > 0 ? failedToScore / played : 0;

    const formScore = calculateFormScore(recentResults);
    const attackScore = calculateAttackScore(
      seasonGoalsForPerGame,
      recentGoalsForPerGame,
      failedToScoreRate
    );
    const defenceScore = calculateDefenceScore(
      seasonGoalsAgainstPerGame,
      recentGoalsAgainstPerGame,
      cleanSheetRate
    );
    const overallStrengthScore = calculateOverallStrength(
      pointsPerGame,
      formScore,
      attackScore,
      defenceScore
    );

    snapshots.push({
      league_code: leagueCode,
      season,
      team_id: teamId,

      played,
      wins: standing.won,
      draws: standing.draw,
      losses: standing.lost,

      goals_for: standing.goals_for,
      goals_against: standing.goals_against,
      goal_difference: standing.goal_difference,
      points: standing.points,
      points_per_game: round3(pointsPerGame),

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
      home_points_per_game: round3(homePointsPerGame),

      away_played: awayPlayed,
      away_wins: awayWins,
      away_draws: awayDraws,
      away_losses: awayLosses,
      away_goals_for: awayGoalsFor,
      away_goals_against: awayGoalsAgainst,
      away_points_per_game: round3(awayPointsPerGame),

      clean_sheets: cleanSheets,
      failed_to_score: failedToScore,
      btts_for: bttsFor,
      over_25_for: over25For,

      form_score: formScore,
      attack_score: attackScore,
      defence_score: defenceScore,
      overall_strength_score: overallStrengthScore,
    });
  }

  const { error: upsertError } = await supabase
    .from("team_stats_snapshot")
    .upsert(snapshots, {
      onConflict: "league_code,season,team_id",
    });

  if (upsertError) throw upsertError;

  return {
    ok: true,
    count: snapshots.length,
    leagueCode,
    season,
  };
}
