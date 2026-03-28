const DEFAULT_SEASON = 2025;
const DEFAULT_COMPETITION = "PL";
const ALLOWED_COMPETITIONS = ["PL", "ELC"] as const;

function parseCompetition(url: URL) {
  const requested = (
    url.searchParams.get("competition") ||
    url.searchParams.get("league_code") ||
    DEFAULT_COMPETITION
  ).toUpperCase();

  return ALLOWED_COMPETITIONS.includes(
    requested as (typeof ALLOWED_COMPETITIONS)[number]
  )
    ? requested
    : DEFAULT_COMPETITION;
}

function parseSeason(url: URL) {
  const raw = Number(url.searchParams.get("season") || DEFAULT_SEASON);
  return Number.isFinite(raw) ? raw : DEFAULT_SEASON;
}

async function callStep(baseUrl: string, path: string, competition: string, season: number) {
  const url = `${baseUrl}${path}?competition=${competition}&season=${season}`;

  const res = await fetch(url, {
    method: "GET",
    cache: "no-store",
  });

  const text = await res.text();

  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    throw new Error(
      `${path} failed (${res.status}): ${
        typeof json === "object" && json && "error" in json
          ? String((json as { error?: string }).error)
          : text
      }`
    );
  }

  return json;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const competition = parseCompetition(url);
    const season = parseSeason(url);

    const baseUrl = url.origin;

    const results: Record<string, unknown> = {};

    results["sync-teams"] = await callStep(
      baseUrl,
      "/api/sync-teams",
      competition,
      season
    );

    results["sync-fixtures"] = await callStep(
      baseUrl,
      "/api/sync-fixtures",
      competition,
      season
    );

    results["sync-standings"] = await callStep(
      baseUrl,
      "/api/sync-standings",
      competition,
      season
    );

    results["sync-form"] = await callStep(
      baseUrl,
      "/api/sync-form",
      competition,
      season
    );

    results["rebuild-snapshot"] = await callStep(
      baseUrl,
      "/api/rebuild-snapshot",
      competition,
      season
    );

    results["sync-predictions"] = await callStep(
      baseUrl,
      "/api/sync-predictions",
      competition,
      season
    );

    return new Response(
      JSON.stringify({
        ok: true,
        league_code: competition,
        season,
        results,
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}
