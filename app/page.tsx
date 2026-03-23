import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type TeamRef = {
  name?: string | null;
  crest?: string | null;
};

type PredictionRow = {
  fixture_id: string | null;
  predicted_result: string | null;
  confidence: string | null;
  confidence_label: string | null;
  confidence_score: number | null;
  home_win_pct: number | null;
  draw_pct: number | null;
  away_win_pct: number | null;
  predicted_home_goals: number | null;
  predicted_away_goals: number | null;
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

type SnapshotRow = {
  team_id: string;
  last_5_points: number | null;
  overall_strength_score: number | null;
  home_points_per_game?: number | null;
  away_points_per_game?: number | null;
};

type PickCard = {
  fixtureId: string;
  homeName: string;
  awayName: string;
  homeCrest?: string | null;
  awayCrest?: string | null;
  kickOff: string | null;
  bestAngle: string;
  confidenceLabel: string;
  confidenceScore: number;
  sortScore: number;
};

function firstTeam(input?: TeamRef | TeamRef[] | null) {
  if (!input) return { name: "-", crest: null };
  if (Array.isArray(input)) {
    return {
      name: input[0]?.name || "-",
      crest: input[0]?.crest || null,
    };
  }
  return {
    name: input.name || "-",
    crest: input.crest || null,
  };
}

function numberValue(value?: number | null) {
  return Number(value || 0);
}

function formatDate(value?: string | null) {
  if (!value) return "TBC";
  return new Date(value).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function shortConfidenceLabel(value?: string | null, score?: number | null) {
  if (value === "High") return "High";
  if (value === "Low") return "Low";
  if (value === "Medium") return "Medium";

  const n = numberValue(score);
  if (n >= 75) return "High";
  if (n >= 58) return "Medium";
  return "Low";
}

function confidenceTone(value?: string | null) {
  if (value === "High") {
    return {
      bg: "linear-gradient(135deg, #dcfce7, #bbf7d0)",
      text: "#065f46",
      border: "#34d399",
      shadow: "0 0 0 2px rgba(16,185,129,0.12)",
      pillBg: "#10b981",
      pillText: "#ffffff",
    };
  }
  if (value === "Low") {
    return {
      bg: "linear-gradient(135deg, #fee2e2, #fecaca)",
      text: "#7f1d1d",
      border: "#f87171",
      shadow: "0 0 0 2px rgba(239,68,68,0.12)",
      pillBg: "#ef4444",
      pillText: "#ffffff",
    };
  }
  return {
    bg: "linear-gradient(135deg, #fef3c7, #fde68a)",
    text: "#78350f",
    border: "#fbbf24",
    shadow: "0 0 0 2px rgba(245,158,11,0.12)",
    pillBg: "#f59e0b",
    pillText: "#ffffff",
  };
}

function buildBestAngle(
  prediction: PredictionRow,
  homeName: string,
  awayName: string,
  homeSnapshot?: SnapshotRow,
  awaySnapshot?: SnapshotRow
) {
  const homeWin = numberValue(prediction.home_win_pct);
  const draw = numberValue(prediction.draw_pct);
  const awayWin = numberValue(prediction.away_win_pct);

  const homeNonLose = homeWin + draw;
  const awayNonLose = awayWin + draw;

  const homeStrength = numberValue(homeSnapshot?.overall_strength_score);
  const awayStrength = numberValue(awaySnapshot?.overall_strength_score);

  if (prediction.predicted_result === "HOME") {
    if (homeWin >= 58 && homeStrength >= awayStrength) return `${homeName} win`;
    if (homeNonLose >= 70) return `${homeName} or Draw`;
    return "Home lean";
  }

  if (prediction.predicted_result === "AWAY") {
    if (awayWin >= 58 && awayStrength >= homeStrength) return `${awayName} win`;
    if (awayNonLose >= 70) return `${awayName} or Draw`;
    return `${awayName} or Draw`;
  }

  if (draw >= 30) return "Draw lean";
  return "Tight match";
}

function buildSortScore(
  prediction: PredictionRow,
  homeSnapshot?: SnapshotRow,
  awaySnapshot?: SnapshotRow
) {
  const homeWin = numberValue(prediction.home_win_pct);
  const draw = numberValue(prediction.draw_pct);
  const awayWin = numberValue(prediction.away_win_pct);

  const biggestOutcome = Math.max(homeWin, draw, awayWin);
  const secondOutcome = [homeWin, draw, awayWin].sort((a, b) => b - a)[1] || 0;
  const edge = biggestOutcome - secondOutcome;

  const confidenceBase =
    numberValue(prediction.confidence_score) ||
    (prediction.confidence_label === "High"
      ? 76
      : prediction.confidence_label === "Low"
        ? 46
        : 61);

  const homeStrength = numberValue(homeSnapshot?.overall_strength_score);
  const awayStrength = numberValue(awaySnapshot?.overall_strength_score);
  const strengthGap = Math.abs(homeStrength - awayStrength);

  const homeForm = numberValue(homeSnapshot?.last_5_points);
  const awayForm = numberValue(awaySnapshot?.last_5_points);
  const formGap = Math.abs(homeForm - awayForm);

  let score = confidenceBase;
  score += edge * 1.15;
  score += Math.min(strengthGap, 14) * 1.25;
  score += Math.min(formGap, 6) * 1.5;

  if (prediction.predicted_result === "DRAW") score -= 10;
  if (draw >= 30) score -= 4;
  if (biggestOutcome < 45) score -= 8;

  return score;
}

function TeamBadge({
  name,
  crest,
  align,
}: {
  name: string;
  crest?: string | null;
  align: "left" | "right";
}) {
  const initials = name
    .split(" ")
    .map((part) => part[0] || "")
    .join("")
    .slice(0, 3)
    .toUpperCase();

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: align === "left" ? "flex-start" : "flex-end",
        gap: "8px",
        minWidth: "150px",
      }}
    >
      <div
        style={{
          fontSize: "13px",
          color: "#64748b",
          fontWeight: 700,
        }}
      >
        {align === "left" ? "Home" : "Away"}
      </div>

      <div
        style={{
          width: 110,
          height: 110,
          borderRadius: "24px",
          border: "1px solid #cbd5e1",
          background: "linear-gradient(180deg, #ffffff 0%, #eef2f7 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          boxShadow: "0 10px 24px rgba(15,23,42,0.08)",
        }}
      >
        {crest ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={crest}
            alt={name}
            style={{
              width: 72,
              height: 72,
              objectFit: "contain",
            }}
          />
        ) : (
          <div
            style={{
              width: 74,
              height: 74,
              borderRadius: "999px",
              background: "linear-gradient(135deg, #dbeafe, #c7d2fe)",
              color: "#1e3a8a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
              fontWeight: 800,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
            }}
          >
            {initials}
          </div>
        )}
      </div>

      <div
        style={{
          fontSize: "18px",
          fontWeight: 800,
          color: "#0f172a",
          textAlign: align === "left" ? "left" : "right",
          maxWidth: 140,
          lineHeight: 1.2,
        }}
      >
        {name}
      </div>
    </div>
  );
}

