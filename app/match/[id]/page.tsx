import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

type TeamRow = {
  id: string;
  name: string | null;
  crest: string | null;
};

type FixtureRow = {
  id: string;
  provider_match_id?: number | null;
  league_code?: string | null;
  season?: number | null;
  status?: string | null;
  utc_date?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_score?: number | null;
  away_score?: number | null;
};

type PredictionRow = {
  fixture_id: string;
  predicted_result?: string | null;
  confidence?: string | null;
  confidence_label?: string | null;
  confidence_score?: number | null;
  predicted_home_goals?: number | null;
  predicted_away_goals?: number | null;
  home_win_pct?: number | null;
  draw_pct?: number | null;
  away_win_pct?: number | null;
  explanation?: string | null;
};

type TeamSnapshotRow = {
  team_id: string;
  league_code?: string | null;
  season?: number | null;
  last_5_points?: number | null;
  last_5_wins?: number | null;
  last_5_draws?: number | null;
  last_5_losses?: number | null;
  clean_sheets?: number | null;
  failed_to_score?: number | null;
  btts_for?: number | null;
  over_25_for?: number | null;
  form_score?: number | null;
  attack_score?: number | null;
  defence_score?: number | null;
  overall_strength_score?: number | null;
};

const FINISHED_STATUSES = ["FINISHED", "FT", "AET", "PEN"];
const MAX_RECENT = 5;
const MAX_H2H = 5;

