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
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value?: string | null) {
  if (!value) return "TBC";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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

function getOutcomeClasses(result: "W" | "D" | "L") {
  if (result === "W") {
    return "border-emerald-500/30 bg-emerald-500/15 text-emerald-300";
  }
  if (result === "L") {
    return "border-red-500/30 bg-red-500/15 text-red-300";
  }
  return "border-amber-500/30 bg-amber-500/15 text-amber-300";
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

function clampScore(value?: number | null) {
  return Math.max(0, Math.min(100, Number(value || 0)));
}

function compareValue(
  homeValue?: number | null,
  awayValue?: number | null
): "home" | "away" | "draw" {
  const h = Number(homeValue || 0);
  const a = Number(awayValue || 0);
  if (h > a) return "home";
  if (a > h) return "away";
  return "draw";
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

function resultLabel(value?: string | null) {
  if (value === "HOME") return "Home win";
  if (value === "AWAY") return "Away win";
  if (value === "DRAW") return "Draw";
  return value || "N/A";
}

function TeamCrest({
  team,
  size = "large",
}: {
  team?: TeamRow;
  size?: "small" | "large";
}) {
  const classes =
    size === "small"
      ? "h-10 w-10"
      : "h-16 w-16 md:h-20 md:w-20";

  if (team?.crest) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={team.crest}
        alt={team.name || "Team crest"}
        className={`${classes} rounded-full border border-zinc-700 bg-white object-contain p-1 shadow-lg`}
      />
    );
  }

  return (
    <div
      className={`${classes} rounded-full border border-zinc-700 bg-zinc-800 shadow-lg`}
    />
  );
}

function StatMiniCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4 text-center">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function PercentBar({
  label,
  value,
}: {
  label: string;
  value?: number | null;
}) {
  const safeValue = Math.max(0, Math.min(100, Number(value || 0)));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-zinc-300">{label}</span>
        <span className="font-medium text-white">{safeValue}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-2.5 rounded-full bg-cyan-400"
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}

