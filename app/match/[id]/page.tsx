import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

type TeamRow = {
  id: string;
  name: string | null;
  logo: string | null;
};

type FixtureRow = {
  id: string;
  fixture_api_id?: number | null;
  league_code?: string | null;
  season?: number | null;
  status_short?: string | null;
  status_long?: string | null;
  match_date?: string | null;
  venue_name?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_goals?: number | null;
  away_goals?: number | null;
};

type PredictionRow = {
  id: string;
  fixture_id: string;
  predicted_outcome?: string | null;
  confidence?: number | null;
  predicted_home_goals?: number | null;
  predicted_away_goals?: number | null;
  home_win_pct?: number | null;
  draw_pct?: number | null;
  away_win_pct?: number | null;
  advice?: string | null;
};

const FINISHED_STATUSES = ["FT", "AET", "PEN"];
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
  return !!fixture.status_short && FINISHED_STATUSES.includes(fixture.status_short);
}

function getOutcomeForTeam(fixture: FixtureRow, teamId: string) {
  const isHome = fixture.home_team_id === teamId;
  const gf = isHome ? fixture.home_goals ?? 0 : fixture.away_goals ?? 0;
  const ga = isHome ? fixture.away_goals ?? 0 : fixture.home_goals ?? 0;

  if (gf > ga) return "W";
  if (gf < ga) return "L";
  return "D";
}

function getOutcomeClasses(result: "W" | "D" | "L") {
  if (result === "W") return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
  if (result === "L") return "bg-red-500/20 text-red-300 border border-red-500/30";
  return "bg-amber-500/20 text-amber-300 border border-amber-500/30";
}

function getOpponentName(fixture: FixtureRow, teamId: string, teamMap: Record<string, TeamRow>) {
  const opponentId = fixture.home_team_id === teamId ? fixture.away_team_id : fixture.home_team_id;
  if (!opponentId) return "Unknown";
  return teamMap[opponentId]?.name || "Unknown";
}

function getScorelineFromTeamView(fixture: FixtureRow, teamId: string) {
  const isHome = fixture.home_team_id === teamId;
  const gf = isHome ? fixture.home_goals : fixture.away_goals;
  const ga = isHome ? fixture.away_goals : fixture.home_goals;
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
    const gf = isHome ? fixture.home_goals ?? 0 : fixture.away_goals ?? 0;
    const ga = isHome ? fixture.away_goals ?? 0 : fixture.home_goals ?? 0;

    goalsFor += gf;
    goalsAgainst += ga;

    if (result === "W") wins += 1;
    else if (result === "D") draws += 1;
    else losses += 1;
  }

  return { wins, draws, losses, goalsFor, goalsAgainst };
}

async function getFixtureById(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data, error } = await supabase
    .from("fixtures")
    .select(
      `
      id,
      fixture_api_id,
      league_code,
      season,
      status_short,
      status_long,
      match_date,
      venue_name,
      home_team_id,
      away_team_id,
      home_goals,
      away_goals
    `
    )
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as FixtureRow;
}

async function getPredictionForFixture(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fixtureId: string
) {
  const { data } = await supabase
    .from("predictions")
    .select(
      `
      id,
      fixture_id,
      predicted_outcome,
      confidence,
      predicted_home_goals,
      predicted_away_goals,
      home_win_pct,
      draw_pct,
      away_win_pct,
      advice
    `
    )
    .eq("fixture_id", fixtureId)
    .maybeSingle();

  return (data as PredictionRow | null) || null;
}

async function getTeamsMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[]
): Promise<Record<string, TeamRow>> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return {};

  const { data } = await supabase
    .from("teams")
    .select("id, name, logo")
    .in("id", uniqueIds);

  const map: Record<string, TeamRow> = {};
  for (const team of (data || []) as TeamRow[]) {
    map[team.id] = team;
  }
  return map;
}

async function getRecentTeamFixtures(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
  beforeDate: string | null | undefined,
  leagueCode?: string | null,
  season?: number | null
) {
  let query = supabase
    .from("fixtures")
    .select(
      `
      id,
      fixture_api_id,
      league_code,
      season,
      status_short,
      status_long,
      match_date,
      venue_name,
      home_team_id,
      away_team_id,
      home_goals,
      away_goals
    `
    )
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .in("status_short", FINISHED_STATUSES)
    .order("match_date", { ascending: false })
    .limit(MAX_RECENT);

  if (beforeDate) query = query.lt("match_date", beforeDate);
  if (leagueCode) query = query.eq("league_code", leagueCode);
  if (season) query = query.eq("season", season);

  const { data } = await query;
  return (data || []) as FixtureRow[];
}