function formatDateTime(value?: string | null) {
  if (!value) return "TBC";
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDate(value?: string | null) {
  if (!value) return "TBC";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function resultLabel(value?: string | null) {
  if (value === "HOME") return "Home win";
  if (value === "AWAY") return "Away win";
  if (value === "DRAW") return "Draw";
  return value || "N/A";
}

function isFinishedMatch(fixture: FixtureRow) {
  return !!fixture.status && FINISHED_STATUSES.includes(fixture.status);
}

function getOutcomeForTeam(fixture: FixtureRow, teamId: string) {
  const isHome = fixture.home_team_id === teamId;
  const gf = isHome ? fixture.home_score ?? 0 : fixture.away_score ?? 0;
  const ga = isHome ? fixture.away_score ?? 0 : fixture.home_score ?? 0;

  if (gf > ga) return "W";
  if (gf < ga) return "L";
  return "D";
}

function outcomeTone(result: "W" | "D" | "L") {
  if (result === "W") {
    return { bg: "#dcfce7", text: "#166534", border: "#86efac" };
  }
  if (result === "L") {
    return { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" };
  }
  return { bg: "#fef3c7", text: "#92400e", border: "#fcd34d" };
}

function confidenceTone(value?: string | null) {
  if (value === "High") {
    return {
      bg: "#dcfce7",
      text: "#166534",
      border: "#86efac",
    };
  }
  if (value === "Low") {
    return {
      bg: "#fee2e2",
      text: "#991b1b",
      border: "#fca5a5",
    };
  }
  return {
    bg: "#fef3c7",
    text: "#92400e",
    border: "#fcd34d",
  };
}

function firstNumber(value?: number | null) {
  return Number(value || 0);
}

function getOpponentName(
  fixture: FixtureRow,
  teamId: string,
  teamMap: Record<string, TeamRow>
) {
  const opponentId =
    fixture.home_team_id === teamId ? fixture.away_team_id : fixture.home_team_id;
  if (!opponentId) return "Unknown";
  return teamMap[opponentId]?.name || "Unknown";
}

function getScorelineFromTeamView(fixture: FixtureRow, teamId: string) {
  const isHome = fixture.home_team_id === teamId;
  const gf = isHome ? fixture.home_score : fixture.away_score;
  const ga = isHome ? fixture.away_score : fixture.home_score;
  return `${gf ?? "-"} - ${ga ?? "-"}`;
}

function summariseForm(fixtures: FixtureRow[], teamId: string) {
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;

  for (const fixture of fixtures) {
    const result = getOutcomeForTeam(fixture, teamId);
    const isHome = fixture.home_team_id === teamId;
    const gf = isHome ? fixture.home_score ?? 0 : fixture.away_score ?? 0;
    const ga = isHome ? fixture.away_score ?? 0 : fixture.home_score ?? 0;

    goalsFor += gf;
    goalsAgainst += ga;

    if (result === "W") wins += 1;
    else if (result === "D") draws += 1;
    else losses += 1;
  }

  return { wins, draws, losses, goalsFor, goalsAgainst };
}

function summariseHeadToHead(
  fixtures: FixtureRow[],
  homeTeamId: string,
  awayTeamId: string
) {
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  let homeGoals = 0;
  let awayGoals = 0;
  let bttsCount = 0;

  for (const fixture of fixtures) {
    const homeGoalsInMatch = fixture.home_score ?? 0;
    const awayGoalsInMatch = fixture.away_score ?? 0;

    const homeTeamWasHome = fixture.home_team_id === homeTeamId;
    const awayTeamWasHome = fixture.home_team_id === awayTeamId;

    let actualHomeSideGoals = 0;
    let actualAwaySideGoals = 0;

    if (homeTeamWasHome) {
      actualHomeSideGoals = homeGoalsInMatch;
      actualAwaySideGoals = awayGoalsInMatch;
    } else if (awayTeamWasHome) {
      actualHomeSideGoals = awayGoalsInMatch;
      actualAwaySideGoals = homeGoalsInMatch;
    }

    homeGoals += actualHomeSideGoals;
    awayGoals += actualAwaySideGoals;

    if (actualHomeSideGoals > actualAwaySideGoals) homeWins += 1;
    else if (actualHomeSideGoals < actualAwaySideGoals) awayWins += 1;
    else draws += 1;

    if (actualHomeSideGoals > 0 && actualAwaySideGoals > 0) {
      bttsCount += 1;
    }
  }

  return {
    homeWins,
    draws,
    awayWins,
    homeGoals,
    awayGoals,
    bttsCount,
  };
}

function buildReasoningPoints({
  prediction,
  homeTeam,
  awayTeam,
  homeSnapshot,
  awaySnapshot,
  homeRecent,
  awayRecent,
  homeHomeRecent,
  awayAwayRecent,
  h2hSummary,
  h2hCount,
}: {
  prediction: PredictionRow | null;
  homeTeam?: TeamRow;
  awayTeam?: TeamRow;
  homeSnapshot: TeamSnapshotRow | null;
  awaySnapshot: TeamSnapshotRow | null;
  homeRecent: FixtureRow[];
  awayRecent: FixtureRow[];
  homeHomeRecent: FixtureRow[];
  awayAwayRecent: FixtureRow[];
  h2hSummary: {
    homeWins: number;
    draws: number;
    awayWins: number;
    homeGoals: number;
    awayGoals: number;
    bttsCount: number;
  };
  h2hCount: number;
}) {
  const points: string[] = [];
  const homeName = homeTeam?.name || "Home";
  const awayName = awayTeam?.name || "Away";

  const homeStrength = firstNumber(homeSnapshot?.overall_strength_score);
  const awayStrength = firstNumber(awaySnapshot?.overall_strength_score);
  const homeFormScore = firstNumber(homeSnapshot?.form_score);
  const awayFormScore = firstNumber(awaySnapshot?.form_score);
  const homeAttack = firstNumber(homeSnapshot?.attack_score);
  const awayAttack = firstNumber(awaySnapshot?.attack_score);
  const homeDefence = firstNumber(homeSnapshot?.defence_score);
  const awayDefence = firstNumber(awaySnapshot?.defence_score);

  const homeOverall = summariseForm(homeRecent, homeTeam?.id || "");
  const awayOverall = summariseForm(awayRecent, awayTeam?.id || "");
  const homeVenue = summariseForm(homeHomeRecent, homeTeam?.id || "");
  const awayVenue = summariseForm(awayAwayRecent, awayTeam?.id || "");

  if (prediction?.predicted_result === "HOME") {
    if (homeStrength - awayStrength >= 8) {
      points.push(
        `${homeName} have the stronger overall profile (${homeStrength.toFixed(1)} vs ${awayStrength.toFixed(1)}).`
      );
    }
    if (homeFormScore - awayFormScore >= 6) {
      points.push(
        `${homeName} come in with better recent form (${homeFormScore.toFixed(1)} vs ${awayFormScore.toFixed(1)}).`
      );
    }
    if (homeAttack - awayAttack >= 6) {
      points.push(
        `${homeName} carry the stronger attacking numbers (${homeAttack.toFixed(1)} vs ${awayAttack.toFixed(1)}).`
      );
    }
    if (homeDefence - awayDefence >= 6) {
      points.push(
        `${homeName} also rate better defensively (${homeDefence.toFixed(1)} vs ${awayDefence.toFixed(1)}).`
      );
    }
    if (homeVenue.wins > awayVenue.wins) {
      points.push(
        `${homeName} have been stronger at home lately (${homeVenue.wins}-${homeVenue.draws}-${homeVenue.losses}) than ${awayName} have been away (${awayVenue.wins}-${awayVenue.draws}-${awayVenue.losses}).`
      );
    }
    if (h2hCount > 0 && h2hSummary.homeWins > h2hSummary.awayWins) {
      points.push(
        `${homeName} hold the recent head-to-head edge (${h2hSummary.homeWins} wins vs ${h2hSummary.awayWins}).`
      );
    }
  }

  if (prediction?.predicted_result === "AWAY") {
    if (awayStrength - homeStrength >= 8) {
      points.push(
        `${awayName} have the stronger overall profile (${awayStrength.toFixed(1)} vs ${homeStrength.toFixed(1)}).`
      );
    }
    if (awayFormScore - homeFormScore >= 6) {
      points.push(
        `${awayName} come in with better recent form (${awayFormScore.toFixed(1)} vs ${homeFormScore.toFixed(1)}).`
      );
    }
    if (awayAttack - homeAttack >= 6) {
      points.push(
        `${awayName} carry the stronger attacking numbers (${awayAttack.toFixed(1)} vs ${homeAttack.toFixed(1)}).`
      );
    }
    if (awayDefence - homeDefence >= 6) {
      points.push(
        `${awayName} also rate better defensively (${awayDefence.toFixed(1)} vs ${homeDefence.toFixed(1)}).`
      );
    }
    if (awayVenue.wins > homeVenue.wins) {
      points.push(
        `${awayName} have been stronger away lately (${awayVenue.wins}-${awayVenue.draws}-${awayVenue.losses}) than ${homeName} have been at home (${homeVenue.wins}-${homeVenue.draws}-${homeVenue.losses}).`
      );
    }
    if (h2hCount > 0 && h2hSummary.awayWins > h2hSummary.homeWins) {
      points.push(
        `${awayName} hold the recent head-to-head edge (${h2hSummary.awayWins} wins vs ${h2hSummary.homeWins}).`
      );
    }
  }

  if (prediction?.predicted_result === "DRAW") {
    if (Math.abs(homeStrength - awayStrength) <= 6) {
      points.push(
        `The overall strength profiles are close (${homeStrength.toFixed(1)} vs ${awayStrength.toFixed(1)}).`
      );
    }
    if (Math.abs(homeFormScore - awayFormScore) <= 5) {
      points.push(
        `Recent form is fairly balanced (${homeFormScore.toFixed(1)} vs ${awayFormScore.toFixed(1)}).`
      );
    }
    if (Math.abs(homeOverall.goalsFor - awayOverall.goalsFor) <= 2) {
      points.push(
        `Both teams are producing similar recent scoring output (${homeOverall.goalsFor} vs ${awayOverall.goalsFor} goals across the last five).`
      );
    }
    if (h2hCount > 0 && h2hSummary.draws >= Math.max(h2hSummary.homeWins, h2hSummary.awayWins)) {
      points.push(`Recent head-to-head meetings have been tight, with ${h2hSummary.draws} draws in the sample.`);
    }
  }

  if (h2hCount > 0 && h2hSummary.bttsCount >= 3) {
    points.push(`There is a strong both-teams-to-score trend in the recent head-to-heads (${h2hSummary.bttsCount}/${h2hCount}).`);
  }

  const homeBtts = firstNumber(homeSnapshot?.btts_for);
  const awayBtts = firstNumber(awaySnapshot?.btts_for);
  if (homeBtts >= 3 && awayBtts >= 3) {
    points.push(`Both sides have shown frequent BTTS tendencies recently (${homeBtts} and ${awayBtts}).`);
  }

  const homeOver = firstNumber(homeSnapshot?.over_25_for);
  const awayOver = firstNumber(awaySnapshot?.over_25_for);
  if (homeOver >= 3 && awayOver >= 3) {
    points.push(`Recent games suggest a decent chance of goals, with both teams often landing over 2.5.`);
  }

  if (points.length === 0) {
    points.push("The model is leaning on a mix of recent form, team strength scores, and venue-specific trends.");
  }

  return points.slice(0, 5);
}

async function getFixtureById(supabase: any, id: string) {
  const { data, error } = await supabase
    .from("fixtures")
    .select(`
      id,
      provider_match_id,
      league_code,
      season,
      status,
      utc_date,
      home_team_id,
      away_team_id,
      home_score,
      away_score
    `)
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as FixtureRow;
}

async function getPredictionForFixture(supabase: any, fixtureId: string) {
  const { data } = await supabase
    .from("predictions")
    .select(`
      fixture_id,
      predicted_result,
      confidence,
      confidence_label,
      confidence_score,
      predicted_home_goals,
      predicted_away_goals,
      home_win_pct,
      draw_pct,
      away_win_pct,
      explanation
    `)
    .eq("fixture_id", fixtureId)
    .maybeSingle();

  return (data as PredictionRow | null) || null;
}

async function getTeamSnapshot(
  supabase: any,
  teamId: string,
  leagueCode?: string | null,
  season?: number | null
) {
  let query = supabase
    .from("team_stats_snapshot")
    .select(`
      team_id,
      league_code,
      season,
      last_5_points,
      last_5_wins,
      last_5_draws,
      last_5_losses,
      clean_sheets,
      failed_to_score,
      btts_for,
      over_25_for,
      form_score,
      attack_score,
      defence_score,
      overall_strength_score
    `)
    .eq("team_id", teamId);

  if (leagueCode) query = query.eq("league_code", leagueCode);
  if (season) query = query.eq("season", season);

  const { data } = await query.maybeSingle();
  return (data as TeamSnapshotRow | null) || null;
}

async function getTeamsMap(
  supabase: any,
  ids: string[]
): Promise<Record<string, TeamRow>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return {};

  const { data } = await supabase
    .from("teams")
    .select("id, name, crest")
    .in("id", uniqueIds);

  const map: Record<string, TeamRow> = {};
  for (const team of (data || []) as TeamRow[]) {
    map[team.id] = team;
  }
  return map;
}

async function getRecentTeamFixtures(
  supabase: any,
  teamId: string,
  beforeDate: string | null | undefined,
  leagueCode?: string | null,
  season?: number | null
) {
  let query = supabase
    .from("fixtures")
    .select(`
      id,
      provider_match_id,
      league_code,
      season,
      status,
      utc_date,
      home_team_id,
      away_team_id,
      home_score,
      away_score
    `)
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .in("status", FINISHED_STATUSES)
    .lt("utc_date", beforeDate || "9999-12-31T23:59:59Z")
    .order("utc_date", { ascending: false })
    .limit(MAX_RECENT);

  if (leagueCode) query = query.eq("league_code", leagueCode);
  if (season) query = query.eq("season", season);

  const { data } = await query;
  return (data || []) as FixtureRow[];
}

async function getRecentVenueFixtures(
  supabase: any,
  teamId: string,
  venue: "home" | "away",
  beforeDate: string | null | undefined,
  leagueCode?: string | null,
  season?: number | null
) {
  let query = supabase
    .from("fixtures")
    .select(`
      id,
      provider_match_id,
      league_code,
      season,
      status,
      utc_date,
      home_team_id,
      away_team_id,
      home_score,
      away_score
    `)
    .in("status", FINISHED_STATUSES)
    .lt("utc_date", beforeDate || "9999-12-31T23:59:59Z")
    .order("utc_date", { ascending: false })
    .limit(MAX_RECENT);

  query = venue === "home" ? query.eq("home_team_id", teamId) : query.eq("away_team_id", teamId);

  if (leagueCode) query = query.eq("league_code", leagueCode);
  if (season) query = query.eq("season", season);

  const { data } = await query;
  return (data || []) as FixtureRow[];
}

async function getHeadToHeadFixtures(
  supabase: any,
  homeTeamId: string,
  awayTeamId: string,
  beforeDate: string | null | undefined,
  leagueCode?: string | null,
  season?: number | null
) {
  let query = supabase
    .from("fixtures")
    .select(`
      id,
      provider_match_id,
      league_code,
      season,
      status,
      utc_date,
      home_team_id,
      away_team_id,
      home_score,
      away_score
    `)
    .or(
      `and(home_team_id.eq.${homeTeamId},away_team_id.eq.${awayTeamId}),and(home_team_id.eq.${awayTeamId},away_team_id.eq.${homeTeamId})`
    )
    .in("status", FINISHED_STATUSES)
    .lt("utc_date", beforeDate || "9999-12-31T23:59:59Z")
    .order("utc_date", { ascending: false })
    .limit(MAX_H2H);

  if (leagueCode) query = query.eq("league_code", leagueCode);
  if (season) query = query.eq("season", season);

  const { data } = await query;
  return (data || []) as FixtureRow[];
}

function TeamBadge({
  team,
  subtitle,
}: {
  team?: TeamRow;
  subtitle: string;
}) {
  return (
    <div style={{ textAlign: "center", flex: 1, minWidth: "180px" }}>
      {team?.crest ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={team.crest}
          alt={team.name || "Team crest"}
          style={{
            width: 74,
            height: 74,
            objectFit: "contain",
            background: "#ffffff",
            borderRadius: "999px",
            padding: 8,
            border: "1px solid #d1d5db",
            boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
            margin: "0 auto 14px",
          }}
        />
      ) : (
        <div
          style={{
            width: 74,
            height: 74,
            borderRadius: "999px",
            background: "#e5e7eb",
            border: "1px solid #d1d5db",
            margin: "0 auto 14px",
          }}
        />
      )}

      <div style={{ fontSize: 28, fontWeight: 800, color: "#ffffff", lineHeight: 1.1 }}>
        {team?.name || "Team"}
      </div>
      <div style={{ marginTop: 8, fontSize: 13, color: "#dbeafe" }}>{subtitle}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: "20px",
        padding: "18px",
        border: "1px solid #e5e7eb",
        boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
      }}
    >
      <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "8px" }}>{label}</div>
      <div style={{ fontSize: "28px", fontWeight: 800, marginBottom: "4px" }}>{value}</div>
      {sub ? <div style={{ fontSize: "12px", color: "#9ca3af" }}>{sub}</div> : null}
    </div>
  );
}