function MatchBoardCard({ card }: { card: PickCard }) {
  const tone = confidenceTone(card.confidenceLabel);

  return (
    <Link
      href={`/match/${card.fixtureId}`}
      style={{
        textDecoration: "none",
        color: "inherit",
        display: "block",
      }}
    >
      <div
        style={{
          background: "linear-gradient(135deg, #ffffff 0%, #f8fbff 55%, #eef4ff 100%)",
          borderRadius: "28px",
          border: "1px solid #dbe4f0",
          padding: "22px",
          boxShadow: "0 14px 32px rgba(15,23,42,0.08)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 190px 1fr",
            gap: "18px",
            alignItems: "center",
          }}
        >
          <TeamBadge name={card.homeName} crest={card.homeCrest} align="left" />

          <div
            style={{
              display: "grid",
              gap: "10px",
            }}
          >
            <div
              style={{
                border: "1px solid #334155",
                background: "linear-gradient(135deg, #f8fafc, #e2e8f0)",
                color: "#0f172a",
                borderRadius: "12px",
                padding: "10px 12px",
                textAlign: "center",
                minHeight: 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "14px",
                fontWeight: 700,
                lineHeight: 1.2,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6)",
              }}
            >
              {formatDate(card.kickOff)}
            </div>

            <div
              style={{
                border: "1px solid #334155",
                background: "linear-gradient(135deg, #ffffff, #f8fafc)",
                color: "#111827",
                borderRadius: "12px",
                padding: "10px 12px",
                textAlign: "center",
                minHeight: 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "15px",
                fontWeight: 800,
                lineHeight: 1.2,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
              }}
            >
              {card.bestAngle}
            </div>

            <div
              style={{
                border: `1px solid ${tone.border}`,
                background: tone.bg,
                color: tone.text,
                borderRadius: "12px",
                padding: "10px 12px",
                textAlign: "center",
                minHeight: 44,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "14px",
                fontWeight: 900,
                lineHeight: 1.2,
                boxShadow: tone.shadow,
              }}
            >
              {card.confidenceLabel} confidence
            </div>
          </div>

          <TeamBadge name={card.awayName} crest={card.awayCrest} align="right" />
        </div>
      </div>
    </Link>
  );
}

