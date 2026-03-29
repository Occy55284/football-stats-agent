import { NextResponse } from "next/server";

const DEFAULT_SEASON = 2025;
const DEFAULT_COMPETITIONS = ["PL", "ELC"];

function getBaseUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

async function runStep(baseUrl: string, path: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    cache: "no-store",
  });

  const json = await res.json();

  return {
    ok: res.ok,
    path,
    result: json,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const season = Number(url.searchParams.get("season") || DEFAULT_SEASON);
    const competitionsParam = url.searchParams.get("competitions");

    const competitions = competitionsParam
      ? competitionsParam.split(",").map((c) => c.trim().toUpperCase())
      : DEFAULT_COMPETITIONS;

    const baseUrl = getBaseUrl();

    const results: Record<string, any> = {};

    for (const comp of competitions) {
      const leagueResults: Record<string, any> = {};

      // 1. teams
      leagueResults["sync-teams"] = await runStep(
        baseUrl,
        `/api/sync-teams?competition=${comp}&season=${season}`
      );

      // 2. fixtures
      leagueResults["sync-fixtures"] = await runStep(
        baseUrl,
        `/api/sync-fixtures?competition=${comp}&season=${season}`
      );

      // 3. standings
      leagueResults["sync-standings"] = await runStep(
        baseUrl,
        `/api/sync-standings?competition=${comp}&season=${season}`
      );

      // 4. form
      leagueResults["sync-form"] = await runStep(
        baseUrl,
        `/api/sync-form?competition=${comp}&season=${season}`
      );

      // 5. snapshot rebuild
      leagueResults["rebuild-snapshot"] = await runStep(
        baseUrl,
        `/api/rebuild-snapshot?competition=${comp}&season=${season}`
      );

      // ✅ NEW STEP — odds sync (CRITICAL)
      leagueResults["sync-odds"] = await runStep(
        baseUrl,
        `/api/sync-odds?competition=${comp}&season=${season}`
      );

      // 7. predictions (now uses fresh odds)
      leagueResults["sync-predictions"] = await runStep(
        baseUrl,
        `/api/sync-predictions?competition=${comp}&season=${season}`
      );

      results[comp] = leagueResults;
    }

    return NextResponse.json({
      ok: true,
      season,
      competitions,
      results,
    });
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