function MetricRow({
  label,
  homeValue,
  awayValue,
}: {
  label: string;
  homeValue?: number | null;
  awayValue?: number | null;
}) {
  const home = firstNumber(homeValue);
  const away = firstNumber(awayValue);
  const total = Math.max(home + away, 1);
  const homeWidth = `${(home / total) * 100}%`;
  const awayWidth = `${(away / total) * 100}%`;

  return (
    <div
      style={{
        background: "#f9fafb",
        borderRadius: "18px",
        padding: "16px",
        border: "1px solid #e5e7eb",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "64px 1fr 64px",
          gap: "12px",
          alignItems: "center",
          marginBottom: "10px",
        }}
      >
        <div style={{ fontSize: "15px", fontWeight: 800, color: "#1d4ed8" }}>{home}</div>
        <div style={{ textAlign: "center", fontSize: "12px", color: "#6b7280" }}>{label}</div>
        <div style={{ fontSize: "15px", fontWeight: 800, color: "#0f766e", textAlign: "right" }}>
          {away}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "10px",
          alignItems: "center",
        }}
      >
        <div style={{ height: 10, background: "#dbeafe", borderRadius: 999, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: homeWidth,
              background: "#2563eb",
              marginLeft: "auto",
            }}
          />
        </div>

        <div style={{ height: 10, background: "#ccfbf1", borderRadius: 999, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: awayWidth,
              background: "#0f766e",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function SplitFormCard({
  title,
  teamName,
  fixtures,
  teamId,
  accent,
}: {
  title: string;
  teamName: string;
  fixtures: FixtureRow[];
  teamId: string;
  accent: "blue" | "teal";
}) {
  const summary = summariseForm(fixtures, teamId);
  const accentBg = accent === "blue" ? "#dbeafe" : "#ccfbf1";
  const accentText = accent === "blue" ? "#1d4ed8" : "#0f766e";

  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: "20px",
        padding: "18px",
        border: "1px solid #e5e7eb",
        boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
      }}
    >
      <div
        style={{
          display: "inline-block",
          borderRadius: "999px",
          padding: "6px 10px",
          background: accentBg,
          color: accentText,
          fontSize: "12px",
          fontWeight: 800,
          marginBottom: "10px",
        }}
      >
        {title}
      </div>

      <div style={{ fontSize: "18px", fontWeight: 800, marginBottom: "12px" }}>{teamName}</div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "12px",
        }}
      >
        <div
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: "16px",
            padding: "12px",
          }}
        >
          <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>W-D-L</div>
          <div style={{ fontSize: "22px", fontWeight: 800 }}>
            {summary.wins}-{summary.draws}-{summary.losses}
          </div>
        </div>

        <div
          style={{
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: "16px",
            padding: "12px",
          }}
        >
          <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>GF-GA</div>
          <div style={{ fontSize: "22px", fontWeight: 800 }}>
            {summary.goalsFor}-{summary.goalsAgainst}
          </div>
        </div>
      </div>

      <div style={{ marginTop: "14px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {fixtures.length === 0 ? (
          <span style={{ fontSize: "13px", color: "#6b7280" }}>No completed matches found.</span>
        ) : (
          fixtures.map((fixture) => {
            const result = getOutcomeForTeam(fixture, teamId);
            const tone = outcomeTone(result);

            return (
              <div
                key={fixture.id}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "999px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: tone.bg,
                  color: tone.text,
                  border: `1px solid ${tone.border}`,
                  fontSize: "12px",
                  fontWeight: 800,
                }}
              >
                {result}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function FixtureList({
  title,
  fixtures,
  teamId,
  teamMap,
}: {
  title: string;
  fixtures: FixtureRow[];
  teamId: string;
  teamMap: Record<string, TeamRow>;
}) {
  return (
    <div
      style={{
        background: "#ffffff",
        borderRadius: "24px",
        padding: "22px",
        border: "1px solid #e5e7eb",
        boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: "6px", fontSize: "24px" }}>{title}</h2>
      <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "18px" }}>
        Last {fixtures.length} completed matches
      </div>

      <div style={{ display: "grid", gap: "14px" }}>
        {fixtures.length === 0 ? (
          <div
            style={{
              border: "1px dashed #d1d5db",
              borderRadius: "18px",
              padding: "18px",
              background: "#f9fafb",
              color: "#6b7280",
              fontSize: "14px",
            }}
          >
            No recent completed matches found.
          </div>
        ) : (
          fixtures.map((fixture) => {
            const result = getOutcomeForTeam(fixture, teamId);
            const opponent = getOpponentName(fixture, teamId, teamMap);
            const score = getScorelineFromTeamView(fixture, teamId);
            const tone = outcomeTone(result);
            const isHome = fixture.home_team_id === teamId;

            return (
              <div
                key={fixture.id}
                style={{
                  padding: "16px",
                  borderRadius: "18px",
                  background: "#f9fafb",
                  border: "1px solid #e5e7eb",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "17px", fontWeight: 800, marginBottom: "5px" }}>
                      {isHome ? "vs" : "at"} {opponent}
                    </div>
                    <div style={{ fontSize: "13px", color: "#6b7280" }}>
                      {formatDate(fixture.utc_date)} • {isHome ? "Home" : "Away"}
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ fontSize: "18px", fontWeight: 800 }}>{score}</div>
                    <div
                      style={{
                        minWidth: 36,
                        height: 36,
                        borderRadius: 999,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: tone.bg,
                        color: tone.text,
                        border: `1px solid ${tone.border}`,
                        fontSize: "12px",
                        fontWeight: 800,
                      }}
                    >
                      {result}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default async function MatchDetailsPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const fixture = await getFixtureById(supabase, id);
  if (!fixture) notFound();

  const homeTeamId = fixture.home_team_id;
  const awayTeamId = fixture.away_team_id;

  if (!homeTeamId || !awayTeamId) notFound();

  const [
    prediction,
    homeRecent,
    awayRecent,
    homeHomeRecent,
    awayAwayRecent,
    h2h,
    initialTeamMap,
    homeSnapshot,
    awaySnapshot,
  ] = await Promise.all([
    getPredictionForFixture(supabase, fixture.id),
    getRecentTeamFixtures(
      supabase,
      homeTeamId,
      fixture.utc_date,
      fixture.league_code,
      fixture.season
    ),
    getRecentTeamFixtures(
      supabase,
      awayTeamId,
      fixture.utc_date,
      fixture.league_code,
      fixture.season
    ),
    getRecentVenueFixtures(
      supabase,
      homeTeamId,
      "home",
      fixture.utc_date,
      fixture.league_code,
      fixture.season
    ),
    getRecentVenueFixtures(
      supabase,
      awayTeamId,
      "away",
      fixture.utc_date,
      fixture.league_code,
      fixture.season
    ),
    getHeadToHeadFixtures(
      supabase,
      homeTeamId,
      awayTeamId,
      fixture.utc_date,
      fixture.league_code,
      fixture.season
    ),
    getTeamsMap(supabase, [homeTeamId, awayTeamId]),
    getTeamSnapshot(supabase, homeTeamId, fixture.league_code, fixture.season),
    getTeamSnapshot(supabase, awayTeamId, fixture.league_code, fixture.season),
  ]);

  const extraTeamIds = [
    ...homeRecent.flatMap((f) => [f.home_team_id || "", f.away_team_id || ""]),
    ...awayRecent.flatMap((f) => [f.home_team_id || "", f.away_team_id || ""]),
    ...homeHomeRecent.flatMap((f) => [f.home_team_id || "", f.away_team_id || ""]),
    ...awayAwayRecent.flatMap((f) => [f.home_team_id || "", f.away_team_id || ""]),
    ...h2h.flatMap((f) => [f.home_team_id || "", f.away_team_id || ""]),
  ].filter(Boolean);

  const extraTeamMap = await getTeamsMap(supabase, extraTeamIds);
  const teamMap = { ...initialTeamMap, ...extraTeamMap };

  const homeTeam = teamMap[homeTeamId];
  const awayTeam = teamMap[awayTeamId];
  const h2hSummary = summariseHeadToHead(h2h, homeTeamId, awayTeamId);
  const homeForm = summariseForm(homeRecent, homeTeamId);
  const awayForm = summariseForm(awayRecent, awayTeamId);
  const confidence = prediction?.confidence_label || prediction?.confidence || "Medium";
  const tone = confidenceTone(confidence);

  const reasoningPoints = buildReasoningPoints({
    prediction,
    homeTeam,
    awayTeam,
    homeSnapshot,
    awaySnapshot,
    homeRecent,
    awayRecent,
    homeHomeRecent,
    awayAwayRecent,
    h2hSummary,
    h2hCount: h2h.length,
  });

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f5f7fb",
        padding: "32px 20px 56px",
        fontFamily: "Arial, sans-serif",
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: "1260px", margin: "0 auto" }}>
        <div style={{ marginBottom: "18px" }}>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
              color: "#1f2937",
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: "999px",
              padding: "10px 16px",
              fontSize: "14px",
              fontWeight: 700,
              boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
            }}
          >
            ← Back to predictions
          </Link>
        </div>

        <section
          style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #2563eb 100%)",
            color: "#ffffff",
            borderRadius: "28px",
            padding: "30px",
            boxShadow: "0 18px 40px rgba(15,23,42,0.18)",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "24px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <TeamBadge team={homeTeam} subtitle="Home side" />

            <div style={{ textAlign: "center", minWidth: "280px", flex: "0 1 320px" }}>
              <div
                style={{
                  display: "inline-block",
                  padding: "6px 10px",
                  borderRadius: "999px",
                  background: "rgba(255,255,255,0.14)",
                  fontSize: "12px",
                  letterSpacing: "0.3px",
                  marginBottom: "12px",
                }}
              >
                {fixture.league_code || "League"}
                {fixture.season ? ` • ${fixture.season}` : ""}
              </div>

              <div style={{ fontSize: "15px", color: "#dbeafe", marginBottom: "10px" }}>
                {formatDateTime(fixture.utc_date)}
              </div>

              <div style={{ fontSize: "18px", color: "#bfdbfe", marginBottom: "12px" }}>
                Match Centre
              </div>

              {isFinishedMatch(fixture) ? (
                <div
                  style={{
                    fontSize: "56px",
                    fontWeight: 900,
                    lineHeight: 1,
                    marginBottom: "10px",
                  }}
                >
                  {fixture.home_score ?? "-"} - {fixture.away_score ?? "-"}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: "44px",
                    fontWeight: 900,
                    lineHeight: 1,
                    marginBottom: "10px",
                  }}
                >
                  vs
                </div>
              )}

              <div
                style={{
                  display: "inline-block",
                  background: tone.bg,
                  color: tone.text,
                  border: `1px solid ${tone.border}`,
                  borderRadius: "999px",
                  padding: "8px 12px",
                  fontSize: "12px",
                  fontWeight: 800,
                  marginBottom: "14px",
                }}
              >
                {prediction
                  ? `${confidence} confidence`
                  : isFinishedMatch(fixture)
                    ? "Final result"
                    : "Upcoming fixture"}
              </div>

              {prediction ? (
                <div
                  style={{
                    background: "rgba(255,255,255,0.1)",
                    border: "1px solid rgba(255,255,255,0.16)",
                    borderRadius: "20px",
                    padding: "16px",
                    marginTop: "8px",
                  }}
                >
                  <div style={{ fontSize: "12px", color: "#bfdbfe", marginBottom: "6px" }}>
                    Model prediction
                  </div>
                  <div style={{ fontSize: "26px", fontWeight: 800, marginBottom: "6px" }}>
                    {resultLabel(prediction.predicted_result)}
                  </div>
                  <div style={{ fontSize: "13px", color: "#dbeafe" }}>
                    Predicted score: {prediction.predicted_home_goals ?? "-"} -{" "}
                    {prediction.predicted_away_goals ?? "-"}
                  </div>
                </div>
              ) : null}
            </div>

            <TeamBadge team={awayTeam} subtitle="Away side" />
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px",
            marginBottom: "28px",
          }}
        >
          <StatCard
            label={`${homeTeam?.name || "Home"} form`}
            value={`${homeForm.wins}-${homeForm.draws}-${homeForm.losses}`}
            sub="Last 5 completed matches"
          />
          <StatCard
            label={`${awayTeam?.name || "Away"} form`}
            value={`${awayForm.wins}-${awayForm.draws}-${awayForm.losses}`}
            sub="Last 5 completed matches"
          />
          <StatCard
            label="Head-to-head record"
            value={`${h2hSummary.homeWins}-${h2hSummary.draws}-${h2hSummary.awayWins}`}
            sub="Home wins • draws • away wins"
          />
          <StatCard
            label="BTTS in H2H"
            value={`${h2hSummary.bttsCount}/${h2h.length}`}
            sub="Both teams scored"
          />
          <StatCard
            label="Prediction loaded"
            value={prediction ? "Yes" : "No"}
            sub="Current match prediction"
          />
        </section>

        <section
          style={{
            background: "#ffffff",
            borderRadius: "24px",
            padding: "22px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
            marginBottom: "28px",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "6px", fontSize: "24px" }}>
            Home / Away Split Form
          </h2>
          <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "18px" }}>
            Quick view of overall form versus venue-specific form before this fixture
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
              gap: "16px",
            }}
          >
            <SplitFormCard
              title="Home overall"
              teamName={homeTeam?.name || "Home"}
              fixtures={homeRecent}
              teamId={homeTeamId}
              accent="blue"
            />
            <SplitFormCard
              title="Home at home"
              teamName={homeTeam?.name || "Home"}
              fixtures={homeHomeRecent}
              teamId={homeTeamId}
              accent="blue"
            />
            <SplitFormCard
              title="Away overall"
              teamName={awayTeam?.name || "Away"}
              fixtures={awayRecent}
              teamId={awayTeamId}
              accent="teal"
            />
            <SplitFormCard
              title="Away away"
              teamName={awayTeam?.name || "Away"}
              fixtures={awayAwayRecent}
              teamId={awayTeamId}
              accent="teal"
            />
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1.35fr 0.9fr",
            gap: "24px",
            alignItems: "start",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "24px",
              padding: "22px",
              border: "1px solid #e5e7eb",
              boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: "18px", fontSize: "24px" }}>
              Team Comparison
            </h2>

            <div style={{ display: "grid", gap: "14px" }}>
              <MetricRow
                label="Overall strength"
                homeValue={homeSnapshot?.overall_strength_score}
                awayValue={awaySnapshot?.overall_strength_score}
              />
              <MetricRow
                label="Form score"
                homeValue={homeSnapshot?.form_score}
                awayValue={awaySnapshot?.form_score}
              />
              <MetricRow
                label="Attack score"
                homeValue={homeSnapshot?.attack_score}
                awayValue={awaySnapshot?.attack_score}
              />
              <MetricRow
                label="Defence score"
                homeValue={homeSnapshot?.defence_score}
                awayValue={awaySnapshot?.defence_score}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "14px",
                marginTop: "18px",
              }}
            >
              <StatCard
                label={`${homeTeam?.name || "Home"} last 5 pts`}
                value={homeSnapshot?.last_5_points ?? 0}
              />
              <StatCard
                label={`${awayTeam?.name || "Away"} last 5 pts`}
                value={awaySnapshot?.last_5_points ?? 0}
              />
              <StatCard
                label={`${homeTeam?.name || "Home"} clean sheets`}
                value={homeSnapshot?.clean_sheets ?? 0}
              />
              <StatCard
                label={`${awayTeam?.name || "Away"} clean sheets`}
                value={awaySnapshot?.clean_sheets ?? 0}
              />
            </div>
          </div>

          <div style={{ display: "grid", gap: "24px" }}>
            <div
              style={{
                background: "#ffffff",
                borderRadius: "24px",
                padding: "22px",
                border: "1px solid #e5e7eb",
                boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: "18px", fontSize: "24px" }}>
                Prediction Insight
              </h2>

              {!prediction ? (
                <div
                  style={{
                    border: "1px dashed #d1d5db",
                    borderRadius: "18px",
                    padding: "18px",
                    background: "#f9fafb",
                    color: "#6b7280",
                    fontSize: "14px",
                  }}
                >
                  No prediction found for this match yet.
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: "14px",
                      marginBottom: "18px",
                    }}
                  >
                    <StatCard label="Outcome" value={resultLabel(prediction.predicted_result)} />
                    <StatCard label="Confidence" value={confidence} />
                    <StatCard
                      label="Predicted score"
                      value={`${prediction.predicted_home_goals ?? "-"} - ${prediction.predicted_away_goals ?? "-"}`}
                    />
                  </div>

                  <div
                    style={{
                      background: "#f9fafb",
                      borderRadius: "18px",
                      padding: "16px",
                      border: "1px solid #e5e7eb",
                      marginBottom: "18px",
                    }}
                  >
                    {[
                      {
                        label: `${homeTeam?.name || "Home"} win`,
                        value: prediction.home_win_pct,
                        color: "#2563eb",
                        bg: "#dbeafe",
                      },
                      {
                        label: "Draw",
                        value: prediction.draw_pct,
                        color: "#d97706",
                        bg: "#fef3c7",
                      },
                      {
                        label: `${awayTeam?.name || "Away"} win`,
                        value: prediction.away_win_pct,
                        color: "#0f766e",
                        bg: "#ccfbf1",
                      },
                    ].map((item) => (
                      <div key={item.label} style={{ marginBottom: "14px" }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "12px",
                            fontSize: "13px",
                            marginBottom: "6px",
                          }}
                        >
                          <span style={{ color: "#374151" }}>{item.label}</span>
                          <strong>{Number(item.value || 0).toFixed(1)}%</strong>
                        </div>
                        <div
                          style={{
                            height: 10,
                            background: item.bg,
                            borderRadius: 999,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              width: `${Math.max(0, Math.min(100, Number(item.value || 0)))}%`,
                              background: item.color,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {prediction.explanation ? (
                    <div
                      style={{
                        background: "#eff6ff",
                        border: "1px solid #bfdbfe",
                        borderRadius: "18px",
                        padding: "16px",
                        color: "#1e3a8a",
                        fontSize: "14px",
                        lineHeight: 1.6,
                      }}
                    >
                      <strong>Model note:</strong> {prediction.explanation}
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <div
              style={{
                background: "#ffffff",
                borderRadius: "24px",
                padding: "22px",
                border: "1px solid #e5e7eb",
                boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: "6px", fontSize: "24px" }}>
                Why this prediction
              </h2>
              <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "18px" }}>
                Rule-based explanation using team strength, recent form, venue splits, and head-to-head trends
              </div>

              <div style={{ display: "grid", gap: "12px" }}>
                {reasoningPoints.map((point, index) => (
                  <div
                    key={`${index}-${point}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "32px 1fr",
                      gap: "12px",
                      alignItems: "start",
                      background: "#f9fafb",
                      border: "1px solid #e5e7eb",
                      borderRadius: "18px",
                      padding: "14px",
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "999px",
                        background: "#dbeafe",
                        color: "#1d4ed8",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: "13px",
                      }}
                    >
                      {index + 1}
                    </div>
                    <div style={{ fontSize: "14px", lineHeight: 1.6, color: "#1f2937" }}>{point}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "24px",
            alignItems: "start",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "24px",
              padding: "22px",
              border: "1px solid #e5e7eb",
              boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: "18px", fontSize: "24px" }}>
              Head-to-Head
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: "14px",
                marginBottom: "18px",
              }}
            >
              <StatCard
                label={`${homeTeam?.name || "Home"} wins`}
                value={h2hSummary.homeWins}
              />
              <StatCard label="Draws" value={h2hSummary.draws} />
              <StatCard
                label={`${awayTeam?.name || "Away"} wins`}
                value={h2hSummary.awayWins}
              />
              <StatCard
                label={`${homeTeam?.name || "Home"} goals`}
                value={h2hSummary.homeGoals}
              />
              <StatCard
                label={`${awayTeam?.name || "Away"} goals`}
                value={h2hSummary.awayGoals}
              />
              <StatCard label="BTTS" value={`${h2hSummary.bttsCount}/${h2h.length}`} />
            </div>

            <div style={{ display: "grid", gap: "14px" }}>
              {h2h.length === 0 ? (
                <div
                  style={{
                    border: "1px dashed #d1d5db",
                    borderRadius: "18px",
                    padding: "18px",
                    background: "#f9fafb",
                    color: "#6b7280",
                    fontSize: "14px",
                  }}
                >
                  No completed head-to-head matches found.
                </div>
              ) : (
                h2h.map((game) => (
                  <div
                    key={game.id}
                    style={{
                      padding: "16px",
                      borderRadius: "18px",
                      background: "#f9fafb",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "17px", fontWeight: 800, marginBottom: "5px" }}>
                          {teamMap[game.home_team_id || ""]?.name || "Home"} v{" "}
                          {teamMap[game.away_team_id || ""]?.name || "Away"}
                        </div>
                        <div style={{ fontSize: "13px", color: "#6b7280" }}>
                          {formatDate(game.utc_date)}
                        </div>
                      </div>

                      <div
                        style={{
                          fontSize: "18px",
                          fontWeight: 800,
                          background: "#ffffff",
                          border: "1px solid #e5e7eb",
                          borderRadius: "14px",
                          padding: "10px 14px",
                        }}
                      >
                        {game.home_score ?? "-"} - {game.away_score ?? "-"}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={{ display: "grid", gap: "24px" }}>
            <FixtureList
              title={`${homeTeam?.name || "Home team"} Last 5`}
              fixtures={homeRecent}
              teamId={homeTeamId}
              teamMap={teamMap}
            />

            <FixtureList
              title={`${awayTeam?.name || "Away team"} Last 5`}
              fixtures={awayRecent}
              teamId={awayTeamId}
              teamMap={teamMap}
            />
          </div>
        </section>
      </div>
    </main>
  );
}
