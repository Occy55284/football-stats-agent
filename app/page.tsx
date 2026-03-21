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
    .limit(10);

  const { data: table } = await supabase
    .from("standings")
    .select(`
      position,
      points,
      played_games,
      goals_for,
      goals_against,
      goal_difference,
      team:team_id(name)
    `)
    .order("position", { ascending: true });

  return (
    <main style={{ padding: "40px", fontFamily: "Arial, sans-serif" }}>
      <h1>Football Stats Agent ⚽</h1>

      <h2 style={{ marginTop: "30px" }}>Next Fixtures</h2>
      {fixtures?.map((f: any) => (
        <div key={f.id} style={{ padding: "8px 0" }}>
          <strong>{f.home?.name}</strong> v <strong>{f.away?.name}</strong>
          <div>{new Date(f.utc_date).toLocaleString()}</div>
        </div>
      ))}

      <h2 style={{ marginTop: "40px" }}>League Table</h2>

      <table style={{ width: "100%", marginTop: "10px", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>P</th>
            <th>Pts</th>
            <th>GD</th>
          </tr>
        </thead>
        <tbody>
          {table?.map((row: any) => (
            <tr key={row.team?.name}>
              <td>{row.position}</td>
              <td>{row.team?.name}</td>
              <td>{row.played_games}</td>
              <td>{row.points}</td>
              <td>{row.goal_difference}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
