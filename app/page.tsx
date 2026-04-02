import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

type PageProps = {
  searchParams?: Promise<{
    competition?: string;
    view?: string;
  }>;
};

type FixtureRow = {
  id: string;
  league_code?: string | null;
  utc_date?: string | null;
  status?: string | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_score?: number | null;
  away_score?: number | null;
};

type PredictionRow = {
  fixture_id: string;
  predicted_result?: string | null;
  home_win_pct?: number | null;
  draw_pct?: number | null;
  away_win_pct?: number | null;
  market_home_pct?: number | null;
  market_draw_pct?: number | null;
  market_away_pct?: number | null;
  best_value_side?: string | null;
  best_value_edge?: number | null;
  best_value_ev_pct?: number | null;
  edge_quality_score?: number | null;
  edge_quality_tier?: string | null;
  bet_recommendation?: boolean | null;
  risk_label?: string | null;
  confidence?: string | null;
};

type TeamRow = {
  id: string;
  name: string | null;
  crest?: string | null;
};

const COMPETITIONS = [
  { code: "PL", name: "Premier League" },
  { code: "ELC", name: "Championship" },
];

const VIEW_OPTIONS = [
  { key: "recommended", label: "Recommended" },
  { key: "elite", label: "Elite Only" },
  { key: "all", label: "All Value" },
];

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "TBC";
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function pct(value?: number | null) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function signedPct(value?: number | null) {
  const n = Number(value || 0);
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function outcomeLabel(value?: string | null) {
  if (value === "HOME") return "Home";
  if (value === "AWAY") return "Away";
  if (value === "DRAW") return "Draw";
  return value || "—";
}

function resultLabel(
  homeScore?: number | null,
  awayScore?: number | null
): "HOME" | "DRAW" | "AWAY" {
  const h = Number(homeScore || 0);
  const a = Number(awayScore || 0);
  if (h > a) return "HOME";
  if (a > h) return "AWAY";
  return "DRAW";
}

function tierClasses(tier?: string | null) {
  if (tier === "ELITE") {
    return {
      badge: "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
      card: "hover:border-emerald-400/30",
      glow: "from-emerald-500/18 via-teal-500/10 to-transparent",
    };
  }
  if (tier === "STRONG") {
    return {
      badge: "border-blue-400/30 bg-blue-500/10 text-blue-300",
      card: "hover:border-blue-400/30",
      glow: "from-blue-500/18 via-cyan-500/10 to-transparent",
    };
  }
  if (tier === "WATCH") {
    return {
      badge: "border-amber-400/30 bg-amber-500/10 text-amber-300",
      card: "hover:border-amber-400/30",
      glow: "from-amber-500/18 via-orange-500/10 to-transparent",
    };
  }
  return {
    badge: "border-slate-500/30 bg-slate-500/10 text-slate-300",
    card: "hover:border-slate-400/30",
    glow: "from-slate-500/12 via-slate-500/6 to-transparent",
  };
}

function riskClasses(risk?: string | null) {
  if (risk === "Low") {
    return "border-emerald-400/25 bg-emerald-500/10 text-emerald-300";
  }
  if (risk === "Medium") {
    return "border-amber-400/25 bg-amber-500/10 text-amber-300";
  }
  return "border-rose-400/25 bg-rose-500/10 text-rose-300";
}

function accuracyClasses(correct?: boolean) {
  if (correct === true) {
    return "border-emerald-400/25 bg-emerald-500/10 text-emerald-300";
  }
  if (correct === false) {
    return "border-rose-400/25 bg-rose-500/10 text-rose-300";
  }
  return "border-slate-500/25 bg-slate-500/10 text-slate-300";
}

function SectionHeader({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-5">
      <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-300/80">
        {kicker}
      </div>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-white md:text-3xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-2 max-w-2xl text-sm text-slate-400">{subtitle}</p>
      ) : null}
    </div>
  );
}

function MetricTile({
  label,
  value,
  foot,
}: {
  label: string;
  value: string | number;
  foot?: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm">
      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-white md:text-3xl">
        {value}
      </div>
      {foot ? <div className="mt-1 text-xs text-slate-500">{foot}</div> : null}
    </div>
  );
}

