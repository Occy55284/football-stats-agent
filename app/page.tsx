import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type FixtureRow = {
  id: string;
  utc_date: string;
  status: string | null;
  home_score: number | null;
  away_score: number | null;
  home?: { name?: string | null } | null;
  away?: { name?: string | null } | null;
};

type PredictionRow = {
  fixture_id: string | null;
  predicted_home_goals: number | null;
  predicted_away_goals: number | null;
  predicted_result: string | null;
  confidence: string | null;
  confidence_label: string | null;
  confidence_score: number | null;
  home_win_pct: number | null;
  draw_pct: number | null;
  away_win_pct: number | null;
  explanation: string | null;
  model_version: string | null;
  fixture?: {
    utc_date?: string | null;
    status?: string | null;
    home?: { name?: string | null } | null;
    away?: { name?: string | null } | null;
  } | null;
};

type TableRow = {
  position: number | null;
  points: number | null;
  played_games: number | null;
  goal_difference: number | null;
  team?: { name?: string | null } | null;
};

type SnapshotRow = {
  team_id: string;
  points: number | null;
  points_per_game: number | null;
  last_5_points: number | null;
  attack_score: number | null;
  defence_score: number | null;
  overall_strength_score: number | null;
  team?: { name?: string | null } | null;
};

function formatDate(value?: string | null) {
  if (!value) return "TBC";
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatPct(value?: number | null) {
  if (value == null) return "-";
  return `${Number(value).toFixed(1)}%`;
}

function formatScore(value?: number | null) {
  if (value == null) return "-";
  return Number(value).toFixed(1);
}

function resultLabel(value?: string | null) {
  if (value === "HOME") return "Home win";
  if (value === "AWAY") return "Away win";
  if (value === "DRAW") return "Draw";
  return value || "-";
}

function confidenceTone(value?: string | null) {
  if (value === "High") return "#d1fae5";
  if (value === "Low") return "#fee2e2";
  return "#fef3c7";
}

export default async function HomePage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date().toISOString();

  const [{ data: fixtures }, { data: predictions }, { data: table }, { data: snapshots }] =
    await Promise.all([
      supabase
        .from("fixtures")
        .select(`
          id,
          utc_date,
          status,
          home_score,
          away_score,
          home:home_team_id(name),
          away:away_team_id(name)
        `)
        .eq("league_code", "PL")
        .eq("season", 2025)
        .gte("utc_date", now)
        .order("utc_date", { ascending: true })
        .limit(8),

      supabase
        .from("predictions")
        .select(`
          fixture_id,
          predicted_home_goals,
          predicted_away_goals,
          predicted_result,
          confidence,
          confidence_label,
          confidence_score,
          home_win_pct,
          draw_pct,
          away_win_pct,
          explanation,
          model_version,
          fixture:fixture_id(
            utc_date,
            status,
            home:home_team_id(name),
            away:away_team_id(name)
          )
        `)
        .eq("league_code", "PL")
        .eq("season", 2025)
        .order("updated_at", { ascending: false })
        .limit(8),

      supabase
        .from("standings")
        .select(`
          position,
          points,
          played_games,
          goal_difference,
          team:team_id(name)
        `)
        .eq("league_code", "PL")
        .eq("season", 2025)
        .order("position", { ascending: true })
        .limit(10),

      supabase
        .from("team_stats_snapshot")
        .select(`
          team_id,
          points,
          points_per_game,
          last_5_points,
          attack_score,
          defence_score,
          overall_strength_score,
          team:team_id(name)
        `)
        .eq("league_code", "PL")
        .eq("season", 2025)
        .order("overall_strength_score", { ascending: false })
        .limit(5),
    ]);

  const typedFixtures = (fixtures || []) as FixtureRow[];
  const typedPredictions = (predictions || []) as PredictionRow[];
  const typedTable = (table || []) as TableRow[];
  const typedSnapshots = (snapshots || []) as SnapshotRow[];

  const highConfidenceCount = typedPredictions.filter(
    (p) => (p.confidence_label || p.confidence) === "High"
  ).length;

  const avgHomeWinPct =
    typedPredictions.length > 0
      ? typedPredictions.reduce((sum, p) => sum + Number(p.home_win_pct || 0), 0) /
        typedPredictions.length
      : 0;

  const strongestTeam = typedSnapshots[0]?.team?.name || "-";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f7f8fc",
        padding: "32px 20px 60px",
        fontFamily: "Arial, sans-serif",
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <section
          style={{
            background: "linear-gradient(135deg, #111827 0%, #1f2937 100%)",
            color: "#ffffff",
            borderRadius: "24px",
            padding: "28px",
            boxShadow: "0 12px 30px rgba(17,24,39,0.18)",
            marginBottom: "26px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "20px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-block",
                  padding: "6px 10px",
                  borderRadius: "999px",
                  background: "rgba(255,255,255,0.12)",
                  fontSize: "12px",
                  letterSpacing: "0.4px",
                  marginBottom: "10px",
                }}
              >
                Premier League • 2025 season model
              </div>
              <h1 style={{ margin: "0 0 8px", fontSize: "34px" }}>
                Football Stats Agent ⚽
              </h1>
              <p style={{ margin: 0, color: "#d1d5db", maxWidth: "760px" }}>
                Live fixtures, upgraded AI predictions, strength scores, and a
                cleaner league view powered by snapshots.
              </p>
            </div>

            <div
              style={{
                minWidth: "230px",
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "18px",
                padding: "16px",
              }}
            >
              <div style={{ fontSize: "12px", color: "#d1d5db", marginBottom: "6px" }}>
                Strongest snapshot team
              </div>
              <div style={{ fontSize: "24px", fontWeight: 700 }}>{strongestTeam}</div>
              <div style={{ fontSize: "12px", color: "#d1d5db", marginTop: "8px" }}>
                Based on overall strength score
              </div>
            </div>
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
          {[
            {
              label: "Upcoming fixtures shown",
              value: typedFixtures.length,
              sub: "Next scheduled matches",
            },
            {
              label: "Predictions loaded",
              value: typedPredictions.length,
              sub: "Latest prediction rows",
            },
            {
              label: "High-confidence picks",
              value: highConfidenceCount,
              sub: "Current visible set",
            },
            {
              label: "Avg home-win probability",
              value: `${avgHomeWinPct.toFixed(1)}%`,
              sub: "Across visible predictions",
            },
          ].map((card) => (
            <div
              key={card.label}
              style={{
                background: "#ffffff",
                borderRadius: "20px",
                padding: "18px",
                boxShadow: "0 8px 20px rgba(15,23,42,0.06)",
                border: "1px solid #e5e7eb",
              }}
            >
              <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "8px" }}>
                {card.label}
              </div>
              <div style={{ fontSize: "30px", fontWeight: 700, marginBottom: "4px" }}>
                {card.value}
              </div>
              <div style={{ fontSize: "12px", color: "#9ca3af" }}>{card.sub}</div>
            </div>
          ))}
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr",
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
              boxShadow: "0 8px 20px rgba(15,23,42,0.06)",
              border: "1px solid #e5e7eb",
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: "18px", fontSize: "24px" }}>
              Upcoming Fixtures
            </h2>

            <div style={{ display: "grid", gap: "14px" }}>
              {typedFixtures.map((fixture) => (
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
                    <div style={{ fontSize: "17px", fontWeight: 700 }}>
                      {fixture.home?.name || "Home"} v {fixture.away?.name || "Away"}
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#374151",
                        background: "#e5e7eb",
                        borderRadius: "999px",
                        padding: "6px 10px",
                      }}
                    >
                      {fixture.status || "Scheduled"}
                    </div>
                  </div>

                  <div style={{ marginTop: "8px", fontSize: "14px", color: "#6b7280" }}>
                    {formatDate(fixture.utc_date)}
                  </div>
                </div>
              ))}

              {typedFixtures.length === 0 && (
                <div style={{ color: "#6b7280" }}>No upcoming fixtures found.</div>
              )}
            </div>
          </div>

          <div
            style={{
              background: "#ffffff",
              borderRadius: "24px",
              padding: "22px",
              boxShadow: "0 8px 20px rgba(15,23,42,0.06)",
              border: "1px solid #e5e7eb",
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: "18px", fontSize: "24px" }}>
              Top Strength Scores
            </h2>

            <div style={{ display: "grid", gap: "12px" }}>
              {typedSnapshots.map((row, index) => (
                <div
                  key={`${row.team_id}-${index}`}
                  style={{
                    padding: "14px 16px",
                    borderRadius: "18px",
                    background: index === 0 ? "#eef2ff" : "#f9fafb",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>{row.team?.name || "Team"}</div>
                    <div
                      style={{
                        fontSize: "12px",
                        borderRadius: "999px",
                        padding: "5px 9px",
                        background: "#111827",
                        color: "#fff",
                      }}
                    >
                      #{index + 1}
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: "8px",
                      marginTop: "10px",
                      fontSize: "13px",
                      color: "#374151",
                    }}
                  >
                    <div>Strength: <strong>{row.overall_strength_score ?? 0}</strong></div>
                    <div>Form: <strong>{row.last_5_points ?? 0}/15</strong></div>
                    <div>Attack: <strong>{row.attack_score ?? 0}</strong></div>
                    <div>Defence: <strong>{row.defence_score ?? 0}</strong></div>
                  </div>
                </div>
              ))}

              {typedSnapshots.length === 0 && (
                <div style={{ color: "#6b7280" }}>No snapshot rows found.</div>
              )}
            </div>
          </div>
        </section>

        <section
          style={{
            background: "#ffffff",
            borderRadius: "24px",
            padding: "22px",
            boxShadow: "0 8px 20px rgba(15,23,42,0.06)",
            border: "1px solid #e5e7eb",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: "18px",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "24px" }}>Latest Predictions</h2>
            <div style={{ fontSize: "13px", color: "#6b7280" }}>
              Model currently writing richer snapshot-driven outputs
            </div>
          </div>

          <div style={{ display: "grid", gap: "14px" }}>
            {typedPredictions.map((prediction, index) => {
              const confidence = prediction.confidence_label || prediction.confidence || "Medium";

              return (
                <div
                  key={`${prediction.fixture_id || index}-${index}`}
                  style={{
                    padding: "18px",
                    borderRadius: "20px",
                    background: "#f9fafb",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      alignItems: "flex-start",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "18px", fontWeight: 700, marginBottom: "6px" }}>
                        {prediction.fixture?.home?.name || "Home"} v{" "}
                        {prediction.fixture?.away?.name || "Away"}
                      </div>
                      <div style={{ fontSize: "14px", color: "#6b7280" }}>
                        {formatDate(prediction.fixture?.utc_date)}
                      </div>
                    </div>

                    <div
                      style={{
                        background: confidenceTone(confidence),
                        color: "#111827",
                        borderRadius: "999px",
                        padding: "8px 12px",
                        fontSize: "12px",
                        fontWeight: 700,
                      }}
                    >
                      {confidence} confidence
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.2fr 1fr",
                      gap: "16px",
                      marginTop: "16px",
                    }}
                  >
                    <div
                      style={{
                        background: "#ffffff",
                        borderRadius: "18px",
                        padding: "16px",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "8px" }}>
                        Predicted score
                      </div>
                      <div style={{ fontSize: "30px", fontWeight: 800, marginBottom: "8px" }}>
                        {formatScore(prediction.predicted_home_goals)} -{" "}
                        {formatScore(prediction.predicted_away_goals)}
                      </div>
                      <div style={{ fontSize: "14px", color: "#374151" }}>
                        Result lean: <strong>{resultLabel(prediction.predicted_result)}</strong>
                      </div>
                      <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "8px" }}>
                        Model: <strong>{prediction.model_version || "-"}</strong>
                      </div>
                    </div>

                    <div
                      style={{
                        background: "#ffffff",
                        borderRadius: "18px",
                        padding: "16px",
                        border: "1px solid #e5e7eb",
                      }}
                    >
                      <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "10px" }}>
                        Win probabilities
                      </div>

                      <div style={{ display: "grid", gap: "10px", fontSize: "14px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>Home</span>
                          <strong>{formatPct(prediction.home_win_pct)}</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>Draw</span>
                          <strong>{formatPct(prediction.draw_pct)}</strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>Away</span>
                          <strong>{formatPct(prediction.away_win_pct)}</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "14px",
                      fontSize: "14px",
                      color: "#374151",
                      lineHeight: 1.5,
                    }}
                  >
                    {prediction.explanation || "No explanation available yet."}
                  </div>
                </div>
              );
            })}

            {typedPredictions.length === 0 && (
              <div style={{ color: "#6b7280" }}>No predictions found.</div>
            )}
          </div>
        </section>

        <section
          style={{
            background: "#ffffff",
            borderRadius: "24px",
            padding: "22px",
            boxShadow: "0 8px 20px rgba(15,23,42,0.06)",
            border: "1px solid #e5e7eb",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: "18px", fontSize: "24px" }}>
            Premier League Table
          </h2>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
              }}
            >
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "2px solid #e5e7eb" }}>
                  <th style={{ padding: "10px 8px" }}>#</th>
                  <th style={{ padding: "10px 8px" }}>Team</th>
                  <th style={{ padding: "10px 8px" }}>P</th>
                  <th style={{ padding: "10px 8px" }}>Pts</th>
                  <th style={{ padding: "10px 8px" }}>GD</th>
                </tr>
              </thead>
              <tbody>
                {typedTable.map((row, index) => (
                  <tr
                    key={`${row.team?.name || "team"}-${index}`}
                    style={{ borderBottom: "1px solid #f0f0f0" }}
                  >
                    <td style={{ padding: "12px 8px" }}>{row.position ?? "-"}</td>
                    <td style={{ padding: "12px 8px", fontWeight: 700 }}>
                      {row.team?.name || "-"}
                    </td>
                    <td style={{ padding: "12px 8px" }}>{row.played_games ?? "-"}</td>
                    <td style={{ padding: "12px 8px" }}>{row.points ?? "-"}</td>
                    <td style={{ padding: "12px 8px" }}>{row.goal_difference ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
