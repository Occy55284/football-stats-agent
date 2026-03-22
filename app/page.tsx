import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{
    slip?: string | string[] | undefined;
    premium?: string | string[] | undefined;
  }>;
};

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
  btts_for?: number | null;
  over_25_for?: number | null;
  failed_to_score?: number | null;
  clean_sheets?: number | null;
  team?: TeamRef | TeamRef[] | null;
};

type PickOfTheDay = {
  prediction: PredictionRow;
  homeName: string;
  awayName: string;
  angle: string;
  confidenceLabel: string;
  riskLabel: string;
  score: number;
  shortReason: string;
  bullets: string[];
};

type SlipSelection = {
  fixtureId: string;
  homeName: string;
  awayName: string;
  angle: string;
  confidenceLabel: string;
  riskLabel: string;
  score: number;
  shortReason: string;
  prediction: PredictionRow;
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

function numberValue(value?: number | null) {
  return Number(value || 0);
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

function riskTone(value?: string) {
  if (value === "Low") {
    return {
      bg: "#dcfce7",
      text: "#166534",
      border: "#86efac",
    };
  }
  if (value === "High") {
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

function buildPickAngle(
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
    if (homeWin >= 60 && homeStrength >= awayStrength) return `${homeName} win`;
    if (homeNonLose >= 72) return `${homeName} or Draw`;
    return "Home lean";
  }

  if (prediction.predicted_result === "AWAY") {
    if (awayWin >= 60 && awayStrength >= homeStrength) return `${awayName} win`;
    if (awayNonLose >= 72) return `${awayName} or Draw`;
    return "Away lean";
  }

  if (draw >= 30) return "Draw lean";
  return "Tight match";
}

function buildSelectionFromPrediction(
  prediction: PredictionRow,
  snapshotMap: Map<string, SnapshotRow>
): SlipSelection | null {
  if (!prediction.fixture_id) return null;

  const homeName = firstTeamName(prediction.fixture?.home, "Home");
  const awayName = firstTeamName(prediction.fixture?.away, "Away");

  const homeId = prediction.home_team_id || prediction.fixture?.home_team_id || null;
  const awayId = prediction.away_team_id || prediction.fixture?.away_team_id || null;

  const homeSnapshot = homeId ? snapshotMap.get(homeId) : undefined;
  const awaySnapshot = awayId ? snapshotMap.get(awayId) : undefined;

  const homeWin = numberValue(prediction.home_win_pct);
  const draw = numberValue(prediction.draw_pct);
  const awayWin = numberValue(prediction.away_win_pct);

  const biggestOutcome = Math.max(homeWin, draw, awayWin);
  const secondOutcome = [homeWin, draw, awayWin].sort((a, b) => b - a)[1] || 0;
  const probabilityEdge = biggestOutcome - secondOutcome;

  const confidenceBase =
    numberValue(prediction.confidence_score) ||
    (prediction.confidence_label === "High" || prediction.confidence === "High"
      ? 76
      : prediction.confidence_label === "Low" || prediction.confidence === "Low"
        ? 46
        : 61);

  const homeStrength = numberValue(homeSnapshot?.overall_strength_score);
  const awayStrength = numberValue(awaySnapshot?.overall_strength_score);
  const strengthGap = Math.abs(homeStrength - awayStrength);

  const homeForm = numberValue(homeSnapshot?.last_5_points);
  const awayForm = numberValue(awaySnapshot?.last_5_points);
  const formGap = Math.abs(homeForm - awayForm);

  const homeAttack = numberValue(homeSnapshot?.attack_score);
  const awayAttack = numberValue(awaySnapshot?.attack_score);
  const attackGap = Math.abs(homeAttack - awayAttack);

  const homeHomePPG = numberValue(homeSnapshot?.home_points_per_game);
  const awayAwayPPG = numberValue(awaySnapshot?.away_points_per_game);
  const venueGap = Math.abs(homeHomePPG - awayAwayPPG);

  const predictedTotalGoals =
    numberValue(prediction.predicted_home_goals) + numberValue(prediction.predicted_away_goals);

  const homeOver = numberValue(homeSnapshot?.over_25_for);
  const awayOver = numberValue(awaySnapshot?.over_25_for);
  const homeBtts = numberValue(homeSnapshot?.btts_for);
  const awayBtts = numberValue(awaySnapshot?.btts_for);

  let score = confidenceBase;
  score += probabilityEdge * 1.2;
  score += Math.min(strengthGap, 14) * 1.4;
  score += Math.min(formGap, 6) * 1.8;
  score += Math.min(attackGap, 10) * 0.9;
  score += Math.min(venueGap, 1.8) * 10;

  if (prediction.predicted_result === "DRAW") score -= 10;
  if (biggestOutcome < 45) score -= 8;
  if (draw >= 30) score -= 4;
  if (predictedTotalGoals < 1.8) score -= 2;
  if (homeBtts >= 4 && awayBtts >= 4 && probabilityEdge < 10) score -= 3;
  if (homeOver >= 4 && awayOver >= 4 && probabilityEdge < 10) score -= 2;

  const angle = buildPickAngle(prediction, homeName, awayName, homeSnapshot, awaySnapshot);

  const confidenceLabel = score >= 82 ? "High" : score >= 66 ? "Medium" : "Low";
  const riskLabel = score >= 82 ? "Low" : score >= 66 ? "Medium" : "High";

  const shortReason =
    prediction.predicted_result === "HOME"
      ? `${homeName} rate stronger on the slate with the home win probability and profile signals aligned.`
      : prediction.predicted_result === "AWAY"
        ? `${awayName} rate stronger on the slate with the away win probability and profile signals aligned.`
        : `This is a tighter game, so the angle is more cautious and carries more variance.`;

  return {
    fixtureId: prediction.fixture_id,
    homeName,
    awayName,
    angle,
    confidenceLabel,
    riskLabel,
    score,
    shortReason,
    prediction,
  };
}

function buildPickOfTheDay(
  predictions: PredictionRow[],
  snapshotMap: Map<string, SnapshotRow>
): PickOfTheDay | null {
  const upcoming = predictions.filter((prediction) => {
    const kickOff = prediction.fixture?.utc_date ? new Date(prediction.fixture.utc_date).getTime() : 0;
    return !!prediction.fixture_id && kickOff > Date.now();
  });

  if (!upcoming.length) return null;

  const scored = upcoming
    .map((prediction) => {
      const selection = buildSelectionFromPrediction(prediction, snapshotMap);
      if (!selection) return null;

      const homeId = prediction.home_team_id || prediction.fixture?.home_team_id || null;
      const awayId = prediction.away_team_id || prediction.fixture?.away_team_id || null;
      const homeSnapshot = homeId ? snapshotMap.get(homeId) : undefined;
      const awaySnapshot = awayId ? snapshotMap.get(awayId) : undefined;

      const homeWin = numberValue(prediction.home_win_pct);
      const draw = numberValue(prediction.draw_pct);
      const awayWin = numberValue(prediction.away_win_pct);
      const biggestOutcome = Math.max(homeWin, draw, awayWin);
      const secondOutcome = [homeWin, draw, awayWin].sort((a, b) => b - a)[1] || 0;
      const probabilityEdge = biggestOutcome - secondOutcome;

      const bullets: string[] = [];

      if (prediction.predicted_result === "HOME") {
        bullets.push(
          `${selection.homeName} lead the model at ${homeWin.toFixed(1)}% with a ${probabilityEdge.toFixed(1)}-point outcome edge.`
        );
        if (numberValue(homeSnapshot?.overall_strength_score) > numberValue(awaySnapshot?.overall_strength_score)) {
          bullets.push(`${selection.homeName} also have the stronger overall strength profile.`);
        }
        if (numberValue(homeSnapshot?.last_5_points) > numberValue(awaySnapshot?.last_5_points)) {
          bullets.push(`${selection.homeName} come in with stronger recent form over the last five matches.`);
        }
      } else if (prediction.predicted_result === "AWAY") {
        bullets.push(
          `${selection.awayName} lead the model at ${awayWin.toFixed(1)}% with a ${probabilityEdge.toFixed(1)}-point outcome edge.`
        );
        if (numberValue(awaySnapshot?.overall_strength_score) > numberValue(homeSnapshot?.overall_strength_score)) {
          bullets.push(`${selection.awayName} also have the stronger overall strength profile.`);
        }
        if (numberValue(awaySnapshot?.last_5_points) > numberValue(homeSnapshot?.last_5_points)) {
          bullets.push(`${selection.awayName} come in with stronger recent form over the last five matches.`);
        }
      } else {
        bullets.push(`The model is not strongly separating either side in this match.`);
        bullets.push(`Draw-heavy games are less ideal for a headline pick, so conviction is lower.`);
      }

      bullets.push(`Angle selected: ${selection.angle}.`);

      return {
        prediction,
        homeName: selection.homeName,
        awayName: selection.awayName,
        angle: selection.angle,
        confidenceLabel: selection.confidenceLabel,
        riskLabel: selection.riskLabel,
        score: selection.score,
        shortReason: selection.shortReason,
        bullets: bullets.slice(0, 4),
      };
    })
    .filter(Boolean) as PickOfTheDay[];

  scored.sort((a, b) => b.score - a.score);
  return scored[0] || null;
}

function normaliseSlipIds(raw?: string | string[]) {
  const value = Array.isArray(raw) ? raw.join(",") : raw || "";
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isPremiumEnabled(raw?: string | string[]) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return false;
  return ["1", "true", "premium", "pro", "yes", "on"].includes(value.toLowerCase());
}

function buildHref(ids: string[], premiumEnabled: boolean) {
  const params: string[] = [];
  if (ids.length) params.push(`slip=${ids.join(",")}`);
  if (premiumEnabled) params.push(`premium=1`);
  return params.length ? `/?${params.join("&")}` : "/";
}

function buildPremiumHref(ids: string[]) {
  return buildHref(ids, true);
}

function buildFreeHref(ids: string[]) {
  return buildHref(ids, false);
}

function addSlipId(currentIds: string[], id: string) {
  if (currentIds.includes(id)) return currentIds;
  return [...currentIds, id];
}

function removeSlipId(currentIds: string[], id: string) {
  return currentIds.filter((item) => item !== id);
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function slipStrengthLabel(avgScore: number) {
  if (avgScore >= 82) return "Strong";
  if (avgScore >= 68) return "Playable";
  return "Risky";
}

function LockCard({
  title,
  text,
  upgradeHref,
}: {
  title: string;
  text: string;
  upgradeHref: string;
}) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #0f172a 0%, #334155 100%)",
        color: "#ffffff",
        borderRadius: "18px",
        padding: "18px",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          background: "rgba(255,255,255,0.12)",
          borderRadius: "999px",
          padding: "6px 10px",
          fontSize: "11px",
          fontWeight: 800,
          marginBottom: "10px",
        }}
      >
        🔒 Premium
      </div>
      <div style={{ fontSize: "18px", fontWeight: 800, marginBottom: "8px" }}>{title}</div>
      <div style={{ fontSize: "14px", lineHeight: 1.6, color: "#cbd5e1", marginBottom: "14px" }}>
        {text}
      </div>
      <Link
        href={upgradeHref}
        style={{
          display: "inline-flex",
          alignItems: "center",
          textDecoration: "none",
          background: "#f59e0b",
          color: "#111827",
          borderRadius: "999px",
          padding: "10px 14px",
          fontSize: "12px",
          fontWeight: 900,
        }}
      >
        Upgrade to Premium
      </Link>
    </div>
  );
}