function ThreeWayBar({
  home,
  draw,
  away,
}: {
  home?: number | null;
  draw?: number | null;
  away?: number | null;
}) {
  const h = Math.max(Number(home || 0), 0);
  const d = Math.max(Number(draw || 0), 0);
  const a = Math.max(Number(away || 0), 0);
  const total = h + d + a || 1;

  const homeWidth = (h / total) * 100;
  const drawWidth = (d / total) * 100;
  const awayWidth = (a / total) * 100;

  return (
    <div className="space-y-2">
      <div className="h-2.5 overflow-hidden rounded-full bg-white/8">
        <div className="flex h-full w-full">
          <div className="bg-blue-400/80" style={{ width: `${homeWidth}%` }} />
          <div className="bg-slate-300/70" style={{ width: `${drawWidth}%` }} />
          <div className="bg-emerald-400/80" style={{ width: `${awayWidth}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-blue-400/80" />
          <span>Home {pct(home)}</span>
        </div>
        <div className="flex items-center justify-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-slate-300/70" />
          <span>Draw {pct(draw)}</span>
        </div>
        <div className="flex items-center justify-end gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400/80" />
          <span>Away {pct(away)}</span>
        </div>
      </div>
    </div>
  );
}

export default async function Page({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const competition = (params.competition || "PL").toUpperCase();
  const view = (params.view || "recommended").toLowerCase();

  const supabase = getSupabase();

  const [{ data: fixtures }, { data: predictions }, { data: teams }] =
    await Promise.all([
      supabase
        .from("fixtures")
        .select("*")
        .eq("league_code", competition)
        .order("utc_date", { ascending: true }),

      supabase.from("predictions").select("*").eq("league_code", competition),

      supabase.from("teams").select("id, name, crest"),
    ]);

  const fixtureRows = (fixtures || []) as FixtureRow[];
  const predictionRows = (predictions || []) as PredictionRow[];
  const teamRows = (teams || []) as TeamRow[];

  const fixtureMap = new Map<string, FixtureRow>();
  fixtureRows.forEach((f) => fixtureMap.set(f.id, f));

  const predictionMap = new Map<string, PredictionRow>();
  predictionRows.forEach((p) => predictionMap.set(p.fixture_id, p));

  const teamMap = new Map<string, TeamRow>();
  teamRows.forEach((t) => teamMap.set(t.id, t));

  const now = new Date();

  const getTeam = (id?: string | null) => (id ? teamMap.get(id) : undefined);

  const upcomingFixtures = fixtureRows
    .filter((f) => f.utc_date && new Date(f.utc_date) > now)
    .slice(0, 8);

  const recentResults = fixtureRows
    .filter((f) => f.status === "FINISHED")
    .sort(
      (a, b) =>
        new Date(b.utc_date || "").getTime() - new Date(a.utc_date || "").getTime()
    )
    .slice(0, 8);

  const upcomingPredictions = predictionRows
    .filter((p) => fixtureMap.has(p.fixture_id))
    .filter((p) => {
      const fixture = fixtureMap.get(p.fixture_id);
      return fixture?.utc_date && new Date(fixture.utc_date) > now;
    });

  const allValuePicks = upcomingPredictions
    .filter((p) => Number(p.best_value_edge || 0) > 1)
    .sort((a, b) => {
      const qa = Number(a.edge_quality_score || 0);
      const qb = Number(b.edge_quality_score || 0);
      if (qb !== qa) return qb - qa;
      return Number(b.best_value_ev_pct || 0) - Number(a.best_value_ev_pct || 0);
    });

  const recommendedPicks = allValuePicks.filter((p) => p.bet_recommendation);
  const elitePicks = allValuePicks.filter((p) => p.edge_quality_tier === "ELITE");

  const topPredictions = [...upcomingPredictions].sort((a, b) => {
    const topA = Math.max(
      Number(a.home_win_pct || 0),
      Number(a.draw_pct || 0),
      Number(a.away_win_pct || 0)
    );
    const topB = Math.max(
      Number(b.home_win_pct || 0),
      Number(b.draw_pct || 0),
      Number(b.away_win_pct || 0)
    );

    if (topB !== topA) return topB - topA;

    return (
      Math.max(
        Number(b.home_win_pct || 0),
        Number(b.draw_pct || 0),
        Number(b.away_win_pct || 0)
      ) -
      Math.max(
        Number(a.home_win_pct || 0),
        Number(a.draw_pct || 0),
        Number(a.away_win_pct || 0)
      )
    );
  });

  let boardType: "recommended" | "all-value" | "top-predictions" = "recommended";
  let boardTitle = "Top Value Picks";
  let boardSubtitle =
    "The strongest current spots ranked by edge quality first, then EV.";
  let valuePicks: PredictionRow[] = [];

  if (view === "elite") {
    if (elitePicks.length > 0) {
      valuePicks = elitePicks.slice(0, 6);
      boardType = "recommended";
      boardTitle = "Elite Value Picks";
      boardSubtitle = "Highest-rated value spots in the current competition.";
    } else if (allValuePicks.length > 0) {
      valuePicks = allValuePicks.slice(0, 6);
      boardType = "all-value";
      boardTitle = "Top Value Picks";
      boardSubtitle = "No elite picks available, so showing the best available value spots.";
    } else {
      valuePicks = topPredictions.slice(0, 6);
      boardType = "top-predictions";
      boardTitle = "Top Predictions";
      boardSubtitle = "No value picks available, so showing the strongest model predictions.";
    }
  } else if (view === "all") {
    if (allValuePicks.length > 0) {
      valuePicks = allValuePicks.slice(0, 6);
      boardType = "all-value";
      boardTitle = "Top Value Picks";
      boardSubtitle = "Best available value spots ranked by edge quality and EV.";
    } else {
      valuePicks = topPredictions.slice(0, 6);
      boardType = "top-predictions";
      boardTitle = "Top Predictions";
      boardSubtitle = "No value picks available, so showing the strongest model predictions.";
    }
  } else {
    if (recommendedPicks.length > 0) {
      valuePicks = recommendedPicks.slice(0, 6);
      boardType = "recommended";
      boardTitle = "Top Value Picks";
      boardSubtitle = "Recommended picks first. Strongest current spots ranked by edge quality and EV.";
    } else if (allValuePicks.length > 0) {
      valuePicks = allValuePicks.slice(0, 6);
      boardType = "all-value";
      boardTitle = "Top Value Picks";
      boardSubtitle = "No recommended picks available, so showing the best available value spots.";
    } else {
      valuePicks = topPredictions.slice(0, 6);
      boardType = "top-predictions";
      boardTitle = "Top Predictions";
      boardSubtitle = "No value picks available, so showing the strongest model predictions.";
    }
  }

  const settledPredictions = recentResults
    .map((fixture) => {
      const prediction = predictionMap.get(fixture.id);
      if (!prediction) return null;

      const actual = resultLabel(fixture.home_score, fixture.away_score);
      const correct = prediction.predicted_result === actual;

      return { fixture, prediction, correct };
    })
    .filter(Boolean) as {
    fixture: FixtureRow;
    prediction: PredictionRow;
    correct: boolean;
  }[];

  const recentAccuracy =
    settledPredictions.length > 0
      ? Math.round(
          (settledPredictions.filter((x) => x.correct).length /
            settledPredictions.length) *
            100
        )
      : 0;

  const averageEdge =
    allValuePicks.length > 0
      ? (
          allValuePicks.reduce(
            (sum, p) => sum + Number(p.best_value_edge || 0),
            0
          ) / allValuePicks.length
        ).toFixed(1)
      : "0.0";

  const averageEv =
    allValuePicks.length > 0
      ? (
          allValuePicks.reduce(
            (sum, p) => sum + Number(p.best_value_ev_pct || 0),
            0
          ) / allValuePicks.length
        ).toFixed(1)
      : "0.0";

  const eliteCount = elitePicks.length;
  const recommendedCount = recommendedPicks.length;

  const topPick = valuePicks[0] || null;
  const topFixture = topPick ? fixtureMap.get(topPick.fixture_id) : null;
  const topHome = topFixture ? getTeam(topFixture.home_team_id) : null;
  const topAway = topFixture ? getTeam(topFixture.away_team_id) : null;

  const isPredictionFallback = boardType === "top-predictions";

  return (
    <div className="min-h-screen bg-[#07111f] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <div className="relative overflow-hidden rounded-[34px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.16),transparent_25%),radial-gradient(circle_at_85%_15%,rgba(16,185,129,0.12),transparent_22%),linear-gradient(180deg,#0c1728_0%,#07111f_100%)] shadow-[0_30px_80px_rgba(0,0,0,0.42)]">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:30px_30px] opacity-20" />
          <div className="relative z-10 p-6 md:p-8">
            <div className="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-300/80">
                  Football Stats Agent
                </div>
                <h1 className="mt-3 text-3xl font-bold tracking-tight text-white md:text-5xl">
                  Premium Betting Insights
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
                  A cleaner match board built around model strength, market
                  pricing, edge quality and value selection.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {COMPETITIONS.map((item) => (
                  <Link
                    key={item.code}
                    href={`/?competition=${item.code}&view=${view}`}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                      competition === item.code
                        ? "border-white bg-white text-slate-950"
                        : "border-white/10 bg-white/5 text-white hover:bg-white/10"
                    }`}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {VIEW_OPTIONS.map((item) => (
                <Link
                  key={item.key}
                  href={`/?competition=${competition}&view=${item.key}`}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    view === item.key
                      ? "border-cyan-400 bg-cyan-500 text-slate-950"
                      : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <MetricTile
                label="Value Matches"
                value={allValuePicks.length}
                foot="Upcoming fixtures with positive edge"
              />
              <MetricTile
                label="Recommended"
                value={recommendedCount}
                foot="Filtered bet-ready spots"
              />
              <MetricTile
                label="Elite"
                value={eliteCount}
                foot="Top quality tier"
              />
              <MetricTile
                label="Avg Edge"
                value={`${averageEdge}%`}
                foot="Across current value board"
              />
              <MetricTile
                label="Recent Accuracy"
                value={`${recentAccuracy}%`}
                foot="Latest finished predictions"
              />
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-8 xl:grid-cols-[1.45fr_0.95fr]">
          <div className="space-y-8">
            <div>
              <SectionHeader
                kicker="Value Board"
                title={boardTitle}
                subtitle={boardSubtitle}
              />

              {valuePicks.length === 0 ? (
                <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 text-slate-400">
                  No upcoming predictions available right now.
                </div>
              ) : (
                <div className="grid gap-4">
                  {valuePicks.map((pick) => {
                    const fixture = fixtureMap.get(pick.fixture_id);
                    if (!fixture) return null;

                    const home = getTeam(fixture.home_team_id);
                    const away = getTeam(fixture.away_team_id);
                    const tier = tierClasses(pick.edge_quality_tier);

                    return (
                      <Link
                        key={pick.fixture_id}
                        href={`/match/${pick.fixture_id}`}
                        className={`group relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0c1626] p-5 transition duration-200 ${tier.card}`}
                      >
                        <div
                          className={`absolute inset-0 bg-gradient-to-br ${tier.glow} opacity-100`}
                        />
                        <div className="relative z-10">
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                {!isPredictionFallback ? (
                                  <>
                                    <span
                                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tier.badge}`}
                                    >
                                      {pick.edge_quality_tier || "PASS"}
                                    </span>

                                    {pick.bet_recommendation ? (
                                      <span className="rounded-full border border-violet-400/25 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-300">
                                        Recommended
                                      </span>
                                    ) : null}

                                    <span
                                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${riskClasses(
                                        pick.risk_label
                                      )}`}
                                    >
                                      {pick.risk_label || "—"} Risk
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className="rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-300">
                                      Prediction Fallback
                                    </span>
                                    <span className="rounded-full border border-slate-400/20 bg-slate-500/10 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                                      Model Led
                                    </span>
                                  </>
                                )}
                              </div>

                              <div className="mt-4 text-xl font-bold text-white md:text-2xl">
                                {home?.name} vs {away?.name}
                              </div>
                              <div className="mt-1 text-sm text-slate-400">
                                {formatDateTime(fixture.utc_date)}
                              </div>
                            </div>

                            <div className="min-w-[165px] rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">
                                {isPredictionFallback ? "Top Outcome" : "Best Side"}
                              </div>
                              <div className="mt-2 text-2xl font-bold text-white">
                                {outcomeLabel(
                                  isPredictionFallback
                                    ? pick.predicted_result
                                    : pick.best_value_side
                                )}
                              </div>
                              <div className="mt-2 text-xs text-slate-400">
                                Confidence: {pick.confidence || "—"}
                              </div>
                            </div>
                          </div>

                          <div className="mt-5 grid gap-3 md:grid-cols-4">
                            <div className="rounded-[20px] border border-white/10 bg-black/10 p-4">
                              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                {isPredictionFallback ? "Home" : "Edge"}
                              </div>
                              <div className="mt-2 text-xl font-bold text-white">
                                {isPredictionFallback
                                  ? pct(pick.home_win_pct)
                                  : signedPct(pick.best_value_edge)}
                              </div>
                            </div>

                            <div className="rounded-[20px] border border-white/10 bg-black/10 p-4">
                              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                {isPredictionFallback ? "Draw" : "EV"}
                              </div>
                              <div
                                className={`mt-2 text-xl font-bold ${
                                  isPredictionFallback ? "text-white" : "text-blue-300"
                                }`}
                              >
                                {isPredictionFallback
                                  ? pct(pick.draw_pct)
                                  : signedPct(pick.best_value_ev_pct)}
                              </div>
                            </div>

                            <div className="rounded-[20px] border border-white/10 bg-black/10 p-4">
                              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                {isPredictionFallback ? "Away" : "Quality"}
                              </div>
                              <div className="mt-2 text-xl font-bold text-white">
                                {isPredictionFallback
                                  ? pct(pick.away_win_pct)
                                  : Math.round(Number(pick.edge_quality_score || 0))}
                              </div>
                            </div>

                            <div className="rounded-[20px] border border-white/10 bg-black/10 p-4">
                              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                                {isPredictionFallback ? "Result" : "Market EV Avg"}
                              </div>
                              <div className="mt-2 text-xl font-bold text-white">
                                {isPredictionFallback
                                  ? outcomeLabel(pick.predicted_result)
                                  : `${averageEv}%`}
                              </div>
                            </div>
                          </div>

                          <div className="mt-5 grid gap-4 lg:grid-cols-2">
                            <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                              <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                                Model Probabilities
                              </div>
                              <ThreeWayBar
                                home={pick.home_win_pct}
                                draw={pick.draw_pct}
                                away={pick.away_win_pct}
                              />
                            </div>

                            <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                              <div className="mb-3 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                                {isPredictionFallback
                                  ? "Prediction Summary"
                                  : "Market Probabilities"}
                              </div>

                              {isPredictionFallback ? (
                                <div className="space-y-2 text-sm text-slate-300">
                                  <div className="flex items-center justify-between">
                                    <span>Predicted Result</span>
                                    <span className="font-semibold text-white">
                                      {outcomeLabel(pick.predicted_result)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span>Confidence</span>
                                    <span className="font-semibold text-white">
                                      {pick.confidence || "—"}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span>Board Mode</span>
                                    <span className="font-semibold text-white">
                                      Fallback
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <ThreeWayBar
                                  home={pick.market_home_pct}
                                  draw={pick.market_draw_pct}
                                  away={pick.market_away_pct}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-8">
            {topPick && topFixture ? (
              <div>
                <SectionHeader
                  kicker="Featured"
                  title="Top Board Position"
                  subtitle="Highest-ranked current spot from the active board."
                />

                <Link
                  href={`/match/${topPick.fixture_id}`}
                  className="block overflow-hidden rounded-[28px] border border-cyan-400/20 bg-[linear-gradient(180deg,#0c1728_0%,#091220_100%)] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.28)] transition hover:border-cyan-400/35"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-300/80">
                        Featured Pick
                      </div>
                      <div className="mt-3 text-xl font-bold text-white">
                        {topHome?.name} vs {topAway?.name}
                      </div>
                      <div className="mt-1 text-sm text-slate-400">
                        {formatDateTime(topFixture.utc_date)}
                      </div>
                    </div>

                    <div
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                        isPredictionFallback
                          ? "border-cyan-400/25 bg-cyan-500/10 text-cyan-300"
                          : tierClasses(topPick.edge_quality_tier).badge
                      }`}
                    >
                      {isPredictionFallback
                        ? "Prediction Fallback"
                        : topPick.edge_quality_tier || "PASS"}
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-3 gap-3">
                    <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                        {isPredictionFallback ? "Result" : "Side"}
                      </div>
                      <div className="mt-2 text-lg font-bold text-white">
                        {outcomeLabel(
                          isPredictionFallback
                            ? topPick.predicted_result
                            : topPick.best_value_side
                        )}
                      </div>
                    </div>

                    <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                        {isPredictionFallback ? "Home" : "Edge"}
                      </div>
                      <div
                        className={`mt-2 text-lg font-bold ${
                          isPredictionFallback ? "text-white" : "text-emerald-300"
                        }`}
                      >
                        {isPredictionFallback
                          ? pct(topPick.home_win_pct)
                          : signedPct(topPick.best_value_edge)}
                      </div>
                    </div>

                    <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-4">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                        {isPredictionFallback ? "Away" : "EV"}
                      </div>
                      <div
                        className={`mt-2 text-lg font-bold ${
                          isPredictionFallback ? "text-white" : "text-blue-300"
                        }`}
                      >
                        {isPredictionFallback
                          ? pct(topPick.away_win_pct)
                          : signedPct(topPick.best_value_ev_pct)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 rounded-[22px] border border-white/10 bg-white/[0.04] p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
                        Probability Split
                      </div>
                      <div className="text-xs text-slate-400">
                        Confidence: {topPick.confidence || "—"}
                      </div>
                    </div>

                    <ThreeWayBar
                      home={topPick.home_win_pct}
                      draw={topPick.draw_pct}
                      away={topPick.away_win_pct}
                    />
                  </div>
                </Link>
              </div>
            ) : null}

            <div>
              <SectionHeader
                kicker="Schedule"
                title="Upcoming Matches"
                subtitle="Fast access to the next fixtures in this competition."
              />

              <div className="grid gap-3">
                {upcomingFixtures.map((fixture) => {
                  const prediction = predictionMap.get(fixture.id);
                  const home = getTeam(fixture.home_team_id);
                  const away = getTeam(fixture.away_team_id);

                  return (
                    <Link
                      key={fixture.id}
                      href={`/match/${fixture.id}`}
                      className="rounded-[24px] border border-white/10 bg-[#0c1626] p-4 transition hover:border-white/20 hover:bg-[#101b2d]"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-base font-semibold text-white">
                            {home?.name} vs {away?.name}
                          </div>
                          <div className="mt-1 text-sm text-slate-400">
                            {formatDateTime(fixture.utc_date)}
                          </div>
                        </div>

                        {prediction ? (
                          <div className="text-right">
                            <div className="text-sm font-semibold text-white">
                              {outcomeLabel(prediction.predicted_result)}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              {pct(prediction.home_win_pct)} / {pct(prediction.draw_pct)} /{" "}
                              {pct(prediction.away_win_pct)}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div>
              <SectionHeader
                kicker="Tracking"
                title="Recent Results"
                subtitle="Quick view of settled outcomes and prediction hit rate."
              />

              <div className="grid gap-3">
                {recentResults.map((fixture) => {
                  const prediction = predictionMap.get(fixture.id);
                  const home = getTeam(fixture.home_team_id);
                  const away = getTeam(fixture.away_team_id);

                  const actual = resultLabel(
                    fixture.home_score,
                    fixture.away_score
                  );

                  const correct = prediction
                    ? prediction.predicted_result === actual
                    : undefined;

                  return (
                    <Link
                      key={fixture.id}
                      href={`/match/${fixture.id}`}
                      className="rounded-[24px] border border-white/10 bg-[#0c1626] p-4 transition hover:border-white/20 hover:bg-[#101b2d]"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-base font-semibold text-white">
                            {home?.name} vs {away?.name}
                          </div>
                          <div className="mt-1 text-sm text-slate-400">
                            {fixture.home_score ?? "-"} - {fixture.away_score ?? "-"}
                          </div>
                        </div>

                        <div className="text-right">
                          {prediction ? (
                            <>
                              <div
                                className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${accuracyClasses(
                                  correct
                                )}`}
                              >
                                {correct ? "Correct" : "Wrong"}
                              </div>
                              <div className="mt-2 text-xs text-slate-400">
                                Predicted: {outcomeLabel(prediction.predicted_result)}
                              </div>
                            </>
                          ) : (
                            <div className="text-xs text-slate-500">No prediction</div>
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
