import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type TeamRef = {
  name?: string | null;
};

type FixtureRow = {
  id: string;
  utc_date: string | null;
  status: string | null;
  home_score: number | null;
  away_score: number | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home?: TeamRef | TeamRef[] | null;
  away?: TeamRef | TeamRef[] | null;
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
  home_team_id?: string | null;
  away_team_id?: string | null;
  fixture?: {
    utc_date?: string | null;
    status?: string | null;
    home_team_id?: string | null;
    away_team_id?: string | null;
    home?: TeamRef | TeamRef[] | null;
    away?: TeamRef | TeamRef[] | null;
  } | null;
};

type TableRow = {
  position: number | null;
  points: number | null;
  played_games: number | null;
  goal_difference: number | null;
  team?: TeamRef | TeamRef[] | null;
};

type SnapshotRow = {
  team_id: string;
  points: number | null;
  points_per_game: number | null;
  last_5_points: number | null;
  attack_score: number | null;
  defence_score: number | null;
  overall_strength_score: number | null;
  home_points_per_game?: number | null;
  away_points_per_game?: number | null;
  team?: TeamRef | TeamRef[] | null;
};

function firstTeamName(input?: TeamRef | TeamRef[] | null, fallback = "-") {
  if (!input) return fallback;
  if (Array.isArray(input)) return input[0]?.name || fallback;
  return input.name || fallback;
}

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

