export async function GET() {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;

  const res = await fetch("https://api.football-data.org/v4/competitions/PL", {
    headers: {
      "X-Auth-Token": apiKey || "",
    },
    cache: "no-store",
  });

  const data = await res.json();

  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
  });
}
