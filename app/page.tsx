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
  crest: string | null;
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

function tierStyles(tier?: string | null) {
  if (tier === "ELITE") {
    return {
      badge: "bg-emerald-500/15 text-emerald-700 border-emerald-300",
      glow: "shadow-[0_0_0_1px_rgba(16,185,129,0.18),0_18px_40px_rgba(16,185,129,0.14)]",
    };
  }

  if (tier === "STRONG") {
    return {
      badge: "bg-blue-500/15 text-blue-700 border-blue-300",
      glow: "shadow-[0_0_0_1px_rgba(59,130,246,0.16),0_18px_40px_rgba(59,130,246,0.10)]",
    };
  }

  if (tier === "WATCH") {
    return {
      badge: "bg-amber-500/15 text-amber-700 border-amber-300",
      glow: "shadow-[0_0_0_1px_rgba(245,158,11,0.16),0_18px_40px_rgba(245,158,11,0.10)]",
    };
  }

  return {
    badge: "bg-slate-500/10 text-slate-700 border-slate-300",
    glow: "shadow-[0_0_0_1px_rgba(148,163,184,0.14),0_18px_40px_rgba(15,23,42,0.06)]",
  };
}

function riskStyles(risk?: string | null) {
  if (risk === "Low") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (risk === "Medium") return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-rose-700 bg-rose-50 border-rose-200";
}

