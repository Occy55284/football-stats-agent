import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

type PageProps = {
  searchParams?: { competition?: string };
};

const COMPETITIONS = [
  { code: "PL", name: "Premier League" },
  { code: "ELC", name: "Championship" },
];

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export default async function Page({ searchParams }: PageProps) {
  const supabase = getSupabase();

  const competition = (searchParams?.competition || "PL").toUpperCase();

  const [{ data: fixtures }, { data: predictions }, { data: teams }] =
    await Promise.all([
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

  const teamMap = new Map();
  (teams || []).forEach((t: any) => teamMap.set(t.id, t));

  const now = new Date();

  const upcoming = (fixtures ||)
    .filter((f: any) => new Date(f.utc_date) > now)
    .slice(0, 8);

  const results = (fixtures ||)
    .filter((f: any) => f.status === "FINISHED")
    .slice(0, 8);

  const valuePicks = (predictions ||)
    .filter((p: any) => p.best_value_edge > 3)
    .sort((a: any, b: any) => b.best_value_edge - a.best_value_edge)
    .slice(0, 5);

  const getFixture = (id: string) =>
    (fixtures ||).find((f: any) => f.id === id);

  const getTeam = (id: string) => teamMap.get(id);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-900 to-blue-400 text-white p-6 rounded-xl mb-8">
        <h1 className="text-3xl font-bold">Pick Board</h1>
        <p className="opacity-80">
          {COMPETITIONS.find((c) => c.code === competition)?.name} picks,
          results and value bets
        </p>

        <div className="mt-4 flex gap-3">
          {COMPETITIONS.map((c) => (
            <Link
              key={c.code}
              href={`/?competition=${c.code}`}
              className={`px-4 py-2 rounded-full border ${
                competition === c.code
                  ? "bg-white text-black"
                  : "border-white/40"
              }`}
            >
              {c.name}
            </Link>
          ))}
        </div>
      </div>

      {/* VALUE PICKS */}
      <div className="mb-10">
        <h2 className="text-xl font-semibold mb-4">🔥 Value Picks</h2>

        <div className="grid md:grid-cols-2 gap-4">
          {valuePicks.map((p: any) => {
            const f = getFixture(p.fixture_id);
            if (!f) return null;

            const home = getTeam(f.home_team_id);
            const away = getTeam(f.away_team_id);

            return (
              <Link
                key={p.fixture_id}
                href={`/match/${p.fixture_id}`}
                className="p-4 rounded-lg border hover:shadow transition"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">
                      {home?.name} vs {away?.name}
                    </div>
                    <div className="text-sm opacity-60">
                      {new Date(f.utc_date).toLocaleString()}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm opacity-60">
                      {p.best_value_side}
                    </div>
                    <div className="text-lg font-bold text-green-600">
                      +{p.best_value_edge}%
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* UPCOMING */}
      <div className="mb-10">
        <h2 className="text-xl font-semibold mb-4">Upcoming Picks</h2>

        <div className="grid md:grid-cols-2 gap-4">
          {upcoming.map((f: any) => {
            const p = predictions?.find((x: any) => x.fixture_id === f.id);

            const home = getTeam(f.home_team_id);
            const away = getTeam(f.away_team_id);

            return (
              <Link
                key={f.id}
                href={`/match/${f.id}`}
                className="p-4 rounded-lg border hover:shadow transition"
              >
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">
                      {home?.name} vs {away?.name}
                    </div>
                    <div className="text-sm opacity-60">
                      {new Date(f.utc_date).toLocaleString()}
                    </div>
                  </div>

                  {p && (
                    <div className="text-right text-sm">
                      <div>{p.predicted_result}</div>
                      <div className="opacity-60">
                        {p.home_win_pct}% / {p.draw_pct}% / {p.away_win_pct}%
                      </div>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* RESULTS */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Recent Results</h2>

        <div className="grid md:grid-cols-2 gap-4">
          {results.map((f: any) => {
            const p = predictions?.find((x: any) => x.fixture_id === f.id);

            const home = getTeam(f.home_team_id);
            const away = getTeam(f.away_team_id);

            const actual =
              f.home_score > f.away_score
                ? "HOME"
                : f.home_score < f.away_score
                ? "AWAY"
                : "DRAW";

            const correct = p?.predicted_result === actual;

            return (
              <Link
                key={f.id}
                href={`/match/${f.id}`}
                className="p-4 rounded-lg border hover:shadow transition"
              >
                <div className="flex justify-between">
                  <div>
                    <div className="font-medium">
                      {home?.name} vs {away?.name}
                    </div>
                    <div className="text-sm opacity-60">
                      {f.home_score} - {f.away_score}
                    </div>
                  </div>

                  {p && (
                    <div
                      className={`text-sm font-medium ${
                        correct ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {correct ? "✓ Correct" : "✗ Wrong"}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
