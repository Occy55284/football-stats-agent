import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

type PageProps = {
  searchParams?: {
    competition?: string;
    view?: string;
  };
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
  return Number(value || 0).toFixed(1);
}

function signed(value?: number | null) {
  const n = Number(value || 0);
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function outcomeLabel(value?: string | null) {
  if (value === "HOME") return "Home";
  if (value === "AWAY") return "Away";
  if (value === "DRAW") return "Draw";
  return value || "—";
}

function tierStyles(tier?: string | null) {
  if (tier === "ELITE") {
    return {
      pill: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
      accent: "from-emerald-500/20 to-teal-500/10",
      ring: "hover:border-emerald-400/30",
    };
  }

  if (tier === "STRONG") {
    return {
      pill: "bg-blue-500/15 text-blue-300 border-blue-400/30",
      accent: "from-blue-500/20 to-cyan-500/10",
      ring: "hover:border-blue-400/30",
    };
  }

  if (tier === "WATCH") {
    return {
      pill: "bg-amber-500/15 text-amber-300 border-amber-400/30",
      accent: "from-amber-500/20 to-orange-500/10",
      ring: "hover:border-amber-400/30",
    };
  }

  return {
    pill: "bg-slate-500/15 text-slate-300 border-slate-400/20",
    accent: "from-slate-500/10 to-slate-500/5",
    ring: "hover:border-slate-500/30",
  };
}

function riskStyles(risk?: string | null) {
  if (risk === "Low") {
    return "bg-emerald-500/10 text-emerald-300 border-emerald-400/25";
  }
  if (risk === "Medium") {
    return "bg-amber-500/10 text-amber-300 border-amber-400/25";
  }
  return "bg-rose-500/10 text-rose-300 border-rose-400/25";
}

function resultBadge(correct?: boolean) {
  if (correct === true) {
    return "bg-emerald-500/10 text-emerald-300 border-emerald-400/25";
  }
  if (correct === false) {
    return "bg-rose-500/10 text-rose-300 border-rose-400/25";
  }
  return "bg-slate-500/10 text-slate-300 border-slate-400/20";
}

function StatTile({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string | number;
  subtext?: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 md:p-5">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{label}</div>
      <div className="mt-2 text-2xl md:text-3xl font-bold text-white">{value}</div>
      {subtext ? <div className="mt-1 text-xs text-slate-400">{subtext}</div> : null}
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-5">
      <div className="text-[11px] uppercase tracking-[0.24em] text-blue-300/80">{eyebrow}</div>
      <h2 className="mt-2 text-2xl md:text-3xl font-bold text-white">{title}</h2>
      {subtitle ? <p className="mt-2 text-sm text-slate-400">{subtitle}</p> : null}
    </div>
  );
}

export default async function Page({ searchParams }: PageProps) {
  const supabase = getSupabase();

  const competition = (searchParams?.competition || "PL").toUpperCase();
  const view = (searchParams?.view || "recommended").toLowerCase();

  const [{ data: fixtures }, { data: predictions }, { data: teams }] = await Promise.all([
    supabase
      .from("fixtures")
      .select("*")
      .eq("league_code", competition)
      .order("utc_date", { ascending: true }),

    supabase.from("predictions").select("*").eq("league_code", competition),

    supabase.from("teams").select("id, name, crest"),
  ]);

  const teamMap = new Map<string, TeamRow>();
  (teams || []).forEach((t: any) => teamMap.set(t.id, t));

  const fixtureMap = new Map<string, FixtureRow>();
  (fixtures || []).forEach((f: any) => fixtureMap.set(f.id, f));

  const predictionMap = new Map<string, PredictionRow>();
  (predictions || []).forEach((p: any) => predictionMap.set(p.fixture_id, p));

  const now = new Date();

  const upcoming = ((fixtures || []) as FixtureRow[])
    .filter((f) => f.utc_date && new Date(f.utc_date) > now)
    .slice(0, 8);

  const results = ((fixtures || []) as FixtureRow[])
    .filter((f) => f.status === "FINISHED")
    .sort((a, b) => new Date(b.utc_date || "").getTime() - new Date(a.utc_date || "").getTime())
    .slice(0, 8);

  const allValueCards = ((predictions || []) as PredictionRow[])
    .filter((p) => fixtureMap.has(p.fixture_id))
    .filter((p) => {
      const f = fixtureMap.get(p.fixture_id);
      return !!f?.utc_date && new Date(f.utc_date) > now;
    })
    .filter((p) => Number(p.best_value_edge || 0) > 1)
    .sort((a, b) => {
      const scoreDiff = Number(b.edge_quality_score || 0) - Number(a.edge_quality_score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return Number(b.best_value_ev_pct || 0) - Number(a.best_value_ev_pct || 0);
    });

  const valuePicks =
    view === "elite"
      ? allValueCards.filter((p) => p.edge_quality_tier === "ELITE").slice(0, 6)
      : view === "all"
      ? allValueCards.slice(0, 6)
      : allValueCards.filter((p) => p.bet_recommendation).slice(0, 6);

  const predictionResults = results
    .map((f) => {
      const p = predictionMap.get(f.id);

      if (!p) return null;

      const actual =
        Number(f.home_score || 0) > Number(f.away_score || 0)
          ? "HOME"
          : Number(f.home_score || 0) < Number(f.away_score || 0)
          ? "AWAY"
          : "DRAW";

      return {
        fixture: f,
        prediction: p,
        correct: p.predicted_result === actual,
      };
    })
    .filter(Boolean) as { fixture: FixtureRow; prediction: PredictionRow; correct: boolean }[];

  const recentAccuracy =
    predictionResults.length > 0
      ? Math.round(
          (predictionResults.filter((r) => r.correct).length / predictionResults.length) * 100
        )
      : 0;

  const averageEdge =
    allValueCards.length > 0
      ? (
          allValueCards.reduce((sum, p) => sum + Number(p.best_value_edge || 0), 0) /
          allValueCards.length
        ).toFixed(1)
      : "0.0";

  const eliteCount = allValueCards.filter((p) => p.edge_quality_tier === "ELITE").length;
  const recommendedCount = allValueCards.filter((p) => p.bet_recommendation).length;

  const getTeam = (id?: string | null) => (id ? teamMap.get(id) : null);

  return (
    <div className="min-h-screen bg-[#07111f] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.22),transparent_30%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_28%),linear-gradient(180deg,#0b1728_0%,#07111f_100%)] p-6 md:p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:28px_28px] opacity-20 pointer-events-none" />

          <div className="relative z-10 flex flex-col gap-8">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <div className="text-[11px] uppercase tracking-[0.28em] text-blue-300/80">
                  Football Stats Agent
                </div>
                <h1 className="mt-3 text-3xl md:text-5xl font-bold tracking-tight text-white">
                  Betting Insights Platform
                </h1>
                <p className="mt-4 max-w-2xl text-sm md:text-base text-slate-300 leading-7">
                  Premium model-driven football insights combining prediction strength, market
                  pricing and value edge into a cleaner betting board.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {COMPETITIONS.map((c) => (
                  <Link
                    key={c.code}
                    href={`/?competition=${c.code}&view=${view}`}
                    className={`rounded-full px-4 py-2 text-sm font-medium border transition ${
                      competition === c.code
                        ? "bg-white text-slate-950 border-white"
                        : "bg-white/5 text-white border-white/10 hover:bg-white/10"
                    }`}
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {VIEW_OPTIONS.map((option) => (
                <Link
                  key={option.key}
                  href={`/?competition=${competition}&view=${option.key}`}
                  className={`rounded-full px-4 py-2 text-sm font-medium border transition ${
                    view === option.key
                      ? "bg-blue-500 text-white border-blue-500"
                      : "bg-white/5 text-slate-200 border-white/10 hover:bg-white/10"
                  }`}
                >
                  {option.label}
                </Link>
              ))}
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label="Value Matches"
                value={allValueCards.length}
                subtext="Upcoming matches with positive edge"
              />
              <StatTile
                label="Recommended"
                value={recommendedCount}
                subtext="Best filtered betting spots"
              />
              <StatTile
                label="Elite Picks"
                value={eliteCount}
                subtext="Highest edge quality tier"
              />
              <StatTile
                label="Recent Accuracy"
                value={`${recentAccuracy}%`}
                subtext="Based on latest finished predictions"
              />
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-8 xl:grid-cols-[1.45fr_0.85fr]">
          <div>
            <SectionHeader
              eyebrow="Value Board"
              title="Top Value Picks"
              subtitle="Best opportunities ranked by edge quality, EV and confidence structure."
            />

            {valuePicks.length === 0 ? (
              <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 text-slate-400">
                No value picks match this filter right now.
              </div>
            ) : (
              <div className="grid gap-4">
                {valuePicks.map((p) => {
                  const f = fixtureMap.get(p.fixture_id);
                  if (!f) return null;

                  const home = getTeam(f.home_team_id);
                  const away = getTeam(f.away_team_id);
                  const styles = tierStyles(p.edge_quality_tier);

                  return (
                    <Link
                      key={p.fixture_id}
                      href={`/match/${p.fixture_id}`}
                      className={`group relative overflow-hidden rounded-[28px] border border-white/10 bg-[#0d1828] p-5 transition duration-200 hover:-translate-y-0.5 ${styles.ring}`}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-br ${styles.accent} opacity-100`} />
                      <div className="relative z-10">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${styles.pill}`}>
                                {p.edge_quality_tier || "PASS"}
                              </span>

                              {p.bet_recommendation ? (
                                <span className="rounded-full border border-violet-400/25 bg-violet-500/10 px-2.5 py-1 text-[11px] font-semibold text-violet-300">
                                  Recommended
                                </span>
                              ) : null}

                              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${riskStyles(p.risk_label)}`}>
                                {p.risk_label || "—"} Risk
                              </span>
                            </div>

                            <div className="mt-4 text-xl md:text-2xl font-bold text-white">
                              {home?.name} vs {away?.name}
                            </div>
                            <div className="mt-1 text-sm text-slate-400">{formatDateTime(f.utc_date)}</div>
                          </div>

                          <div className="min-w-[150px] rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                              Best Value Side
                            </div>
                            <div className="mt-2 text-2xl font-bold text-white">
                              {outcomeLabel(p.best_value_side)}
                            </div>
                            <div className="mt-2 text-sm text-slate-400">
                              Confidence: {p.confidence || "—"}
                            </div>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-3 md:grid-cols-4">
                          <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Edge</div>
                            <div className="mt-2 text-xl font-bold text-emerald-300">
                              {signed(p.best_value_edge)}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">EV</div>
                            <div className="mt-2 text-xl font-bold text-blue-300">
                              {signed(p.best_value_ev_pct)}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Quality</div>
                            <div className="mt-2 text-xl font-bold text-white">
                              {Number(p.edge_quality_score || 0)}
                            </div>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Avg Edge</div>
                            <div className="mt-2 text-xl font-bold text-white">{averageEdge}%</div>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-4 lg:grid-cols-2">
                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400 mb-3">
                              Model
                            </div>
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-300">Home</span>
                                <span className="font-semibold text-white">{pct(p.home_win_pct)}%</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-300">Draw</span>
                                <span className="font-semibold text-white">{pct(p.draw_pct)}%</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-300">Away</span>
                                <span className="font-semibold text-white">{pct(p.away_win_pct)}%</span>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400 mb-3">
                              Market
                            </div>
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="text-slate-300">Home</span>
                                <span className="font-semibold text-white">{pct(p.market_home_pct)}%</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-300">Draw</span>
                                <span className="font-semibold text-white">{pct(p.market_draw_pct)}%</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-slate-300">Away</span>
                                <span className="font-semibold text-white">{pct(p.market_away_pct)}%</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-8">
            <div>
              <SectionHeader
                eyebrow="Schedule"
                title="Upcoming Matches"
                subtitle="Quick access to the next fixtures in this competition."
              />

              <div className="grid gap-3">
                {upcoming.map((f) => {
                  const p = predictionMap.get(f.id);
                  const home = getTeam(f.home_team_id);
                  const away = getTeam(f.away_team_id);

                  return (
                    <Link
                      key={f.id}
                      href={`/match/${f.id}`}
                      className="rounded-[24px] border border-white/10 bg-[#0d1828] p-4 transition hover:bg-[#101d30]"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-base font-semibold text-white">
                            {home?.name} vs {away?.name}
                          </div>
                          <div className="mt-1 text-sm text-slate-400">
                            {formatDateTime(f.utc_date)}
                          </div>
                        </div>

                        {p ? (
                          <div className="text-right">
                            <div className="text-sm font-semibold text-white">
                              {outcomeLabel(p.predicted_result)}
                            </div>
                            <div className="mt-1 text-xs text-slate-400">
                              {pct(p.home_win_pct)} / {pct(p.draw_pct)} / {pct(p.away_win_pct)}
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
                eyebrow="Performance"
                title="Recent Results"
                subtitle="Latest settled outcomes and hit-rate visibility."
              />

              <div className="grid gap-3">
                {results.map((f) => {
                  const p = predictionMap.get(f.id);
                  const home = getTeam(f.home_team_id);
                  const away = getTeam(f.away_team_id);

                  const actual =
                    Number(f.home_score || 0) > Number(f.away_score || 0)
                      ? "HOME"
                      : Number(f.home_score || 0) < Number(f.away_score || 0)
                      ? "AWAY"
                      : "DRAW";

                  const correct = p ? p.predicted_result === actual : undefined;

                  return (
                    <Link
                      key={f.id}
                      href={`/match/${f.id}`}
                      className="rounded-[24px] border border-white/10 bg-[#0d1828] p-4 transition hover:bg-[#101d30]"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-base font-semibold text-white">
                            {home?.name} vs {away?.name}
                          </div>
                          <div className="mt-1 text-sm text-slate-400">
                            {f.home_score ?? "-"} - {f.away_score ?? "-"}
                          </div>
                        </div>

                        <div className="text-right">
                          {p ? (
                            <>
                              <div
                                className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${resultBadge(
                                  correct
                                )}`}
                              >
                                {correct ? "Correct" : "Wrong"}
                              </div>
                              <div className="mt-2 text-xs text-slate-400">
                                Predicted: {outcomeLabel(p.predicted_result)}
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