export default async function HomePage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date().toISOString();

  const [{ data: predictions }, { data: snapshots }] = await Promise.all([
    supabase
      .from("predictions")
      .select(`
        fixture_id,
        predicted_result,
        confidence,
        confidence_label,
        confidence_score,
        home_win_pct,
        draw_pct,
        away_win_pct,
        predicted_home_goals,
        predicted_away_goals,
        home_team_id,
        away_team_id,
        fixture:fixture_id(
          utc_date,
          status,
          home_team_id,
          away_team_id,
          home:home_team_id(name, crest),
          away:away_team_id(name, crest)
        )
      `)
      .eq("league_code", "PL")
      .eq("season", 2025)
      .gte("fixture.utc_date", now)
      .order("updated_at", { ascending: false })
      .limit(16),

    supabase
      .from("team_stats_snapshot")
      .select(`
        team_id,
        last_5_points,
        overall_strength_score,
        home_points_per_game,
        away_points_per_game
      `)
      .eq("league_code", "PL")
      .eq("season", 2025),
  ]);

  const typedPredictions = (predictions || []) as PredictionRow[];
  const typedSnapshots = (snapshots || []) as SnapshotRow[];

  const snapshotMap = new Map<string, SnapshotRow>();
  for (const row of typedSnapshots) {
    snapshotMap.set(row.team_id, row);
  }

  const boardCards: PickCard[] = typedPredictions
    .filter((prediction) => {
      const kickOff = prediction.fixture?.utc_date
        ? new Date(prediction.fixture.utc_date).getTime()
        : 0;
      return !!prediction.fixture_id && kickOff > Date.now();
    })
    .map((prediction) => {
      const home = firstTeam(prediction.fixture?.home);
      const away = firstTeam(prediction.fixture?.away);

      const homeId = prediction.home_team_id || prediction.fixture?.home_team_id || null;
      const awayId = prediction.away_team_id || prediction.fixture?.away_team_id || null;

      const homeSnapshot = homeId ? snapshotMap.get(homeId) : undefined;
      const awaySnapshot = awayId ? snapshotMap.get(awayId) : undefined;

      const confidenceLabel = shortConfidenceLabel(
        prediction.confidence_label || prediction.confidence,
        prediction.confidence_score
      );

      return {
        fixtureId: prediction.fixture_id as string,
        homeName: home.name,
        awayName: away.name,
        homeCrest: home.crest,
        awayCrest: away.crest,
        kickOff: prediction.fixture?.utc_date || null,
        bestAngle: buildBestAngle(prediction, home.name, away.name, homeSnapshot, awaySnapshot),
        confidenceLabel,
        confidenceScore: numberValue(prediction.confidence_score),
        sortScore: buildSortScore(prediction, homeSnapshot, awaySnapshot),
      };
    })
    .sort((a, b) => b.sortScore - a.sortScore)
    .slice(0, 8);

  const headlineCard = boardCards[0] || null;
  const remainingCards = boardCards.slice(1);

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, #dbeafe 0%, #eef2ff 22%, #f5f7fb 48%, #f8fafc 100%)",
        padding: "32px 20px 56px",
        fontFamily: "Arial, sans-serif",
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: "1180px", margin: "0 auto" }}>
        <section
          style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 55%, #38bdf8 100%)",
            borderRadius: "30px",
            padding: "28px 24px",
            boxShadow: "0 18px 42px rgba(37,99,235,0.24)",
            marginBottom: "26px",
            color: "#ffffff",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "20px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 800,
                  color: "#dbeafe",
                  marginBottom: "8px",
                  letterSpacing: "0.6px",
                }}
              >
                FOOTBALL STATS AGENT
              </div>
              <h1
                style={{
                  margin: "0 0 8px",
                  fontSize: "34px",
                  lineHeight: 1.1,
                }}
              >
                Pick Board
              </h1>
              <div
                style={{
                  fontSize: "15px",
                  color: "#e0f2fe",
                  lineHeight: 1.6,
                }}
              >
                Clean, scan-first picks at a glance. Click any game to open the full prediction breakdown.
              </div>
            </div>

            <div
              style={{
                background: "rgba(255,255,255,0.16)",
                border: "1px solid rgba(255,255,255,0.22)",
                color: "#ffffff",
                borderRadius: "999px",
                padding: "10px 14px",
                fontSize: "12px",
                fontWeight: 800,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)",
              }}
            >
              {boardCards.length} upcoming picks
            </div>
          </div>
        </section>

        {headlineCard ? (
          <section style={{ marginBottom: "24px" }}>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 900,
                textAlign: "center",
                marginBottom: "16px",
                color: "#0f172a",
              }}
            >
              ⭐ Pick of the Week
            </div>

            <div
              style={{
                borderRadius: "30px",
                boxShadow: "0 0 0 3px rgba(37,99,235,0.18)",
              }}
            >
              <MatchBoardCard card={headlineCard} />
            </div>
          </section>
        ) : null}

        <section>
          <div
            style={{
              display: "grid",
              gap: "18px",
            }}
          >
            {remainingCards.map((card) => (
              <MatchBoardCard key={card.fixtureId} card={card} />
            ))}
          </div>

          {boardCards.length === 0 ? (
            <div
              style={{
                background: "linear-gradient(135deg, #ffffff, #f8fafc)",
                borderRadius: "24px",
                border: "1px solid #e5e7eb",
                padding: "28px",
                textAlign: "center",
                color: "#6b7280",
                boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
              }}
            >
              No upcoming predictions found.
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