function formatOneDecimal(value?: number | null) {
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

function edgeLabel(
  home?: number | null,
  away?: number | null,
  stronger = "Home",
  weaker = "Away"
) {
  const h = Number(home || 0);
  const a = Number(away || 0);
  const diff = h - a;

  if (Math.abs(diff) < 2) return "Even";
  if (diff > 0) return `${stronger} edge`;
  return `${weaker} edge`;
}

function metricBarWidth(value?: number | null, max = 100) {
  const pct = Math.max(0, Math.min(100, (Number(value || 0) / max) * 100));
  return `${pct}%`;
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
          home_team_id,
          away_team_id,
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
          home_team_id,
          away_team_id,
          fixture:fixture_id(
            utc_date,
            status,
            home_team_id,
            away_team_id,
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
          home_points_per_game,
          away_points_per_game,
          team:team_id(name)
        `)
        .eq("league_code", "PL")
        .eq("season", 2025)
        .order("overall_strength_score", { ascending: false })
        .limit(20),
    ]);

  const typedFixtures = (fixtures || []) as FixtureRow[];
  const typedPredictions = (predictions || []) as PredictionRow[];
  const typedTable = (table || []) as TableRow[];
  const typedSnapshots = (snapshots || []) as SnapshotRow[];

  const snapshotMap = new Map<string, SnapshotRow>();
  for (const row of typedSnapshots) {
    snapshotMap.set(row.team_id, row);
  }

  const strongestTeam = firstTeamName(typedSnapshots[0]?.team, "-");
  const highConfidenceCount = typedPredictions.filter(
    (p) => (p.confidence_label || p.confidence) === "High"
  ).length;
  const avgConfidence =
    typedPredictions.length > 0
      ? typedPredictions.reduce((sum, p) => sum + Number(p.confidence_score || 0), 0) /
        typedPredictions.length
      : 0;
  const avgHomeWinPct =
    typedPredictions.length > 0
      ? typedPredictions.reduce((sum, p) => sum + Number(p.home_win_pct || 0), 0) /
        typedPredictions.length
      : 0;

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
              alignItems: "flex-start",
            }}
          >
            <div style={{ maxWidth: "760px" }}>
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
                Premier League • Snapshot model active
              </div>

              <h1 style={{ margin: "0 0 8px", fontSize: "38px", lineHeight: 1.1 }}>
                Football Stats Agent
              </h1>

              <p style={{ margin: 0, color: "#dbeafe", fontSize: "15px", lineHeight: 1.6 }}>
                AI-driven match projections using fixture data, standings, team form,
                snapshot strength scores, and home-v-away performance splits.
              </p>
            </div>

            <div
              style={{
                minWidth: "260px",
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.16)",
                borderRadius: "20px",
                padding: "18px",
              }}
            >
              <div style={{ fontSize: "12px", color: "#bfdbfe", marginBottom: "6px" }}>
                Strongest team by snapshot
              </div>
              <div style={{ fontSize: "28px", fontWeight: 800, marginBottom: "8px" }}>
                {strongestTeam}
              </div>
              <div style={{ fontSize: "12px", color: "#dbeafe" }}>
                Ranked by overall strength score
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
              label: "Upcoming fixtures",
              value: typedFixtures.length,
              sub: "Next scheduled matches",
            },
            {
              label: "Predictions loaded",
              value: typedPredictions.length,
              sub: "Latest model outputs",
            },
            {
              label: "High-confidence picks",
              value: highConfidenceCount,
              sub: "Current visible set",
            },
            {
              label: "Avg confidence score",
              value: avgConfidence ? avgConfidence.toFixed(2) : "0.00",
              sub: "Across visible predictions",
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
                border: "1px solid #e5e7eb",
                boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
              }}
            >
              <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "8px" }}>
                {card.label}
              </div>
              <div style={{ fontSize: "30px", fontWeight: 800, marginBottom: "4px" }}>
                {card.value}
              </div>
              <div style={{ fontSize: "12px", color: "#9ca3af" }}>{card.sub}</div>
            </div>
          ))}
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
              Latest Predictions
            </h2>

            <div style={{ display: "grid", gap: "16px" }}>
              {typedPredictions.map((prediction, index) => {
                const confidence = prediction.confidence_label || prediction.confidence || "Medium";
                const tone = confidenceTone(confidence);

                const homeName = firstTeamName(prediction.fixture?.home, "Home");
                const awayName = firstTeamName(prediction.fixture?.away, "Away");

                const homeId = prediction.home_team_id || prediction.fixture?.home_team_id || null;
                const awayId = prediction.away_team_id || prediction.fixture?.away_team_id || null;

                const homeSnapshot = homeId ? snapshotMap.get(homeId) : undefined;
                const awaySnapshot = awayId ? snapshotMap.get(awayId) : undefined;

                const strengthEdge = edgeLabel(
                  homeSnapshot?.overall_strength_score,
                  awaySnapshot?.overall_strength_score,
                  homeName,
                  awayName
                );

                const attackEdge = edgeLabel(
                  homeSnapshot?.attack_score,
                  awaySnapshot?.attack_score,
                  homeName,
                  awayName
                );

                const formEdge = edgeLabel(
                  homeSnapshot?.last_5_points,
                  awaySnapshot?.last_5_points,
                  homeName,
                  awayName
                );

                return (
                  <Link
                    key={`${prediction.fixture_id || index}-${index}`}
                    href={prediction.fixture_id ? `/match/${prediction.fixture_id}` : "#"}
                    style={{
                      textDecoration: "none",
                      color: "inherit",
                      display: "block",
                    }}
                  >
                    <div
                      style={{
                        padding: "18px",
                        borderRadius: "22px",
                        background: "#f9fafb",
                        border: "1px solid #e5e7eb",
                        transition: "transform 0.15s ease, box-shadow 0.15s ease",
                        boxShadow: "0 2px 8px rgba(15,23,42,0.03)",
                        cursor: prediction.fixture_id ? "pointer" : "default",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "12px",
                          alignItems: "flex-start",
                          flexWrap: "wrap",
                          marginBottom: "14px",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "20px", fontWeight: 800, marginBottom: "5px" }}>
                            {homeName} v {awayName}
                          </div>
                          <div style={{ fontSize: "14px", color: "#6b7280" }}>
                            {formatDate(prediction.fixture?.utc_date)}
                          </div>
                        </div>

                        <div
                          style={{
                            background: tone.bg,
                            color: tone.text,
                            border: `1px solid ${tone.border}`,
                            borderRadius: "999px",
                            padding: "8px 12px",
                            fontSize: "12px",
                            fontWeight: 800,
                          }}
                        >
                          {confidence} confidence
                        </div>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "14px",
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
                          <div style={{ fontSize: "32px", fontWeight: 900, marginBottom: "8px" }}>
                            {formatOneDecimal(prediction.predicted_home_goals)} -{" "}
                            {formatOneDecimal(prediction.predicted_away_goals)}
                          </div>
                          <div style={{ fontSize: "14px", color: "#374151" }}>
                            Lean: <strong>{resultLabel(prediction.predicted_result)}</strong>
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
                              <span>{homeName}</span>
                              <strong>{formatPct(prediction.home_win_pct)}</strong>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span>Draw</span>
                              <strong>{formatPct(prediction.draw_pct)}</strong>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span>{awayName}</span>
                              <strong>{formatPct(prediction.away_win_pct)}</strong>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: "10px",
                          flexWrap: "wrap",
                          marginTop: "14px",
                        }}
                      >
                        {[strengthEdge, attackEdge, formEdge].map((badge) => (
                          <div
                            key={badge}
                            style={{
                              background: "#eff6ff",
                              color: "#1d4ed8",
                              border: "1px solid #bfdbfe",
                              borderRadius: "999px",
                              padding: "7px 10px",
                              fontSize: "12px",
                              fontWeight: 700,
                            }}
                          >
                            {badge}
                          </div>
                        ))}
                      </div>

                      {(homeSnapshot || awaySnapshot) && (
                        <div
                          style={{
                            marginTop: "16px",
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: "14px",
                          }}
                        >
                          <div
                            style={{
                              background: "#ffffff",
                              borderRadius: "18px",
                              padding: "14px",
                              border: "1px solid #e5e7eb",
                            }}
                          >
                            <div style={{ fontWeight: 800, marginBottom: "10px" }}>{homeName}</div>

                            {[
                              ["Strength", homeSnapshot?.overall_strength_score, 100],
                              ["Attack", homeSnapshot?.attack_score, 200],
                              ["Defence", homeSnapshot?.defence_score, 200],
                              ["Form", homeSnapshot?.last_5_points, 15],
                            ].map(([label, value, max]) => (
                              <div key={String(label)} style={{ marginBottom: "10px" }}>
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    fontSize: "12px",
                                    marginBottom: "4px",
                                  }}
                                >
                                  <span>{label}</span>
                                  <strong>{Number(value || 0).toFixed(label === "Form" ? 0 : 1)}</strong>
                                </div>
                                <div
                                  style={{
                                    height: "8px",
                                    background: "#e5e7eb",
                                    borderRadius: "999px",
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      width: metricBarWidth(value as number, max as number),
                                      height: "100%",
                                      background: "#2563eb",
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>

                          <div
                            style={{
                              background: "#ffffff",
                              borderRadius: "18px",
                              padding: "14px",
                              border: "1px solid #e5e7eb",
                            }}
                          >
                            <div style={{ fontWeight: 800, marginBottom: "10px" }}>{awayName}</div>

                            {[
                              ["Strength", awaySnapshot?.overall_strength_score, 100],
                              ["Attack", awaySnapshot?.attack_score, 200],
                              ["Defence", awaySnapshot?.defence_score, 200],
                              ["Form", awaySnapshot?.last_5_points, 15],
                            ].map(([label, value, max]) => (
                              <div key={String(label)} style={{ marginBottom: "10px" }}>
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    fontSize: "12px",
                                    marginBottom: "4px",
                                  }}
                                >
                                  <span>{label}</span>
                                  <strong>{Number(value || 0).toFixed(label === "Form" ? 0 : 1)}</strong>
                                </div>
                                <div
                                  style={{
                                    height: "8px",
                                    background: "#e5e7eb",
                                    borderRadius: "999px",
                                    overflow: "hidden",
                                  }}
                                >
                                  <div
                                    style={{
                                      width: metricBarWidth(value as number, max as number),
                                      height: "100%",
                                      background: "#111827",
                                    }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div
                        style={{
                          marginTop: "14px",
                          fontSize: "14px",
                          color: "#374151",
                          lineHeight: 1.55,
                        }}
                      >
                        {prediction.explanation || "No explanation available yet."}
                      </div>
                    </div>
                  </Link>
                );
              })}

              {typedPredictions.length === 0 && (
                <div style={{ color: "#6b7280" }}>No predictions found.</div>
              )}
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
                Top Strength Scores
              </h2>

              <div style={{ display: "grid", gap: "12px" }}>
                {typedSnapshots.slice(0, 5).map((row, index) => (
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
                        gap: "10px",
                        alignItems: "center",
                        marginBottom: "8px",
                      }}
                    >
                      <div style={{ fontWeight: 800 }}>
                        {firstTeamName(row.team, "Team")}
                      </div>
                      <div
                        style={{
                          background: "#111827",
                          color: "#fff",
                          borderRadius: "999px",
                          padding: "5px 9px",
                          fontSize: "12px",
                          fontWeight: 700,
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
                        fontSize: "13px",
                        color: "#374151",
                      }}
                    >
                      <div>
                        Strength: <strong>{Number(row.overall_strength_score || 0).toFixed(1)}</strong>
                      </div>
                      <div>
                        Form: <strong>{Number(row.last_5_points || 0).toFixed(0)}/15</strong>
                      </div>
                      <div>
                        Attack: <strong>{Number(row.attack_score || 0).toFixed(1)}</strong>
                      </div>
                      <div>
                        Defence: <strong>{Number(row.defence_score || 0).toFixed(1)}</strong>
                      </div>
                    </div>
                  </div>
                ))}

                {typedSnapshots.length === 0 && (
                  <div style={{ color: "#6b7280" }}>No snapshot rows found.</div>
                )}
              </div>
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
              <h2 style={{ marginTop: 0, marginBottom: "18px", fontSize: "24px" }}>
                Upcoming Fixtures
              </h2>

              <div style={{ display: "grid", gap: "12px" }}>
                {typedFixtures.map((fixture) => (
                  <div
                    key={fixture.id}
                    style={{
                      padding: "14px 16px",
                      borderRadius: "18px",
                      background: "#f9fafb",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: "6px" }}>
                      {firstTeamName(fixture.home, "Home")} v {firstTeamName(fixture.away, "Away")}
                    </div>
                    <div style={{ fontSize: "13px", color: "#6b7280" }}>
                      {formatDate(fixture.utc_date)}
                    </div>
                  </div>
                ))}

                {typedFixtures.length === 0 && (
                  <div style={{ color: "#6b7280" }}>No upcoming fixtures found.</div>
                )}
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            background: "#ffffff",
            borderRadius: "24px",
            padding: "22px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
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
                    key={`${firstTeamName(row.team, "team")}-${index}`}
                    style={{ borderBottom: "1px solid #f3f4f6" }}
                  >
                    <td style={{ padding: "12px 8px" }}>{row.position ?? "-"}</td>
                    <td style={{ padding: "12px 8px", fontWeight: 700 }}>
                      {firstTeamName(row.team, "-")}
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
