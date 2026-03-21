import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: fixtures, error } = await supabase
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
    .order("utc_date", { ascending: true })
    .limit(20);

  return (
    <main style={{ padding: "40px", fontFamily: "Arial, sans-serif" }}>
      <h1>Football Stats Agent ⚽</h1>
      <p>Premier League fixtures</p>

      {error && <p>Error: {error.message}</p>}

      <div style={{ marginTop: "30px" }}>
        {fixtures?.map((fixture: any) => (
          <div
            key={fixture.id}
            style={{
              padding: "12px 0",
              borderBottom: "1px solid #ddd"
            }}
          >
            <div>
              <strong>{fixture.home?.name}</strong> v{" "}
              <strong>{fixture.away?.name}</strong>
            </div>
            <div>
              {new Date(fixture.utc_date).toLocaleString()}
            </div>
            <div>
              Status: {fixture.status} | Score: {fixture.home_score ?? "-"} -{" "}
              {fixture.away_score ?? "-"}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