function FormDots({
  fixtures,
  teamId,
}: {
  fixtures: FixtureRow[];
  teamId: string;
}) {
  return (
    <div className="flex items-center gap-2">
      {fixtures.map((fixture) => {
        const result = getOutcomeForTeam(fixture, teamId);
        return (
          <span
            key={fixture.id}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-bold ${getOutcomeClasses(
              result
            )}`}
          >
            {result}
          </span>
        );
      })}
    </div>
  );
}

function TeamFormSummaryCard({
  team,
  fixtures,
  teamId,
}: {
  team?: TeamRow;
  fixtures: FixtureRow[];
  teamId: string;
}) {
  const summary = summariseForm(fixtures, teamId);

  return (
    <div className="rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-5">
      <div className="flex items-center gap-4">
        <TeamCrest team={team} size="small" />
        <div className="min-w-0">
          <div className="truncate text-lg font-semibold text-white">
            {team?.name || "Team"}
          </div>
          <div className="mt-2">
            <FormDots fixtures={fixtures} teamId={teamId} />
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <StatMiniCard
          label="W-D-L"
          value={`${summary.wins}-${summary.draws}-${summary.losses}`}
        />
        <StatMiniCard
          label="GF-GA"
          value={`${summary.goalsFor}-${summary.goalsAgainst}`}
        />
      </div>
    </div>
  );
}

function ComparisonMetricRow({
  label,
  homeValue,
  awayValue,
  isPercent = true,
}: {
  label: string;
  homeValue?: number | null;
  awayValue?: number | null;
  isPercent?: boolean;
}) {
  const winner = compareValue(homeValue, awayValue);
  const homeDisplay = Number(homeValue || 0);
  const awayDisplay = Number(awayValue || 0);

  const homeWidth = isPercent ? clampScore(homeValue) : Math.min(100, homeDisplay * 10);
  const awayWidth = isPercent ? clampScore(awayValue) : Math.min(100, awayDisplay * 10);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-black/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div
          className={`text-sm font-semibold ${
            winner === "home" ? "text-emerald-300" : "text-zinc-300"
          }`}
        >
          {homeDisplay}
        </div>
        <div className="text-xs uppercase tracking-[0.18em] text-zinc-500">{label}</div>
        <div
          className={`text-sm font-semibold ${
            winner === "away" ? "text-cyan-300" : "text-zinc-300"
          }`}
        >
          {awayDisplay}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="h-2.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-2.5 rounded-full bg-emerald-400"
            style={{ width: `${homeWidth}%`, marginLeft: `${100 - homeWidth}%` }}
          />
        </div>

        <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">vs</div>

        <div className="h-2.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-2.5 rounded-full bg-cyan-400"
            style={{ width: `${awayWidth}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function TeamComparisonSection({
  homeTeam,
  awayTeam,
  homeSnapshot,
  awaySnapshot,
}: {
  homeTeam?: TeamRow;
  awayTeam?: TeamRow;
  homeSnapshot: TeamSnapshotRow | null;
  awaySnapshot: TeamSnapshotRow | null;
}) {
  const noData = !homeSnapshot && !awaySnapshot;

  return (
    <section className="rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Team comparison</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Snapshot metrics from team_stats_snapshot for this league and season
          </p>
        </div>
      </div>

      {noData ? (
        <div className="mt-5 rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/40 p-5 text-sm text-zinc-400">
          No snapshot comparison data found for this match yet.
        </div>
      ) : (
        <>
          <div className="mt-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <TeamCrest team={homeTeam} size="small" />
              <div>
                <div className="text-sm font-semibold text-white">
                  {homeTeam?.name || "Home"}
                </div>
                <div className="text-xs text-zinc-500">Home profile</div>
              </div>
            </div>

            <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">
              Side by side
            </div>

            <div className="flex items-center gap-3 text-right">
              <div>
                <div className="text-sm font-semibold text-white">
                  {awayTeam?.name || "Away"}
                </div>
                <div className="text-xs text-zinc-500">Away profile</div>
              </div>
              <TeamCrest team={awayTeam} size="small" />
            </div>
          </div>

          <div className="mt-5 grid gap-3">
            <ComparisonMetricRow
              label="Overall strength"
              homeValue={homeSnapshot?.overall_strength_score}
              awayValue={awaySnapshot?.overall_strength_score}
            />
            <ComparisonMetricRow
              label="Form score"
              homeValue={homeSnapshot?.form_score}
              awayValue={awaySnapshot?.form_score}
            />
            <ComparisonMetricRow
              label="Attack score"
              homeValue={homeSnapshot?.attack_score}
              awayValue={awaySnapshot?.attack_score}
            />
            <ComparisonMetricRow
              label="Defence score"
              homeValue={homeSnapshot?.defence_score}
              awayValue={awaySnapshot?.defence_score}
            />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatMiniCard
              label="Home last 5 pts"
              value={homeSnapshot?.last_5_points ?? 0}
            />
            <StatMiniCard
              label="Away last 5 pts"
              value={awaySnapshot?.last_5_points ?? 0}
            />
            <StatMiniCard
              label="Home last 5"
              value={`${homeSnapshot?.last_5_wins ?? 0}-${homeSnapshot?.last_5_draws ?? 0}-${homeSnapshot?.last_5_losses ?? 0}`}
            />
            <StatMiniCard
              label="Away last 5"
              value={`${awaySnapshot?.last_5_wins ?? 0}-${awaySnapshot?.last_5_draws ?? 0}-${awaySnapshot?.last_5_losses ?? 0}`}
            />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ComparisonMetricRow
              label="Clean sheets"
              homeValue={homeSnapshot?.clean_sheets}
              awayValue={awaySnapshot?.clean_sheets}
              isPercent={false}
            />
            <ComparisonMetricRow
              label="Failed to score"
              homeValue={homeSnapshot?.failed_to_score}
              awayValue={awaySnapshot?.failed_to_score}
              isPercent={false}
            />
            <ComparisonMetricRow
              label="BTTS for"
              homeValue={homeSnapshot?.btts_for}
              awayValue={awaySnapshot?.btts_for}
              isPercent={false}
            />
            <ComparisonMetricRow
              label="Over 2.5 for"
              homeValue={homeSnapshot?.over_25_for}
              awayValue={awaySnapshot?.over_25_for}
              isPercent={false}
            />
          </div>
        </>
      )}
    </section>
  );
}

function FormList({
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
    <section className="rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Last {fixtures.length} completed matches
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {fixtures.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/40 p-5 text-sm text-zinc-400">
            No recent completed matches found.
          </div>
        ) : (
          fixtures.map((fixture) => {
            const result = getOutcomeForTeam(fixture, teamId);
            const opponent = getOpponentName(fixture, teamId, teamMap);
            const score = getScorelineFromTeamView(fixture, teamId);
            const isHome = fixture.home_team_id === teamId;

            return (
              <div
                key={fixture.id}
                className="rounded-2xl border border-zinc-800 bg-black/30 p-4 transition hover:border-zinc-700 hover:bg-black/40"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-white">
                      {isHome ? "vs" : "at"} {opponent}
                    </div>
                    <div className="mt-1 text-sm text-zinc-400">
                      {formatDate(fixture.utc_date)} • {isHome ? "Home" : "Away"}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-base font-bold text-white">{score}</div>
                    <span
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-xs font-bold ${getOutcomeClasses(
                        result
                      )}`}
                    >
                      {result}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
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
    ...h2h.flatMap((f) => [f.home_team_id || "", f.away_team_id || ""]),
  ].filter(Boolean);

  const extraTeamMap = await getTeamsMap(supabase, extraTeamIds);
  const teamMap = { ...initialTeamMap, ...extraTeamMap };

  const homeTeam = teamMap[homeTeamId];
  const awayTeam = teamMap[awayTeamId];
  const h2hSummary = summariseHeadToHead(h2h, homeTeamId, awayTeamId);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.12),transparent_20%),radial-gradient(circle_at_top_right,rgba(6,182,212,0.12),transparent_25%),#050505] text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900/80 px-4 py-2 text-sm text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800"
          >
            ← Back to predictions
          </Link>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-zinc-800 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black shadow-2xl">
          <div className="border-b border-zinc-800 px-6 py-4 md:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-[0.22em] text-zinc-400">
                {fixture.league_code || "League"}
                {fixture.season ? ` • ${fixture.season}` : ""}
              </div>
              <div className="text-sm text-zinc-400">{formatDateTime(fixture.utc_date)}</div>
            </div>
          </div>

          <div className="grid gap-8 px-6 py-8 md:px-8 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
            <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
              <TeamCrest team={homeTeam} />
              <div className="mt-4 text-2xl font-bold text-white md:text-3xl">
                {homeTeam?.name || "Home"}
              </div>
              <div className="mt-2 text-sm text-zinc-400">Home side</div>
            </div>

            <div className="min-w-[260px] text-center">
              <div className="text-sm uppercase tracking-[0.18em] text-zinc-500">Match Centre</div>

              {isFinishedMatch(fixture) ? (
                <div className="mt-5">
                  <div className="flex items-center justify-center gap-4">
                    <span className="text-5xl font-extrabold tracking-tight text-white md:text-6xl">
                      {fixture.home_score ?? "-"}
                    </span>
                    <span className="text-2xl font-semibold text-zinc-500">-</span>
                    <span className="text-5xl font-extrabold tracking-tight text-white md:text-6xl">
                      {fixture.away_score ?? "-"}
                    </span>
                  </div>
                  <div className="mt-3 inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 text-sm font-medium text-emerald-300">
                    Final result
                  </div>
                </div>
              ) : (
                <div className="mt-5">
                  <div className="text-4xl font-extrabold tracking-tight text-white md:text-5xl">
                    vs
                  </div>
                  <div className="mt-3 inline-flex rounded-full border border-cyan-500/20 bg-cyan-500/10 px-4 py-1.5 text-sm font-medium text-cyan-300">
                    Upcoming fixture
                  </div>
                </div>
              )}

              {prediction ? (
                <div className="mx-auto mt-6 max-w-md rounded-3xl border border-zinc-800 bg-zinc-900/70 p-4">
                  <div className="text-xs uppercase tracking-wide text-zinc-500">
                    Model prediction
                  </div>
                  <div className="mt-2 text-xl font-semibold text-white">
                    {resultLabel(prediction.predicted_result)}
                  </div>
                  <div className="mt-2 text-sm text-zinc-400">
                    Predicted score: {prediction.predicted_home_goals ?? "-"} -{" "}
                    {prediction.predicted_away_goals ?? "-"}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col items-center text-center lg:items-end lg:text-right">
              <TeamCrest team={awayTeam} />
              <div className="mt-4 text-2xl font-bold text-white md:text-3xl">
                {awayTeam?.name || "Away"}
              </div>
              <div className="mt-2 text-sm text-zinc-400">Away side</div>
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <TeamFormSummaryCard team={homeTeam} fixtures={homeRecent} teamId={homeTeamId} />
          <TeamFormSummaryCard team={awayTeam} fixtures={awayRecent} teamId={awayTeamId} />
        </div>

        <div className="mt-6">
          <TeamComparisonSection
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            homeSnapshot={homeSnapshot}
            awaySnapshot={awaySnapshot}
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-white">Prediction insight</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Stored probabilities and model commentary for this fixture
                </p>
              </div>
            </div>

            {!prediction ? (
              <div className="mt-5 rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/40 p-5 text-sm text-zinc-400">
                No prediction found for this match yet.
              </div>
            ) : (
              <>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <StatMiniCard
                    label="Outcome"
                    value={resultLabel(prediction.predicted_result)}
                  />
                  <StatMiniCard
                    label="Confidence"
                    value={prediction.confidence_label || prediction.confidence || "Medium"}
                  />
                  <StatMiniCard
                    label="Predicted score"
                    value={`${prediction.predicted_home_goals ?? "-"} - ${
                      prediction.predicted_away_goals ?? "-"
                    }`}
                  />
                </div>

                <div className="mt-5 rounded-3xl border border-zinc-800 bg-black/30 p-5">
                  <div className="space-y-4">
                    <PercentBar
                      label={`${homeTeam?.name || "Home"} win`}
                      value={prediction.home_win_pct}
                    />
                    <PercentBar label="Draw" value={prediction.draw_pct} />
                    <PercentBar
                      label={`${awayTeam?.name || "Away"} win`}
                      value={prediction.away_win_pct}
                    />
                  </div>
                </div>

                {prediction.explanation ? (
                  <div className="mt-5 rounded-3xl border border-cyan-500/20 bg-cyan-500/10 p-5 text-sm text-cyan-100">
                    <span className="font-semibold">Model note:</span> {prediction.explanation}
                  </div>
                ) : null}
              </>
            )}
          </section>

          <section className="rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-6">
            <div>
              <h2 className="text-xl font-semibold text-white">Head-to-head</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Last {MAX_H2H} completed meetings before this fixture
              </p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
              <StatMiniCard
                label={`${homeTeam?.name || "Home"} wins`}
                value={h2hSummary.homeWins}
              />
              <StatMiniCard label="Draws" value={h2hSummary.draws} />
              <StatMiniCard
                label={`${awayTeam?.name || "Away"} wins`}
                value={h2hSummary.awayWins}
              />
              <StatMiniCard
                label={`${homeTeam?.name || "Home"} goals`}
                value={h2hSummary.homeGoals}
              />
              <StatMiniCard
                label={`${awayTeam?.name || "Away"} goals`}
                value={h2hSummary.awayGoals}
              />
              <StatMiniCard
                label="BTTS"
                value={`${h2hSummary.bttsCount}/${h2h.length}`}
              />
            </div>

            <div className="mt-5 space-y-3">
              {h2h.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/40 p-5 text-sm text-zinc-400">
                  No completed head-to-head matches found.
                </div>
              ) : (
                h2h.map((game) => (
                  <div
                    key={game.id}
                    className="rounded-2xl border border-zinc-800 bg-black/30 p-4 transition hover:border-zinc-700"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold text-white">
                          {teamMap[game.home_team_id || ""]?.name || "Home"} vs{" "}
                          {teamMap[game.away_team_id || ""]?.name || "Away"}
                        </div>
                        <div className="mt-1 text-sm text-zinc-400">
                          {formatDate(game.utc_date)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-base font-bold text-white">
                        {game.home_score ?? "-"} - {game.away_score ?? "-"}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <FormList
            title={`${homeTeam?.name || "Home team"} last 5`}
            fixtures={homeRecent}
            teamId={homeTeamId}
            teamMap={teamMap}
          />

          <FormList
            title={`${awayTeam?.name || "Away team"} last 5`}
            fixtures={awayRecent}
            teamId={awayTeamId}
            teamMap={teamMap}
          />
        </div>
      </div>
    </main>
  );
}
