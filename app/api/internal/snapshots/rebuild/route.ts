import { NextResponse } from "next/server";
import { rebuildTeamStatsSnapshot } from "@/lib/football/buildTeamStatsSnapshot";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const leagueCode = body?.leagueCode;
    const season = body?.season;

    if (!leagueCode || !season) {
      return NextResponse.json(
        {
          ok: false,
          error: "leagueCode and season are required",
        },
        { status: 400 }
      );
    }

    const result = await rebuildTeamStatsSnapshot(leagueCode, Number(season));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Snapshot rebuild failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
