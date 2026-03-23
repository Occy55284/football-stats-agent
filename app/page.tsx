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
          color: "#6b7280",
          fontWeight: 700,
        }}
      >
        {align === "left" ? "Home" : "Away"}
      </div>

      <div
        style={{
          width: 110,
          height: 110,
          borderRadius: "22px",
          border: "1px solid #d1d5db",
          background: "#f8fafc",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
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
              width: 72,
              height: 72,
              borderRadius: "999px",
              background: "#e5e7eb",
              color: "#374151",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
              fontWeight: 800,
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
          color: "#111827",
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
          background: "#ffffff",
          borderRadius: "26px",
          border: "1px solid #e5e7eb",
          padding: "22px",
          boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
          transition: "transform 0.15s ease, box-shadow 0.15s ease",
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
            {[
              { label: "Date", value: formatDate(card.kickOff) },
              { label: "Best possible result", value: card.bestAngle },
              { label: "Confidence level", value: card.confidenceLabel },
            ].map((item, index) => (
              <div
                key={`${item.label}-${index}`}
                style={{
                  border: "1px solid #111827",
                  background:
                    item.label === "Confidence level" ? tone.bg : "#ffffff",
                  color:
                    item.label === "Confidence level" ? tone.text : "#111827",
                  borderRadius: "0px",
                  padding: "9px 12px",
                  textAlign: "center",
                  minHeight: 42,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: item.label === "Best possible result" ? "15px" : "14px",
                  fontWeight: item.label === "Date" ? 700 : 800,
                  lineHeight: 1.2,
                }}
              >
                {item.value}
              </div>
            ))}
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
        background: "#f5f7fb",
        padding: "32px 20px 56px",
        fontFamily: "Arial, sans-serif",
        color: "#111827",
      }}
    >
      <div style={{ maxWidth: "1180px", margin: "0 auto" }}>
        <section
          style={{
            background: "#ffffff",
            borderRadius: "28px",
            border: "1px solid #e5e7eb",
            padding: "28px 24px",
            boxShadow: "0 12px 28px rgba(15,23,42,0.06)",
            marginBottom: "26px",
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
                  color: "#2563eb",
                  marginBottom: "8px",
                  letterSpacing: "0.4px",
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
                  color: "#6b7280",
                  lineHeight: 1.6,
                }}
              >
                Simple match picks at a glance. Click any game to open the full prediction breakdown.
              </div>
            </div>

            <div
              style={{
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                color: "#1d4ed8",
                borderRadius: "999px",
                padding: "10px 14px",
                fontSize: "12px",
                fontWeight: 800,
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
              }}
            >
              Pick of the week
            </div>
            <MatchBoardCard card={headlineCard} />
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
                background: "#ffffff",
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