export default async function HomePage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const selectedSlipIds = normaliseSlipIds(resolvedSearchParams?.slip);
  const premiumEnabled = isPremiumEnabled(resolvedSearchParams?.premium);

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
        .limit(16),

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
          btts_for,
          over_25_for,
          failed_to_score,
          clean_sheets,
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

  const upcomingPredictions = typedPredictions.filter((prediction) => {
    const kickOff = prediction.fixture?.utc_date ? new Date(prediction.fixture.utc_date).getTime() : 0;
    return !!prediction.fixture_id && kickOff > Date.now();
  });

  const selections = upcomingPredictions
    .map((prediction) => buildSelectionFromPrediction(prediction, snapshotMap))
    .filter(Boolean) as SlipSelection[];

  selections.sort((a, b) => b.score - a.score);

  const strongestTeam = firstTeamName(typedSnapshots[0]?.team, "-");
  const highConfidenceCount = selections.filter((p) => p.confidenceLabel === "High").length;
  const avgConfidence = selections.length > 0 ? average(selections.map((p) => p.score)) : 0;
  const avgHomeWinPct =
    upcomingPredictions.length > 0
      ? upcomingPredictions.reduce((sum, p) => sum + Number(p.home_win_pct || 0), 0) /
        upcomingPredictions.length
      : 0;

  const pickOfTheDay = buildPickOfTheDay(upcomingPredictions, snapshotMap);
  const selectedSlip = selections.filter((item) => selectedSlipIds.includes(item.fixtureId));

  const totalSlipScore = average(selectedSlip.map((item) => item.score));
  const slipConfidence = totalSlipScore >= 82 ? "High" : totalSlipScore >= 68 ? "Medium" : "Low";
  const slipRisk = totalSlipScore >= 82 ? "Low" : totalSlipScore >= 68 ? "Medium" : "High";

  const suggestedTwoLeg = selections.slice(0, 2);
  const suggestedThreeLeg = selections.slice(0, 3);

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
                Premier League • Betting Insights mode
              </div>

              <h1 style={{ margin: "0 0 8px", fontSize: "38px", lineHeight: 1.1 }}>
                Football Stats Agent
              </h1>

              <p style={{ margin: 0, color: "#dbeafe", fontSize: "15px", lineHeight: 1.6 }}>
                AI-driven match projections using fixture data, standings, team form, snapshot
                strength scores, venue splits, and a rule-based betting insights layer.
              </p>
            </div>

            <div
              style={{
                minWidth: "280px",
                background: premiumEnabled
                  ? "rgba(16,185,129,0.14)"
                  : "rgba(255,255,255,0.1)",
                border: premiumEnabled
                  ? "1px solid rgba(52,211,153,0.35)"
                  : "1px solid rgba(255,255,255,0.16)",
                borderRadius: "20px",
                padding: "18px",
              }}
            >
              <div style={{ fontSize: "12px", color: premiumEnabled ? "#a7f3d0" : "#bfdbfe", marginBottom: "6px" }}>
                {premiumEnabled ? "Premium tier active" : "Current tier"}
              </div>

              <div style={{ fontSize: "28px", fontWeight: 800, marginBottom: "8px" }}>
                {premiumEnabled ? "Premium" : "Free"}
              </div>

              <div style={{ fontSize: "12px", color: premiumEnabled ? "#d1fae5" : "#dbeafe", marginBottom: "12px" }}>
                {premiumEnabled
                  ? "3-leg builder, full slip grading, advanced scoring, and full pick reasoning unlocked"
                  : "Upgrade to unlock full slip grading, 3-leg suggestions, and premium insights"}
              </div>

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {!premiumEnabled ? (
                  <Link
                    href={buildPremiumHref(selectedSlipIds)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      textDecoration: "none",
                      background: "#f59e0b",
                      color: "#111827",
                      borderRadius: "999px",
                      padding: "10px 14px",
                      fontSize: "12px",
                      fontWeight: 900,
                    }}
                  >
                    Upgrade
                  </Link>
                ) : null}

                {premiumEnabled ? (
                  <Link
                    href={buildFreeHref(selectedSlipIds)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      textDecoration: "none",
                      background: "rgba(255,255,255,0.12)",
                      color: "#ffffff",
                      border: "1px solid rgba(255,255,255,0.18)",
                      borderRadius: "999px",
                      padding: "10px 14px",
                      fontSize: "12px",
                      fontWeight: 800,
                    }}
                  >
                    View free tier
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {!premiumEnabled && (
          <section
            style={{
              background: "#fff7ed",
              border: "1px solid #fdba74",
              borderRadius: "22px",
              padding: "18px",
              marginBottom: "24px",
              boxShadow: "0 8px 24px rgba(15,23,42,0.04)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: "12px", fontWeight: 800, color: "#9a3412", marginBottom: "6px" }}>
                  PREMIUM GATE
                </div>
                <div style={{ fontSize: "20px", fontWeight: 900, color: "#111827", marginBottom: "6px" }}>
                  Unlock advanced betting tools
                </div>
                <div style={{ fontSize: "14px", color: "#7c2d12", lineHeight: 1.6 }}>
                  Premium unlocks full pick reasoning, live slip scoring, confidence and risk grading,
                  and the suggested 3-leg builder.
                </div>
              </div>

              <Link
                href={buildPremiumHref(selectedSlipIds)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  textDecoration: "none",
                  background: "#111827",
                  color: "#ffffff",
                  borderRadius: "999px",
                  padding: "12px 16px",
                  fontSize: "13px",
                  fontWeight: 900,
                }}
              >
                Go Premium
              </Link>
            </div>
          </section>
        )}

        {pickOfTheDay && (
          <section
            style={{
              background: "#ffffff",
              borderRadius: "24px",
              padding: "22px",
              border: "1px solid #e5e7eb",
              boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
              marginBottom: "28px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
                margin: "-22px -22px 20px",
                padding: "22px",
                color: "#ffffff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "20px",
                  flexWrap: "wrap",
                  alignItems: "center",
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
                      letterSpacing: "0.3px",
                      marginBottom: "10px",
                      fontWeight: 800,
                    }}
                  >
                    AI Pick of the Day
                  </div>

                  <h2 style={{ margin: "0 0 6px", fontSize: "30px", lineHeight: 1.1 }}>
                    {pickOfTheDay.homeName} v {pickOfTheDay.awayName}
                  </h2>

                  <div style={{ color: "#dbeafe", fontSize: "14px" }}>
                    {formatDate(pickOfTheDay.prediction.fixture?.utc_date)}
                  </div>
                </div>

                <div
                  style={{
                    minWidth: "220px",
                    background: "rgba(255,255,255,0.1)",
                    border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: "18px",
                    padding: "16px",
                  }}
                >
                  <div style={{ fontSize: "12px", color: "#bfdbfe", marginBottom: "6px" }}>
                    Best betting angle
                  </div>
                  <div style={{ fontSize: "28px", fontWeight: 900, marginBottom: "8px" }}>
                    {pickOfTheDay.angle}
                  </div>
                  <div style={{ fontSize: "13px", color: "#dbeafe" }}>
                    Ranked top by confidence, edge, and team-profile alignment
                  </div>
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.15fr 0.95fr",
                gap: "20px",
                alignItems: "start",
              }}
            >
              <div>
                <div style={{ fontSize: "15px", lineHeight: 1.7, color: "#334155", marginBottom: "16px" }}>
                  {pickOfTheDay.shortReason}
                </div>

                <div style={{ display: "grid", gap: "12px", marginBottom: "18px" }}>
                  {(premiumEnabled ? pickOfTheDay.bullets : pickOfTheDay.bullets.slice(0, 1)).map(
                    (bullet, index) => (
                      <div
                        key={`${index}-${bullet}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "28px 1fr",
                          gap: "12px",
                          alignItems: "start",
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: "16px",
                          padding: "12px 14px",
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: "999px",
                            background: "#dbeafe",
                            color: "#1d4ed8",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "12px",
                            fontWeight: 800,
                          }}
                        >
                          {index + 1}
                        </div>
                        <div style={{ fontSize: "14px", lineHeight: 1.6, color: "#334155" }}>
                          {bullet}
                        </div>
                      </div>
                    )
                  )}

                  {!premiumEnabled && (
                    <LockCard
                      title="Full pick reasoning locked"
                      text="Premium unlocks the full reasoning stack behind Pick of the Day, including extra support points and stronger edge context."
                      upgradeHref={buildPremiumHref(selectedSlipIds)}
                    />
                  )}
                </div>

                <Link
                  href={`/match/${pickOfTheDay.prediction.fixture_id}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    textDecoration: "none",
                    color: "#ffffff",
                    background: "#1d4ed8",
                    borderRadius: "999px",
                    padding: "12px 18px",
                    fontSize: "14px",
                    fontWeight: 800,
                    boxShadow: "0 8px 20px rgba(37,99,235,0.22)",
                  }}
                >
                  Open full match insight →
                </Link>
              </div>

              <div style={{ display: "grid", gap: "14px" }}>
                {[
                  {
                    label: "Confidence",
                    value: premiumEnabled ? pickOfTheDay.confidenceLabel : "Premium",
                    tone: premiumEnabled
                      ? confidenceTone(pickOfTheDay.confidenceLabel)
                      : { bg: "#f8fafc", text: "#475569", border: "#cbd5e1" },
                  },
                  {
                    label: "Risk",
                    value: premiumEnabled ? pickOfTheDay.riskLabel : "Premium",
                    tone: premiumEnabled
                      ? riskTone(pickOfTheDay.riskLabel)
                      : { bg: "#f8fafc", text: "#475569", border: "#cbd5e1" },
                  },
                  {
                    label: "Model lean",
                    value: resultLabel(pickOfTheDay.prediction.predicted_result),
                    tone: {
                      bg: "#eff6ff",
                      text: "#1d4ed8",
                      border: "#bfdbfe",
                    },
                  },
                  {
                    label: "Predicted score",
                    value: `${formatOneDecimal(
                      pickOfTheDay.prediction.predicted_home_goals
                    )} - ${formatOneDecimal(pickOfTheDay.prediction.predicted_away_goals)}`,
                    tone: {
                      bg: "#f8fafc",
                      text: "#334155",
                      border: "#cbd5e1",
                    },
                  },
                  {
                    label: "Slate score",
                    value: premiumEnabled ? pickOfTheDay.score.toFixed(1) : "Premium",
                    tone: premiumEnabled
                      ? { bg: "#ecfeff", text: "#0f766e", border: "#99f6e4" }
                      : { bg: "#f8fafc", text: "#475569", border: "#cbd5e1" },
                  },
                ].map((card) => (
                  <div
                    key={card.label}
                    style={{
                      background: "#ffffff",
                      borderRadius: "18px",
                      border: "1px solid #e5e7eb",
                      boxShadow: "0 8px 24px rgba(15,23,42,0.04)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        background: card.tone.bg,
                        color: card.tone.text,
                        borderBottom: `1px solid ${card.tone.border}`,
                        padding: "10px 14px",
                        fontSize: "12px",
                        fontWeight: 800,
                      }}
                    >
                      {card.label}
                    </div>
                    <div style={{ padding: "14px", fontSize: "24px", fontWeight: 900 }}>
                      {card.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section
          style={{
            background: "#ffffff",
            borderRadius: "24px",
            padding: "22px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 8px 24px rgba(15,23,42,0.05)",
            marginBottom: "28px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              background: "linear-gradient(135deg, #0f766e 0%, #0f172a 100%)",
              margin: "-22px -22px 20px",
              padding: "22px",
              color: "#ffffff",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "20px",
                flexWrap: "wrap",
                alignItems: "center",
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
                    letterSpacing: "0.3px",
                    marginBottom: "10px",
                    fontWeight: 800,
                  }}
                >
                  Bet Slip Builder
                </div>

                <h2 style={{ margin: "0 0 6px", fontSize: "30px", lineHeight: 1.1 }}>
                  Build your slip from current model angles
                </h2>

                <div style={{ color: "#ccfbf1", fontSize: "14px" }}>
                  Add matches below. This builder uses your current prediction edge, team strength,
                  form, and venue profile.
                </div>
              </div>

              <div
                style={{
                  minWidth: "220px",
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: "18px",
                  padding: "16px",
                }}
              >
                <div style={{ fontSize: "12px", color: "#99f6e4", marginBottom: "6px" }}>
                  Slip summary
                </div>
                <div style={{ fontSize: "28px", fontWeight: 900, marginBottom: "8px" }}>
                  {selectedSlip.length} leg{selectedSlip.length === 1 ? "" : "s"}
                </div>
                <div style={{ fontSize: "13px", color: "#d1fae5" }}>
                  {selectedSlip.length
                    ? premiumEnabled
                      ? `${slipStrengthLabel(totalSlipScore)} build • ${slipConfidence} confidence`
                      : "Upgrade to unlock full slip grading"
                    : "No selections added yet"}
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.05fr 0.95fr",
              gap: "20px",
              alignItems: "start",
            }}
          >
            <div>
              {selectedSlip.length === 0 ? (
                <div
                  style={{
                    background: "#f8fafc",
                    border: "1px dashed #cbd5e1",
                    borderRadius: "18px",
                    padding: "18px",
                    color: "#475569",
                    fontSize: "14px",
                    lineHeight: 1.6,
                  }}
                >
                  Start your slip by clicking <strong>Add to slip</strong> on any prediction below.
                  The panel will build a simple multi-leg view using your existing insight logic.
                </div>
              ) : (
                <div style={{ display: "grid", gap: "14px" }}>
                  {selectedSlip.map((item, index) => {
                    const confidence = confidenceTone(item.confidenceLabel);
                    const risk = riskTone(item.riskLabel);

                    return (
                      <div
                        key={item.fixtureId}
                        style={{
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: "20px",
                          padding: "16px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "12px",
                            alignItems: "flex-start",
                            flexWrap: "wrap",
                            marginBottom: "12px",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                width: 28,
                                height: 28,
                                borderRadius: "999px",
                                background: "#dbeafe",
                                color: "#1d4ed8",
                                fontSize: "12px",
                                fontWeight: 800,
                                marginBottom: "8px",
                              }}
                            >
                              {index + 1}
                            </div>
                            <div style={{ fontSize: "20px", fontWeight: 800 }}>
                              {item.homeName} v {item.awayName}
                            </div>
                            <div style={{ fontSize: "13px", color: "#64748b", marginTop: "4px" }}>
                              {formatDate(item.prediction.fixture?.utc_date)}
                            </div>
                          </div>

                          <Link
                            href={buildHref(removeSlipId(selectedSlipIds, item.fixtureId), premiumEnabled)}
                            style={{
                              textDecoration: "none",
                              background: "#ffffff",
                              border: "1px solid #e2e8f0",
                              color: "#334155",
                              borderRadius: "999px",
                              padding: "9px 12px",
                              fontSize: "12px",
                              fontWeight: 800,
                            }}
                          >
                            Remove
                          </Link>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                            gap: "12px",
                            marginBottom: "12px",
                          }}
                        >
                          <div
                            style={{
                              background: "#ffffff",
                              border: "1px solid #e5e7eb",
                              borderRadius: "16px",
                              padding: "12px",
                            }}
                          >
                            <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>
                              Bet angle
                            </div>
                            <div style={{ fontSize: "22px", fontWeight: 900 }}>{item.angle}</div>
                          </div>

                          {premiumEnabled ? (
                            <>
                              <div
                                style={{
                                  background: confidence.bg,
                                  border: `1px solid ${confidence.border}`,
                                  borderRadius: "16px",
                                  padding: "12px",
                                  color: confidence.text,
                                }}
                              >
                                <div style={{ fontSize: "12px", marginBottom: "6px", fontWeight: 700 }}>
                                  Confidence
                                </div>
                                <div style={{ fontSize: "22px", fontWeight: 900 }}>{item.confidenceLabel}</div>
                              </div>

                              <div
                                style={{
                                  background: risk.bg,
                                  border: `1px solid ${risk.border}`,
                                  borderRadius: "16px",
                                  padding: "12px",
                                  color: risk.text,
                                }}
                              >
                                <div style={{ fontSize: "12px", marginBottom: "6px", fontWeight: 700 }}>
                                  Risk
                                </div>
                                <div style={{ fontSize: "22px", fontWeight: 900 }}>{item.riskLabel}</div>
                              </div>

                              <div
                                style={{
                                  background: "#ecfeff",
                                  border: "1px solid #99f6e4",
                                  borderRadius: "16px",
                                  padding: "12px",
                                  color: "#0f766e",
                                }}
                              >
                                <div style={{ fontSize: "12px", marginBottom: "6px", fontWeight: 700 }}>
                                  Selection score
                                </div>
                                <div style={{ fontSize: "22px", fontWeight: 900 }}>{item.score.toFixed(1)}</div>
                              </div>
                            </>
                          ) : (
                            <div
                              style={{
                                gridColumn: "span 3",
                              }}
                            >
                              <LockCard
                                title="Slip grading locked"
                                text="Premium unlocks per-leg score, confidence, and risk grading across your full bet slip."
                                upgradeHref={buildPremiumHref(selectedSlipIds)}
                              />
                            </div>
                          )}
                        </div>

                        <div style={{ fontSize: "14px", color: "#334155", lineHeight: 1.6 }}>
                          {premiumEnabled
                            ? item.shortReason
                            : "Premium unlocks the full reasoning summary for each slip leg."}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gap: "16px" }}>
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "20px",
                  padding: "18px",
                  boxShadow: "0 8px 24px rgba(15,23,42,0.04)",
                }}
              >
                <div style={{ fontSize: "18px", fontWeight: 800, marginBottom: "14px" }}>
                  Slip totals
                </div>

                {premiumEnabled ? (
                  <>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: "12px",
                        marginBottom: "14px",
                      }}
                    >
                      <div
                        style={{
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: "16px",
                          padding: "12px",
                        }}
                      >
                        <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>
                          Legs
                        </div>
                        <div style={{ fontSize: "24px", fontWeight: 900 }}>{selectedSlip.length}</div>
                      </div>

                      <div
                        style={{
                          background: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: "16px",
                          padding: "12px",
                        }}
                      >
                        <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "6px" }}>
                          Avg score
                        </div>
                        <div style={{ fontSize: "24px", fontWeight: 900 }}>
                          {selectedSlip.length ? totalSlipScore.toFixed(1) : "-"}
                        </div>
                      </div>

                      <div
                        style={{
                          background: confidenceTone(slipConfidence).bg,
                          border: `1px solid ${confidenceTone(slipConfidence).border}`,
                          borderRadius: "16px",
                          padding: "12px",
                          color: confidenceTone(slipConfidence).text,
                        }}
                      >
                        <div style={{ fontSize: "12px", marginBottom: "6px", fontWeight: 700 }}>
                          Slip confidence
                        </div>
                        <div style={{ fontSize: "24px", fontWeight: 900 }}>
                          {selectedSlip.length ? slipConfidence : "-"}
                        </div>
                      </div>

                      <div
                        style={{
                          background: riskTone(slipRisk).bg,
                          border: `1px solid ${riskTone(slipRisk).border}`,
                          borderRadius: "16px",
                          padding: "12px",
                          color: riskTone(slipRisk).text,
                        }}
                      >
                        <div style={{ fontSize: "12px", marginBottom: "6px", fontWeight: 700 }}>
                          Slip risk
                        </div>
                        <div style={{ fontSize: "24px", fontWeight: 900 }}>
                          {selectedSlip.length ? slipRisk : "-"}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        background: "#f8fafc",
                        border: "1px solid #e2e8f0",
                        borderRadius: "16px",
                        padding: "14px",
                        fontSize: "14px",
                        lineHeight: 1.6,
                        color: "#334155",
                      }}
                    >
                      {selectedSlip.length
                        ? `This ${selectedSlip.length}-leg slip grades as ${slipStrengthLabel(
                            totalSlipScore
                          ).toLowerCase()} based on the average selection score across your chosen angles.`
                        : "No active selections yet."}
                    </div>
                  </>
                ) : (
                  <LockCard
                    title="Full slip totals locked"
                    text="Premium unlocks average slip score, slip confidence, slip risk, and the final build grading for your selected legs."
                    upgradeHref={buildPremiumHref(selectedSlipIds)}
                  />
                )}

                {selectedSlip.length > 0 && (
                  <div style={{ marginTop: "14px", display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <Link
                      href={premiumEnabled ? buildFreeHref([]) : "/"}
                      style={{
                        textDecoration: "none",
                        background: "#ffffff",
                        border: "1px solid #e2e8f0",
                        color: "#334155",
                        borderRadius: "999px",
                        padding: "10px 14px",
                        fontSize: "12px",
                        fontWeight: 800,
                      }}
                    >
                      Clear slip
                    </Link>

                    {selectedSlip.length >= 2 && premiumEnabled && (
                      <div
                        style={{
                          background: "#dcfce7",
                          border: "1px solid #86efac",
                          color: "#166534",
                          borderRadius: "999px",
                          padding: "10px 14px",
                          fontSize: "12px",
                          fontWeight: 800,
                        }}
                      >
                        Multi-ready
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "20px",
                  padding: "18px",
                  boxShadow: "0 8px 24px rgba(15,23,42,0.04)",
                }}
              >
                <div style={{ fontSize: "18px", fontWeight: 800, marginBottom: "14px" }}>
                  Quick build
                </div>

                <div style={{ display: "grid", gap: "12px" }}>
                  <Link
                    href={buildHref(suggestedTwoLeg.map((item) => item.fixtureId), premiumEnabled)}
                    style={{
                      textDecoration: "none",
                      background: "#eff6ff",
                      border: "1px solid #bfdbfe",
                      color: "#1d4ed8",
                      borderRadius: "16px",
                      padding: "14px",
                    }}
                  >
                    <div style={{ fontSize: "12px", fontWeight: 800, marginBottom: "6px" }}>
                      Suggested 2-leg slip
                    </div>
                    <div style={{ fontSize: "16px", fontWeight: 900, marginBottom: "4px" }}>
                      {suggestedTwoLeg.map((item) => item.angle).join(" + ") || "Not available"}
                    </div>
                    <div style={{ fontSize: "13px" }}>Best two selections by model score</div>
                  </Link>

                  {premiumEnabled ? (
                    <Link
                      href={buildHref(suggestedThreeLeg.map((item) => item.fixtureId), true)}
                      style={{
                        textDecoration: "none",
                        background: "#ecfeff",
                        border: "1px solid #99f6e4",
                        color: "#0f766e",
                        borderRadius: "16px",
                        padding: "14px",
                      }}
                    >
                      <div style={{ fontSize: "12px", fontWeight: 800, marginBottom: "6px" }}>
                        Suggested 3-leg slip
                      </div>
                      <div style={{ fontSize: "16px", fontWeight: 900, marginBottom: "4px" }}>
                        {suggestedThreeLeg.map((item) => item.angle).join(" + ") || "Not available"}
                      </div>
                      <div style={{ fontSize: "13px" }}>Best three selections by model score</div>
                    </Link>
                  ) : (
                    <LockCard
                      title="Suggested 3-leg slip locked"
                      text="Premium unlocks the higher-value 3-leg quick build from your top-ranked selections."
                      upgradeHref={buildPremiumHref(selectedSlipIds)}
                    />
                  )}
                </div>
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
              value: selections.length,
              sub: "Upcoming model outputs",
            },
            {
              label: "High-confidence picks",
              value: highConfidenceCount,
              sub: premiumEnabled ? "Full scoring enabled" : "Free tier preview",
            },
            {
              label: premiumEnabled ? "Avg selection score" : "Premium score data",
              value: premiumEnabled ? (avgConfidence ? avgConfidence.toFixed(1) : "0.0") : "Locked",
              sub: premiumEnabled ? "Across visible predictions" : "Upgrade to unlock",
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
              {upcomingPredictions.map((prediction, index) => {
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

                const selection = buildSelectionFromPrediction(prediction, snapshotMap);
                const isPickOfDay = pickOfTheDay?.prediction.fixture_id === prediction.fixture_id;
                const inSlip = !!prediction.fixture_id && selectedSlipIds.includes(prediction.fixture_id);

                return (
                  <div
                    key={`${prediction.fixture_id || index}-${index}`}
                    style={{
                      padding: "18px",
                      borderRadius: "22px",
                      background: inSlip ? "#f0fdf4" : isPickOfDay ? "#eff6ff" : "#f9fafb",
                      border: `1px solid ${
                        inSlip ? "#86efac" : isPickOfDay ? "#bfdbfe" : "#e5e7eb"
                      }`,
                      boxShadow: "0 2px 8px rgba(15,23,42,0.03)",
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
                        <div
                          style={{
                            display: "flex",
                            gap: "10px",
                            alignItems: "center",
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ fontSize: "20px", fontWeight: 800, marginBottom: "5px" }}>
                            {homeName} v {awayName}
                          </div>

                          {isPickOfDay && (
                            <div
                              style={{
                                background: "#1d4ed8",
                                color: "#ffffff",
                                borderRadius: "999px",
                                padding: "5px 9px",
                                fontSize: "11px",
                                fontWeight: 800,
                              }}
                            >
                              PICK OF THE DAY
                            </div>
                          )}

                          {inSlip && (
                            <div
                              style={{
                                background: "#166534",
                                color: "#ffffff",
                                borderRadius: "999px",
                                padding: "5px 9px",
                                fontSize: "11px",
                                fontWeight: 800,
                              }}
                            >
                              IN SLIP
                            </div>
                          )}
                        </div>

                        <div style={{ fontSize: "14px", color: "#6b7280" }}>
                          {formatDate(prediction.fixture?.utc_date)}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
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

                        {prediction.fixture_id && (
                          <Link
                            href={
                              inSlip
                                ? buildHref(removeSlipId(selectedSlipIds, prediction.fixture_id), premiumEnabled)
                                : buildHref(addSlipId(selectedSlipIds, prediction.fixture_id), premiumEnabled)
                            }
                            style={{
                              textDecoration: "none",
                              background: inSlip ? "#ffffff" : "#1d4ed8",
                              color: inSlip ? "#334155" : "#ffffff",
                              border: inSlip ? "1px solid #cbd5e1" : "1px solid #1d4ed8",
                              borderRadius: "999px",
                              padding: "8px 12px",
                              fontSize: "12px",
                              fontWeight: 800,
                            }}
                          >
                            {inSlip ? "Remove from slip" : "Add to slip"}
                          </Link>
                        )}

                        {prediction.fixture_id && (
                          <Link
                            href={`/match/${prediction.fixture_id}`}
                            style={{
                              textDecoration: "none",
                              background: "#ffffff",
                              color: "#334155",
                              border: "1px solid #cbd5e1",
                              borderRadius: "999px",
                              padding: "8px 12px",
                              fontSize: "12px",
                              fontWeight: 800,
                            }}
                          >
                            Match page
                          </Link>
                        )}
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
                        <div style={{ fontSize: "14px", color: "#374151", marginBottom: "8px" }}>
                          Lean: <strong>{resultLabel(prediction.predicted_result)}</strong>
                        </div>
                        {selection ? (
                          <div style={{ fontSize: "14px", color: "#0f766e", fontWeight: 800 }}>
                            Slip angle: {selection.angle}
                          </div>
                        ) : null}
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

                      {selection && premiumEnabled && (
                        <div
                          style={{
                            background: "#ecfeff",
                            color: "#0f766e",
                            border: "1px solid #99f6e4",
                            borderRadius: "999px",
                            padding: "7px 10px",
                            fontSize: "12px",
                            fontWeight: 700,
                          }}
                        >
                          Score {selection.score.toFixed(1)}
                        </div>
                      )}

                      {selection && !premiumEnabled && (
                        <div
                          style={{
                            background: "#f8fafc",
                            color: "#475569",
                            border: "1px solid #cbd5e1",
                            borderRadius: "999px",
                            padding: "7px 10px",
                            fontSize: "12px",
                            fontWeight: 700,
                          }}
                        >
                          Premium score
                        </div>
                      )}
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
                );
              })}

              {upcomingPredictions.length === 0 && (
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
                      <div style={{ fontWeight: 800 }}>{firstTeamName(row.team, "Team")}</div>
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
                    <div style={{ fontSize: "13px", color: "#6b7280" }}>{formatDate(fixture.utc_date)}</div>
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
