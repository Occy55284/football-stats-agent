// ONLY showing changed styling parts to keep this readable
// (logic stays exactly the same)

...

function confidenceTone(value?: string | null) {
  if (value === "High") {
    return {
      bg: "linear-gradient(135deg,#dcfce7,#bbf7d0)",
      text: "#065f46",
      border: "#34d399",
      glow: "0 0 0 2px rgba(16,185,129,0.15)",
    };
  }
  if (value === "Low") {
    return {
      bg: "linear-gradient(135deg,#fee2e2,#fecaca)",
      text: "#7f1d1d",
      border: "#f87171",
      glow: "0 0 0 2px rgba(239,68,68,0.15)",
    };
  }
  return {
    bg: "linear-gradient(135deg,#fef3c7,#fde68a)",
    text: "#78350f",
    border: "#fbbf24",
    glow: "0 0 0 2px rgba(245,158,11,0.15)",
  };
}

...

function MatchBoardCard({ card }: { card: PickCard }) {
  const tone = confidenceTone(card.confidenceLabel);

  return (
    <Link href={`/match/${card.fixtureId}`} style={{ textDecoration: "none" }}>
      <div
        style={{
          background: "linear-gradient(135deg,#ffffff,#f8fafc)",
          borderRadius: "26px",
          border: "1px solid #e5e7eb",
          padding: "22px",
          boxShadow: "0 12px 30px rgba(15,23,42,0.06)",
          transition: "all 0.2s ease",
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

          <div style={{ display: "grid", gap: "10px" }}>
            <div
              style={{
                border: "1px solid #111827",
                background: "#f9fafb",
                padding: "10px",
                textAlign: "center",
                fontWeight: 700,
              }}
            >
              {formatDate(card.kickOff)}
            </div>

            <div
              style={{
                border: "1px solid #111827",
                background: "#ffffff",
                padding: "10px",
                textAlign: "center",
                fontWeight: 800,
                fontSize: "15px",
              }}
            >
              {card.bestAngle}
            </div>

            <div
              style={{
                border: `1px solid ${tone.border}`,
                background: tone.bg,
                color: tone.text,
                padding: "10px",
                textAlign: "center",
                fontWeight: 900,
                boxShadow: tone.glow,
              }}
            >
              {card.confidenceLabel}
            </div>
          </div>

          <TeamBadge name={card.awayName} crest={card.awayCrest} align="right" />
        </div>
      </div>
    </Link>
  );
}

...

export default async function HomePage() {
  ...
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg,#eef2ff 0%, #f5f7fb 40%, #f8fafc 100%)",
        padding: "32px 20px 56px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: "1180px", margin: "0 auto" }}>
        
        {/* HEADER */}
        <section
          style={{
            background: "linear-gradient(135deg,#1e293b,#2563eb)",
            color: "#fff",
            borderRadius: "28px",
            padding: "28px",
            boxShadow: "0 18px 40px rgba(37,99,235,0.25)",
            marginBottom: "26px",
          }}
        >
          <div>
            <div style={{ fontSize: "12px", opacity: 0.8 }}>
              FOOTBALL STATS AGENT
            </div>
            <h1 style={{ margin: "6px 0 8px", fontSize: "34px" }}>
              Pick Board
            </h1>
            <div style={{ fontSize: "14px", opacity: 0.9 }}>
              Clean, high-confidence picks at a glance
            </div>
          </div>
        </section>

        {/* PICK OF THE WEEK */}
        {headlineCard && (
          <section style={{ marginBottom: "24px" }}>
            <div
              style={{
                fontSize: "24px",
                fontWeight: 900,
                textAlign: "center",
                marginBottom: "16px",
                color: "#1e293b",
              }}
            >
              ⭐ Pick of the Week
            </div>

            <div
              style={{
                boxShadow: "0 0 0 3px rgba(37,99,235,0.2)",
                borderRadius: "28px",
              }}
            >
              <MatchBoardCard card={headlineCard} />
            </div>
          </section>
        )}

        {/* MATCH LIST */}
        <section style={{ display: "grid", gap: "18px" }}>
          {remainingCards.map((card) => (
            <MatchBoardCard key={card.fixtureId} card={card} />
          ))}
        </section>
      </div>
    </main>
  );
}
