import Link from "next/link";
import { notFound } from "next/navigation";
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
  home_team_id: string | null;
  away_team_id: string | null;
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
  input_snapshot?: any;
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
  clean_sheets?: number | null;
  failed_to_score?: number | null;
  btts_for?: number | null;
  over_25_for?: number | null;
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
    dateStyle: "full",
    timeStyle: "short",
  });
}

function formatPct(value?: number | null) {
  if (value == null) return "-";
  return `${Number(value).toFixed(1)}%`;
}

function formatNum(value?: number | null, decimals = 1) {
  if (value == null) return "-";
  return Number(value).toFixed(decimals);
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
  homeName = "Home",
  awayName = "Away"
) {
  const h = Number(home || 0);
  const a = Number(away || 0);
  const diff = h - a;

  if (Math.abs(diff) < 2) return "Even";
  if (diff > 0) return `${homeName} edge`;
  return `${awayName} edge`;
}

function barWidth(value?: number | null, max = 100) {
  const pct = Math.max(0, Math.min(100, (Number(value || 0) / max) * 100));
  return `${pct}%`;
}

function StatBar({
  label,
  value,
  max,
  color,
  decimals = 1,
}: {
  label: string;
  value?: number | null;
  max: number;
  color: string;
  decimals?: number;
}) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "12px",
          marginBottom: "4px",
        }}
      >
        <span>{label}</span>
        <strong>{formatNum(value, decimals)}</strong>
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
            width: barWidth(value, max),
            height: "100%",
            background: color,
          }}
        />
      </div>
    </div>
  );
}

