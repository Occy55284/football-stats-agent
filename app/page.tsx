import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date().toISOString();

  const { data: fixtures } = await supabase
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
    .gte("utc_date", now)
    .order("utc_date", { ascending: true })
    .limit(8);

  const { data: predictions } = await supabase
    .from("predictions")
    .select(`
      predicted_home_goals,
      predicted_away_goals,
      predicted_result,
      confidence,
      fixture:fixture_id(
        utc_date,
        home:home_team_id(name),
        away:away_team_id(name)
      )
    `)
    .order("created_at", { ascending: false })
    .limit(8);

  const { data: table } = await supabase
    .from("standings")
    .select(`
      position,
      points,
      played_games,
      goal_difference,
      team:team_id(name)
    `)
    .order("position", { ascending: true })
    .limit(10);

  return (
    <main
      style={{
        padding: "40px",
        fontFamily: "Arial, sans-serif",
        maxWidth: "1000px",
        margin: "0 auto"
      }}
    >
      <h1 style={{ marginBottom: "10px" }}>Football Stats Agent ⚽</h1>
      <p style={{ color: "#555", marginBottom: "30px" }}>
        Premier League data, form and simple match predictions
      </p>

      <h2>Upcoming Fixtures</h2>
      <div style={{ marginTop: "15px", marginBottom: "40px" }}>
        {fixtures?.map((f: any) => (
          <div
            key={f.id}
            style={{
              padding: "14px 0",
              borderBottom: "1px solid #e5e5e5"
            }}
          >
            <div>
              <strong>{f.home?.name}</strong> v <strong>{f.away?.name}</strong>
            </div>
            <div style={{ color: "#666", fontSize: "14px" }}>
              {new Date(f.utc_date).toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <h2>Predictions</h2>
      <div style={{ marginTop: "15px", marginBottom: "40px" }}>
        {predictions?.map((p: any, i: number) => (
          <div
            key={i}
            style={{
              padding: "14px 0",
              borderBottom: "1px solid #e5e5e5"
            }}
          >
            <div>
              <strong>{p.fixture?.home?.name}</strong> v{" "}
              <strong>{p.fixture?.away?.name}</strong>
            </div>
            <div style={{ color: "#666", fontSize: "14px" }}>
              {new Date(p.fixture?.utc_date).toLocaleString()}
            </div>
            <div>
              Prediction: {p.predicted_home_goals} - {p.predicted_away_goals}
            </div>
            <div style={{ fontSize: "14px" }}>
              Result: <strong>{p.predicted_result}</strong> | Confidence:{" "}
              <strong>{p.confidence}</strong>
            </div>
          </div>
        ))}
      </div>

      <h2>Top 10 League Table</h2>
      <table
        style={{
          width: "100%",
          marginTop: "15px",
          borderCollapse: "collapse"
        }}
      >
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #ddd" }}>
            <th style={{ padding: "8px 0" }}>#</th>
            <th style={{ padding: "8px 0" }}>Team</th>
            <th style={{ padding: "8px 0" }}>P</th>
            <th style={{ padding: "8px 0" }}>Pts</th>
            <th style={{ padding: "8px 0" }}>GD</th>
          </tr>
        </thead>
        <tbody>
          {table?.map((row: any) => (
            <tr key={row.team?.name} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "8px 0" }}>{row.position}</td>
              <td style={{ padding: "8px 0" }}>{row.team?.name}</td>
              <td style={{ padding: "8px 0" }}>{row.played_games}</td>
              <td style={{ padding: "8px 0" }}>{row.points}</td>
              <td style={{ padding: "8px 0" }}>{row.goal_difference}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