function outcomeLabel(value?: string | null) {
  if (value === "HOME") return "Home";
  if (value === "AWAY") return "Away";
  if (value === "DRAW") return "Draw";
  return value || "—";
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

    supabase
      .from("predictions")
      .select("*")
      .eq("league_code", competition),

    supabase.from("teams").select("id, name, crest"),
  ]);

  const teamMap = new Map<string, TeamRow>();
  (teams || []).forEach((t: any) => teamMap.set(t.id, t));

  const fixtureMap = new Map<string, FixtureRow>();
  (fixtures || []).forEach((f: any) => fixtureMap.set(f.id, f));

  const now = new Date();

  const upcoming = ((fixtures || []) as FixtureRow[])
    .filter((f) => f.utc_date && new Date(f.utc_date) > now)
    .slice(0, 10);

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
      ? allValueCards.filter((p) => p.edge_quality_tier === "ELITE").slice(0, 8)
      : view === "all"
      ? allValueCards.slice(0, 8)
      : allValueCards.filter((p) => p.bet_recommendation).slice(0, 8);

  const overallStats = {
    totalUpcomingValue: allValueCards.length,
    recommended: allValueCards.filter((p) => p.bet_recommendation).length,
    elite: allValueCards.filter((p) => p.edge_quality_tier === "ELITE").length,
    avgEdge:
      allValueCards.length > 0
        ? (
            allValueCards.reduce((sum, p) => sum + Number(p.best_value_edge || 0), 0) /
            allValueCards.length
          ).toFixed(1)
        : "0.0",
  };

  const getTeam = (id?: string | null) => (id ? teamMap.get(id) : null);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-6 md:p-8">
        <div className="rounded-3xl bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 text-white p-6 md:p-8 mb-8 shadow-2xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-blue-200/80 mb-2">
                Football Stats Agent
              </div>
              <h1 className="text-3xl md:text-4xl font-bold leading-tight">
                Betting Insights Board
              </h1>
              <p className="mt-2 text-sm md:text-base text-slate-300 max-w-2xl">
                {COMPETITIONS.find((c) => c.code === competition)?.name} value spots ranked by
                edge quality, expected value and risk.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 min-w-full lg:min-w-[560px]">
              <div className="rounded-2xl bg-white/8 border border-white/10 p-4">
                <div className="text-xs text-slate-300">Value matches</div>
                <div className="text-2xl font-bold mt-1">{overallStats.totalUpcomingValue}</div>
              </div>
              <div className="rounded-2xl bg-white/8 border border-white/10 p-4">
                <div className="text-xs text-slate-300">Recommended</div>
                <div className="text-2xl font-bold mt-1">{overallStats.recommended}</div>
              </div>
              <div className="rounded-2xl bg-white/8 border border-white/10 p-4">
                <div className="text-xs text-slate-300">Elite</div>
                <div className="text-2xl font-bold mt-1">{overallStats.elite}</div>
              </div>
              <div className="rounded-2xl bg-white/8 border border-white/10 p-4">
                <div className="text-xs text-slate-300">Avg edge</div>
                <div className="text-2xl font-bold mt-1">{overallStats.avgEdge}%</div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-3">
              {COMPETITIONS.map((c) => (
                <Link
                  key={c.code}
                  href={`/?competition=${c.code}&view=${view}`}
                  className={`px-4 py-2 rounded-full border text-sm transition ${
                    competition === c.code
                      ? "bg-white text-slate-950 border-white"
                      : "border-white/20 text-white/90 hover:bg-white/10"
                  }`}
                >
                  {c.name}
                </Link>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              {VIEW_OPTIONS.map((option) => (
                <Link
                  key={option.key}
                  href={`/?competition=${competition}&view=${option.key}`}
                  className={`px-4 py-2 rounded-full border text-sm transition ${
                    view === option.key
                      ? "bg-blue-500 text-white border-blue-500"
                      : "border-white/20 text-white/90 hover:bg-white/10"
                  }`}
                >
                  {option.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Premium Value Picks</h2>
              <p className="text-sm text-slate-500 mt-1">
                Ranked by edge quality score, not just headline edge.
              </p>
            </div>
          </div>

          {valuePicks.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-500">
              No picks match this filter right now.
            </div>
          ) : (
            <div className="grid lg:grid-cols-2 gap-5">
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
                    className={`rounded-3xl bg-white border border-slate-200 p-5 transition hover:-translate-y-0.5 ${styles.glow}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${styles.badge}`}
                          >
                            {p.edge_quality_tier || "PASS"}
                          </span>

                          {p.bet_recommendation ? (
                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-violet-50 text-violet-700 border-violet-200">
                              Recommended
                            </span>
                          ) : null}
                        </div>

                        <div className="text-lg md:text-xl font-bold text-slate-900">
                          {home?.name} vs {away?.name}
                        </div>
                        <div className="text-sm text-slate-500 mt-1">
                          {formatDateTime(f.utc_date)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs uppercase tracking-wide text-slate-500">
                          Best side
                        </div>
                        <div className="text-lg font-bold text-slate-900">
                          {outcomeLabel(p.best_value_side)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-3 mt-5">
                      <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          Edge
                        </div>
                        <div className="text-base font-bold text-emerald-600 mt-1">
                          {signed(p.best_value_edge)}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          EV
                        </div>
                        <div className="text-base font-bold text-blue-700 mt-1">
                          {signed(p.best_value_ev_pct)}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          Quality
                        </div>
                        <div className="text-base font-bold text-slate-900 mt-1">
                          {Number(p.edge_quality_score || 0)}
                        </div>
                      </div>

                      <div className="rounded-2xl bg-slate-50 p-3 border border-slate-100">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">
                          Risk
                        </div>
                        <div
                          className={`inline-flex mt-1 px-2 py-1 rounded-full border text-xs font-semibold ${riskStyles(
                            p.risk_label
                          )}`}
                        >
                          {p.risk_label || "—"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 grid md:grid-cols-2 gap-4">
                      <div className="rounded-2xl border border-slate-200 p-4">
                        <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                          Model probabilities
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>Home</span>
                            <span className="font-semibold">{pct(p.home_win_pct)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Draw</span>
                            <span className="font-semibold">{pct(p.draw_pct)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Away</span>
                            <span className="font-semibold">{pct(p.away_win_pct)}%</span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-slate-200 p-4">
                        <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
                          Market probabilities
                        </div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>Home</span>
                            <span className="font-semibold">{pct(p.market_home_pct)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Draw</span>
                            <span className="font-semibold">{pct(p.market_draw_pct)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Away</span>
                            <span className="font-semibold">{pct(p.market_away_pct)}%</span>
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

        <div className="grid xl:grid-cols-2 gap-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Upcoming Matches</h2>
            <div className="grid gap-4">
              {upcoming.map((f) => {
                const p = (predictions || []).find((x: any) => x.fixture_id === f.id) as
                  | PredictionRow
                  | undefined;

                const home = getTeam(f.home_team_id);
                const away = getTeam(f.away_team_id);

                return (
                  <Link
                    key={f.id}
                    href={`/match/${f.id}`}
                    className="rounded-2xl bg-white border border-slate-200 p-4 hover:shadow-lg transition"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {home?.name} vs {away?.name}
                        </div>
                        <div className="text-sm text-slate-500 mt-1">{formatDateTime(f.utc_date)}</div>
                      </div>

                      {p ? (
                        <div className="text-right">
                          <div className="text-sm font-semibold text-slate-900">
                            {outcomeLabel(p.predicted_result)}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
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
            <h2 className="text-2xl font-bold text-slate-900 mb-4">Recent Results</h2>
            <div className="grid gap-4">
              {results.map((f) => {
                const p = (predictions || []).find((x: any) => x.fixture_id === f.id) as
                  | PredictionRow
                  | undefined;

                const home = getTeam(f.home_team_id);
                const away = getTeam(f.away_team_id);

                const actual =
                  Number(f.home_score || 0) > Number(f.away_score || 0)
                    ? "HOME"
                    : Number(f.home_score || 0) < Number(f.away_score || 0)
                    ? "AWAY"
                    : "DRAW";

                const correct = p?.predicted_result === actual;

                return (
                  <Link
                    key={f.id}
                    href={`/match/${f.id}`}
                    className="rounded-2xl bg-white border border-slate-200 p-4 hover:shadow-lg transition"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {home?.name} vs {away?.name}
                        </div>
                        <div className="text-sm text-slate-500 mt-1">
                          {f.home_score ?? "-"} - {f.away_score ?? "-"}
                        </div>
                      </div>

                      {p ? (
                        <div className="text-right">
                          <div
                            className={`text-sm font-semibold ${
                              correct ? "text-emerald-600" : "text-rose-600"
                            }`}
                          >
                            {correct ? "✓ Correct" : "✗ Wrong"}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {outcomeLabel(p.predicted_result)}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