async function getHeadToHeadFixtures(
  supabase: Awaited<ReturnType<typeof createClient>>,
  homeTeamId: string,
  awayTeamId: string,
  beforeDate: string | null | undefined,
  leagueCode?: string | null,
  season?: number | null
) {
  let query = supabase
    .from("fixtures")
    .select(
      `
      id,
      fixture_api_id,
      league_code,
      season,
      status_short,
      status_long,
      match_date,
      venue_name,
      home_team_id,
      away_team_id,
      home_goals,
      away_goals
    `
    )
    .or(
      `and(home_team_id.eq.${homeTeamId},away_team_id.eq.${awayTeamId}),and(home_team_id.eq.${awayTeamId},away_team_id.eq.${homeTeamId})`
    )
    .in("status_short", FINISHED_STATUSES)
    .order("match_date", { ascending: false })
    .limit(MAX_H2H);

  if (beforeDate) query = query.lt("match_date", beforeDate);
  if (leagueCode) query = query.eq("league_code", leagueCode);
  if (season) query = query.eq("season", season);

  const { data } = await query;
  return (data || []) as FixtureRow[];
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
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm text-zinc-300">
        <span>{label}</span>
        <span>{safeValue}%</span>
      </div>
      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-2 rounded-full bg-sky-500"
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
}