export default async function MatchDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: fixture, error: fixtureError } = await supabase
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
    .eq("id", id)
    .single();

  if (fixtureError || !fixture) {
    notFound();
  }

  const typedFixture = fixture as FixtureRow;

  const { data: prediction } = await supabase
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
      input_snapshot
    `)
    .eq("fixture_id", id)
    .single();

  const teamIds = [typedFixture.home_team_id, typedFixture.away_team_id].filter(
    Boolean
  ) as string[];

  const { data: snapshotRows } = await supabase
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
      clean_sheets,
      failed_to_score,
      btts_for,
      over_25_for,
      team:team_id(name)
    `)
    .in("team_id", teamIds)
    .eq("league_code", "PL")
    .eq("season", 2025);

  const snapshots = (snapshotRows || []) as SnapshotRow[];
  const predictionRow = (prediction || null) as PredictionRow | null;

  const snapshotMap = new Map<string, SnapshotRow>();
  for (const row of snapshots) {
    snapshotMap.set(row.team_id, row);
  }

  const homeSnapshot = typedFixture.home_team_id
    ? snapshotMap.get(typedFixture.home_team_id)
    : undefined;
  const awaySnapshot = typedFixture.away_team_id
    ? snapshotMap.get(typedFixture.away_team_id)
    : undefined;

  const homeName = firstTeamName(typedFixture.home, "Home");
  const awayName = firstTeamName(typedFixture.away, "Away");

  const confidence = predictionRow?.confidence_label || predictionRow?.confidence || "Medium";
  const tone = confidenceTone(confidence);

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
  const defenceEdge = edgeLabel(
    homeSnapshot?.defence_score,
    awaySnapshot?.defence_score,
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
    <main
      style={{
        minHeight: "100vh",
        background: "#f5f7fb",
        padding: "32px 20px 56px",
        fontFamily: "Arial, sans-serif",
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ marginBottom: "18px" }}>
          <Link
            href="/"
            style={{
              display: "inline-block",
              textDecoration: "none",
              color: "#2563eb",
              fontWeight: 700,
            }}
          >
            ← Back to dashboard
          </Link>
        </div>

        <section
          style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 65%, #2563eb 100%)",
            color: "#ffffff",
            borderRadius: "28px",
            padding: "28px",
            boxShadow: "0 18px 40px rgba(15,23,42,0.18)",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "20px",
              flexWrap: "wrap",
              alignItems: "flex-start",
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-block",
                  padding: "6px 10px",
                  borderRadius: "999px",
                  background: "rgba(255,255,255,0.14)",
                  fontSize: "12px",
                  marginBottom: "12px",
                }}
              >
                Match details
              </div>

              <h1 style={{ margin: "0 0 8px", fontSize: "36px", lineHeight: 1.1 }}>
                {homeName} v {awayName}
              </h1>

              <p style={{ margin: 0, color: "#dbeafe", fontSize: "15px" }}>
                {formatDate(typedFixture.utc_date)}
              </p>
            </div>

            <div
              style={{
                background: tone.bg,
                color: tone.text,
                border: `1px solid ${tone.border}`,
                borderRadius: "999px",
                padding: "10px 14px",
                fontSize: "13px",
                fontWeight: 800,
              }}
            >
              {confidence} confidence
            </div>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 0.9fr",
            gap: "24px",
            alignItems: "start",
            marginBottom: "24px",
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
              Prediction Summary
            </h2>

            {predictionRow ? (
              <>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "14px",
                  }}
                >
                  <div
                    style={{
                      background: "#f9fafb",
                      borderRadius: "18px",
                      padding: "16px",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <div style={{ fontSize: "13px", color: "#6b7280", marginBottom: "8px" }}>
                      Predicted score
                    </div>
                    <div style={{ fontSize: "34px", fontWeight: 900, marginBottom: "8px" }}>
                      {formatNum(predictionRow.predicted_home_goals, 1)} -{" "}
                      {formatNum(predictionRow.predicted_away_goals, 1)}
                    </div>
                    <div style={{ fontSize: "14px", color: "#374151" }}>
                      Lean: <strong>{resultLabel(predictionRow.predicted_result)}</strong>
                    </div>
                    <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "8px" }}>
                      Model: <strong>{predictionRow.model_version || "-"}</strong>
                    </div>
                  </div>

                  <div
                    style={{
                      background: "#f9fafb",
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
                        <strong>{formatPct(predictionRow.home_win_pct)}</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Draw</span>
                        <strong>{formatPct(predictionRow.draw_pct)}</strong>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>{awayName}</span>
                        <strong>{formatPct(predictionRow.away_win_pct)}</strong>
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
                  {[strengthEdge, attackEdge, defenceEdge, formEdge].map((badge) => (
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

                <div
                  style={{
                    marginTop: "16px",
                    fontSize: "14px",
                    color: "#374151",
                    lineHeight: 1.6,
                    background: "#f9fafb",
                    borderRadius: "18px",
                    padding: "16px",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  {predictionRow.explanation || "No explanation available yet."}
                </div>
              </>
            ) : (
              <div style={{ color: "#6b7280" }}>No prediction found for this fixture yet.</div>
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
            <h2 style={{ marginTop: 0, marginBottom: "18px", fontSize: "24px" }}>
              Match Info
            </h2>

            <div style={{ display: "grid", gap: "12px", fontSize: "14px" }}>
              <div
                style={{
                  background: "#f9fafb",
                  borderRadius: "16px",
                  padding: "14px",
                  border: "1px solid #e5e7eb",
                }}
              >
                <div style={{ color: "#6b7280", marginBottom: "4px" }}>Fixture</div>
                <div style={{ fontWeight: 800 }}>
                  {homeName} v {awayName}
                </div>
              </div>

              <div
                style={{
                  background: "#f9fafb",
                  borderRadius: "16px",
                  padding: "14px",
                  border: "1px solid #e5e7eb",
                }}
              >
                <div style={{ color: "#6b7280", marginBottom: "4px" }}>Kick-off</div>
                <div style={{ fontWeight: 800 }}>{formatDate(typedFixture.utc_date)}</div>
              </div>

              <div
                style={{
                  background: "#f9fafb",
                  borderRadius: "16px",
                  padding: "14px",
                  border: "1px solid #e5e7eb",
                }}
              >
                <div style={{ color: "#6b7280", marginBottom: "4px" }}>Status</div>
                <div style={{ fontWeight: 800 }}>{typedFixture.status || "-"}</div>
              </div>

              <div
                style={{
                  background: "#f9fafb",
                  borderRadius: "16px",
                  padding: "14px",
                  border: "1px solid #e5e7eb",
                }}
              >
                <div style={{ color: "#6b7280", marginBottom: "4px" }}>Actual score</div>
                <div style={{ fontWeight: 800 }}>
                  {typedFixture.home_score ?? "-"} - {typedFixture.away_score ?? "-"}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "24px",
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
              {homeName} Snapshot
            </h2>

            {homeSnapshot ? (
              <>
                <StatBar label="Overall strength" value={homeSnapshot.overall_strength_score} max={100} color="#2563eb" />
                <StatBar label="Attack score" value={homeSnapshot.attack_score} max={200} color="#2563eb" />
                <StatBar label="Defence score" value={homeSnapshot.defence_score} max={200} color="#2563eb" />
                <StatBar label="Last 5 points" value={homeSnapshot.last_5_points} max={15} color="#2563eb" decimals={0} />

                <div
                  style={{
                    marginTop: "14px",
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: "10px",
                    fontSize: "14px",
                  }}
                >
                  <div>PPG: <strong>{formatNum(homeSnapshot.points_per_game, 2)}</strong></div>
                  <div>Home PPG: <strong>{formatNum(homeSnapshot.home_points_per_game, 2)}</strong></div>
                  <div>Clean sheets: <strong>{formatNum(homeSnapshot.clean_sheets, 0)}</strong></div>
                  <div>Failed to score: <strong>{formatNum(homeSnapshot.failed_to_score, 0)}</strong></div>
                  <div>BTTS: <strong>{formatNum(homeSnapshot.btts_for, 0)}</strong></div>
                  <div>Over 2.5: <strong>{formatNum(homeSnapshot.over_25_for, 0)}</strong></div>
                </div>
              </>
            ) : (
              <div style={{ color: "#6b7280" }}>No snapshot found.</div>
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
            <h2 style={{ marginTop: 0, marginBottom: "18px", fontSize: "24px" }}>
              {awayName} Snapshot
            </h2>

            {awaySnapshot ? (
              <>
                <StatBar label="Overall strength" value={awaySnapshot.overall_strength_score} max={100} color="#111827" />
                <StatBar label="Attack score" value={awaySnapshot.attack_score} max={200} color="#111827" />
                <StatBar label="Defence score" value={awaySnapshot.defence_score} max={200} color="#111827" />
                <StatBar label="Last 5 points" value={awaySnapshot.last_5_points} max={15} color="#111827" decimals={0} />

                <div
                  style={{
                    marginTop: "14px",
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: "10px",
                    fontSize: "14px",
                  }}
                >
                  <div>PPG: <strong>{formatNum(awaySnapshot.points_per_game, 2)}</strong></div>
                  <div>Away PPG: <strong>{formatNum(awaySnapshot.away_points_per_game, 2)}</strong></div>
                  <div>Clean sheets: <strong>{formatNum(awaySnapshot.clean_sheets, 0)}</strong></div>
                  <div>Failed to score: <strong>{formatNum(awaySnapshot.failed_to_score, 0)}</strong></div>
                  <div>BTTS: <strong>{formatNum(awaySnapshot.btts_for, 0)}</strong></div>
                  <div>Over 2.5: <strong>{formatNum(awaySnapshot.over_25_for, 0)}</strong></div>
                </div>
              </>
            ) : (
              <div style={{ color: "#6b7280" }}>No snapshot found.</div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
