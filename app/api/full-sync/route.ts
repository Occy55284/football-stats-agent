import { NextResponse } from "next/server";

const DEFAULT_SEASON = 2025;
const DEFAULT_COMPETITIONS = ["PL", "ELC"];

async function runStep(origin: string, path: string) {
  const response = await fetch(`${origin}${path}`, {
    method: "GET",
    cache: "no-store",
  });

  const text = await response.text();

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return {
    ok: response.ok,
    status: response.status,
    path,
    result: json,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const origin = url.origin;

    const season = Number(url.searchParams.get("season") || DEFAULT_SEASON);
    const competitionsParam = url.searchParams.get("competitions");

    const competitions = competitionsParam
      ? competitionsParam
          .split(",")
          .map((c) => c.trim().toUpperCase())
          .filter(Boolean)
      : DEFAULT_COMPETITIONS;

    const results: Record<string, Record<string, unknown>> = {};

    for (const comp of competitions) {
      const leagueResults: Record<string, unknown> = {};

      leagueResults["sync-teams"] = await runStep(
        origin,
        `/api/sync-teams?competition=${comp}&season=${season}`
      );

      leagueResults["sync-fixtures"] = await runStep(
        origin,
        `/api/sync-fixtures?competition=${comp}&season=${season}`
      );

      leagueResults["sync-standings"] = await runStep(
        origin,
        `/api/sync-standings?competition=${comp}&season=${season}`
      );

      leagueResults["sync-form"] = await runStep(
        origin,
        `/api/sync-form?competition=${comp}&season=${season}`
      );

      leagueResults["rebuild-snapshot"] = await runStep(
        origin,
        `/api/rebuild-snapshot?competition=${comp}&season=${season}`
      );

      leagueResults["sync-odds"] = await runStep(
        origin,
        `/api/sync-odds?competition=${comp}&season=${season}`
      );

      leagueResults["sync-predictions"] = await runStep(
        origin,
        `/api/sync-predictions?competition=${comp}&season=${season}`
      );

      results[comp] = leagueResults;
    }

    const hasFailure = Object.values(results).some((leagueResults) =>
      Object.values(leagueResults).some(
        (step) => !(step as { ok?: boolean }).ok
      )
    );

    return NextResponse.json(
      {
        ok: !hasFailure,
        season,
        competitions,
        results,
      },
      { status: hasFailure ? 500 : 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