function TeamBadge({
  team,
  align = "left",
}: {
  team?: TeamRow;
  align?: "left" | "right";
}) {
  return (
    <div className={`flex items-center gap-3 ${align === "right" ? "justify-end" : ""}`}>
      {align === "right" ? (
        <>
          <div className="text-right">
            <div className="font-semibold text-white">{team?.name || "Unknown team"}</div>
          </div>
          {team?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={team.logo}
              alt={team.name || "Team logo"}
              className="h-10 w-10 rounded-full bg-white object-contain p-1"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-zinc-800 border border-zinc-700" />
          )}
        </>
      ) : (
        <>
          {team?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={team.logo}
              alt={team.name || "Team logo"}
              className="h-10 w-10 rounded-full bg-white object-contain p-1"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-zinc-800 border border-zinc-700" />
          )}
          <div>
            <div className="font-semibold text-white">{team?.name || "Unknown team"}</div>
          </div>
        </>
      )}
    </div>
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
  const summary = summariseForm(fixtures, teamId);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="text-sm text-zinc-400">Last {fixtures.length} completed matches</p>
        </div>
        <div className="text-right text-sm text-zinc-300">
          <div>
            W-D-L:{" "}
            <span className="font-semibold text-white">
              {summary.wins}-{summary.draws}-{summary.losses}
            </span>
          </div>
          <div>
            GF-GA:{" "}
            <span className="font-semibold text-white">
              {summary.goalsFor}-{summary.goalsAgainst}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {fixtures.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-700 p-4 text-sm text-zinc-400">
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
                className="flex items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {isHome ? "vs" : "at"} {opponent}
                  </div>
                  <div className="text-xs text-zinc-400">
                    {formatDate(fixture.match_date)} • {isHome ? "Home" : "Away"}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-sm font-semibold text-white">{score}</div>
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${getOutcomeClasses(
                      result
                    )}`}
                  >
                    {result}
                  </span>
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
  const supabase = await createClient();

  const fixture = await getFixtureById(supabase, id);
  if (!fixture) notFound();

  const homeTeamId = fixture.home_team_id;
  const awayTeamId = fixture.away_team_id;

  if (!homeTeamId || !awayTeamId) notFound();

  const [prediction, homeRecent, awayRecent, h2h, initialTeamMap] = await Promise.all([
    getPredictionForFixture(supabase, fixture.id),
    getRecentTeamFixtures(
      supabase,
      homeTeamId,
      fixture.match_date,
      fixture.league_code,
      fixture.season
    ),
    getRecentTeamFixtures(
      supabase,
      awayTeamId,
      fixture.match_date,
      fixture.league_code,
      fixture.season
    ),
    getHeadToHeadFixtures(
      supabase,
      homeTeamId,
      awayTeamId,
      fixture.match_date,
      fixture.league_code,
      fixture.season
    ),
    getTeamsMap(supabase, [homeTeamId, awayTeamId]),
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

  const homeFormSummary = summariseForm(homeRecent, homeTeamId);
  const awayFormSummary = summariseForm(awayRecent, awayTeamId);

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            ← Back to predictions
          </Link>
        </div>

        <section className="rounded-3xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-6 md:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
            <TeamBadge team={homeTeam} />

            <div className="text-center">
              <div className="text-xs uppercase tracking-[0.2em] text-zinc-400">
                {fixture.league_code || "League"}{fixture.season ? ` • ${fixture.season}` : ""}
              </div>

              <div className="mt-3 text-3xl font-bold text-white md:text-4xl">
                {homeTeam?.name || "Home"}{" "}
                <span className="text-zinc-500">vs</span>{" "}
                {awayTeam?.name || "Away"}
              </div>

              <div className="mt-3 text-sm text-zinc-300">
                {formatDateTime(fixture.match_date)}
              </div>

              <div className="mt-1 text-sm text-zinc-500">
                {fixture.venue_name || "Venue TBC"}
              </div>

              {isFinishedMatch(fixture) ? (
                <div className="mt-5 inline-flex items-center gap-3 rounded-2xl border border-zinc-700 bg-zinc-900 px-5 py-3">
                  <span className="text-xs uppercase tracking-wide text-zinc-400">
                    Final score
                  </span>
                  <span className="text-2xl font-bold text-white">
                    {fixture.home_goals ?? "-"} - {fixture.away_goals ?? "-"}
                  </span>
                </div>
              ) : (
                <div className="mt-5 inline-flex items-center gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-sm text-sky-300">
                  Upcoming match
                </div>
              )}
            </div>

            <TeamBadge team={awayTeam} align="right" />
          </div>
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <h2 className="text-lg font-semibold text-white">Recent results snapshot</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Rolling form from each side&apos;s last five completed matches before this fixture.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="text-sm font-semibold text-white">
                  {homeTeam?.name || "Home team"}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-zinc-900 p-3">
                    <div className="text-zinc-400">W-D-L</div>
                    <div className="mt-1 font-semibold text-white">
                      {homeFormSummary.wins}-{homeFormSummary.draws}-{homeFormSummary.losses}
                    </div>
                  </div>
                  <div className="rounded-xl bg-zinc-900 p-3">
                    <div className="text-zinc-400">GF-GA</div>
                    <div className="mt-1 font-semibold text-white">
                      {homeFormSummary.goalsFor}-{homeFormSummary.goalsAgainst}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="text-sm font-semibold text-white text-right">
                  {awayTeam?.name || "Away team"}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-zinc-900 p-3">
                    <div className="text-zinc-400">W-D-L</div>
                    <div className="mt-1 font-semibold text-white">
                      {awayFormSummary.wins}-{awayFormSummary.draws}-{awayFormSummary.losses}
                    </div>
                  </div>
                  <div className="rounded-xl bg-zinc-900 p-3">
                    <div className="text-zinc-400">GF-GA</div>
                    <div className="mt-1 font-semibold text-white">
                      {awayFormSummary.goalsFor}-{awayFormSummary.goalsAgainst}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
            <h2 className="text-lg font-semibold text-white">Prediction insight</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Current stored model output for this fixture.
            </p>

            {!prediction ? (
              <div className="mt-4 rounded-xl border border-dashed border-zinc-700 p-4 text-sm text-zinc-400">
                No prediction found for this match yet.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-zinc-950/60 p-4 border border-zinc-800">
                    <div className="text-xs uppercase tracking-wide text-zinc-400">Outcome</div>
                    <div className="mt-2 text-xl font-semibold text-white">
                      {prediction.predicted_outcome || "N/A"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-zinc-950/60 p-4 border border-zinc-800">
                    <div className="text-xs uppercase tracking-wide text-zinc-400">Confidence</div>
                    <div className="mt-2 text-xl font-semibold text-white">
                      {prediction.confidence ?? 0}%
                    </div>
                  </div>
                  <div className="rounded-xl bg-zinc-950/60 p-4 border border-zinc-800">
                    <div className="text-xs uppercase tracking-wide text-zinc-400">
                      Predicted score
                    </div>
                    <div className="mt-2 text-xl font-semibold text-white">
                      {prediction.predicted_home_goals ?? "-"} -{" "}
                      {prediction.predicted_away_goals ?? "-"}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-xl bg-zinc-950/60 p-4 border border-zinc-800">
                  <PercentBar label={`${homeTeam?.name || "Home"} win`} value={prediction.home_win_pct} />
                  <PercentBar label="Draw" value={prediction.draw_pct} />
                  <PercentBar label={`${awayTeam?.name || "Away"} win`} value={prediction.away_win_pct} />
                </div>

                {prediction.advice ? (
                  <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 p-4 text-sm text-sky-100">
                    <span className="font-semibold">Advice:</span> {prediction.advice}
                  </div>
                ) : null}
              </div>
            )}
          </section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <div className="xl:col-span-1">
            <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 h-full">
              <h2 className="text-lg font-semibold text-white">Head-to-head</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Last {MAX_H2H} completed meetings before this fixture.
              </p>

              <div className="mt-4 space-y-3">
                {h2h.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-700 p-4 text-sm text-zinc-400">
                    No completed head-to-head matches found.
                  </div>
                ) : (
                  h2h.map((game) => (
                    <div
                      key={game.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white truncate">
                            {teamMap[game.home_team_id || ""]?.name || "Home"} vs{" "}
                            {teamMap[game.away_team_id || ""]?.name || "Away"}
                          </div>
                          <div className="text-xs text-zinc-400">
                            {formatDate(game.match_date)}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-white">
                          {game.home_goals ?? "-"} - {game.away_goals ?? "-"}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="xl:col-span-1">
            <FormList
              title={`${homeTeam?.name || "Home team"} last 5`}
              fixtures={homeRecent}
              teamId={homeTeamId}
              teamMap={teamMap}
            />
          </div>

          <div className="xl:col-span-1">
            <FormList
              title={`${awayTeam?.name || "Away team"} last 5`}
              fixtures={awayRecent}
              teamId={awayTeamId}
              teamMap={teamMap}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
