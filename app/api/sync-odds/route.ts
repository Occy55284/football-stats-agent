import { createClient } from "@supabase/supabase-js";

const DEFAULT_SEASON = 2025;
const DEFAULT_COMPETITION = "PL";
const ALLOWED_COMPETITIONS = ["PL", "ELC"] as const;

const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const DEFAULT_REGIONS = "uk,eu";
const DEFAULT_MARKETS = "h2h";
const DEFAULT_ODDS_FORMAT = "decimal";
const UPCOMING_WINDOW_HOURS = 168; // 7 days

type FixtureRow = {
  id: string;
  league_code: string | null;
  season: number | null;
  utc_date: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team?: {
    id: string;
    name: string;
  } | null;
  away_team?: {
    id: string;
    name: string;
  } | null;
};

type OddsApiOutcome = {
  name?: string;
  price?: number;
};

type OddsApiMarket = {
  key?: string;
  last_update?: string;
  outcomes?: OddsApiOutcome[];
};

type OddsApiBookmaker = {
  key?: string;
  title?: string;
  last_update?: string;
  markets?: OddsApiMarket[];
};

type OddsApiEvent = {
  id?: string;
  sport_key?: string;
  commence_time?: string;
  home_team?: string;
  away_team?: string;
  bookmakers?: OddsApiBookmaker[];
};

type OddsUpsertRow = {
  fixture_id: string;
  league_code: string;
  season: number;
  bookmaker: string;
  market: string;
  home_odds: number | null;
  draw_odds: number | null;
  away_odds: number | null;
  home_implied_pct: number | null;
  draw_implied_pct: number | null;
  away_implied_pct: number | null;
  market_avg_home_odds: number | null;
  market_avg_draw_odds: number | null;
  market_avg_away_odds: number | null;
  market_avg_home_pct: number | null;
  market_avg_draw_pct: number | null;
  market_avg_away_pct: number | null;
  source: string;
  last_synced_at: string;
  updated_at: string;
};

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(url, serviceRoleKey);
}

function getOddsApiKey() {
  const key = process.env.ODDS_API_KEY;
  if (!key) {
    throw new Error("Missing ODDS_API_KEY");
  }
  return key;
}

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

function parseHoursAhead(url: URL) {
  const raw = Number(url.searchParams.get("hours_ahead") || UPCOMING_WINDOW_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : UPCOMING_WINDOW_HOURS;
}

function getSportKey(competition: string) {
  if (competition === "PL") return "soccer_epl";
  if (competition === "ELC") return "soccer_efl_champ";
  return "soccer_epl";
}

function normalizeName(value?: string | null) {
  return (value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\./g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\bfc\b/g, " ")
    .replace(/\bafc\b/g, " ")
    .replace(/\bthe\b/g, " ")
    .replace(/\butd\b/g, "united")
    .replace(/\bmk dons\b/g, "milton keynes dons")
    .replace(/\bqpr\b/g, "queens park rangers")
    .replace(/\bsheff utd\b/g, "sheffield united")
    .replace(/\bsheff wed\b/g, "sheffield wednesday")
    .replace(/\bwest brom\b/g, "west bromwich albion")
    .replace(/\bw brom\b/g, "west bromwich albion")
    .replace(/\bpreston\b/g, "preston north end")
    .replace(/\bportsmouth\b/g, "portsmouth")
    .replace(/\bblackburn\b/g, "blackburn rovers")
    .replace(/\bbristol city\b/g, "bristol city")
    .replace(/\bman city\b/g, "manchester city")
    .replace(/\bman united\b/g, "manchester united")
    .replace(/\bspurs\b/g, "tottenham hotspur")
    .replace(/\bwolves\b/g, "wolverhampton wanderers")
    .replace(/\s+/g, " ")
    .trim();
}

function safeDiv(a: number, b: number) {
  if (!b) return 0;
  return a / b;
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function impliedPct(price: number | null) {
  if (!price || price <= 1) return 0;
  return 1 / price;
}

function normalizeProbabilities(home: number, draw: number, away: number) {
  const total = home + draw + away;
  if (!total) {
    return {
      home: 0,
      draw: 0,
      away: 0,
    };
  }

  return {
    home: round2((home / total) * 100),
    draw: round2((draw / total) * 100),
    away: round2((away / total) * 100),
  };
}

function avg(values: number[]) {
  if (!values.length) return null;
  return round3(values.reduce((sum, n) => sum + n, 0) / values.length);
}

function findOutcomePrice(outcomes: OddsApiOutcome[] | undefined, teamName: string) {
  const normalizedTeam = normalizeName(teamName);
  const outcome = (outcomes || []).find(
    (item) => normalizeName(item.name) === normalizedTeam
  );
  return typeof outcome?.price === "number" ? outcome.price : null;
}

function findDrawPrice(outcomes: OddsApiOutcome[] | undefined) {
  const outcome = (outcomes || []).find(
    (item) => normalizeName(item.name) === "draw"
  );
  return typeof outcome?.price === "number" ? outcome.price : null;
}

function scoreEventMatch(fixture: FixtureRow, event: OddsApiEvent) {
  const fixtureHome = normalizeName(fixture.home_team?.name);
  const fixtureAway = normalizeName(fixture.away_team?.name);
  const eventHome = normalizeName(event.home_team);
  const eventAway = normalizeName(event.away_team);

  let score = 0;

  if (fixtureHome && fixtureHome === eventHome) score += 4;
  if (fixtureAway && fixtureAway === eventAway) score += 4;

  const fixtureTime = fixture.utc_date ? new Date(fixture.utc_date).getTime() : 0;
  const eventTime = event.commence_time ? new Date(event.commence_time).getTime() : 0;
  const diffHours = Math.abs(fixtureTime - eventTime) / (1000 * 60 * 60);

  if (diffHours <= 2) score += 3;
  else if (diffHours <= 6) score += 2;
  else if (diffHours <= 12) score += 1;

  return score;
}

function matchEventToFixture(fixtures: FixtureRow[], event: OddsApiEvent) {
  let bestFixture: FixtureRow | null = null;
  let bestScore = -1;

  for (const fixture of fixtures) {
    const score = scoreEventMatch(fixture, event);
    if (score > bestScore) {
      bestScore = score;
      bestFixture = fixture;
    }
  }

  return bestScore >= 7 ? bestFixture : null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const leagueCode = parseCompetition(url);
    const season = parseSeason(url);
    const hoursAhead = parseHoursAhead(url);

    const apiKey = getOddsApiKey();
    const supabase = getSupabaseAdmin();

    const now = new Date();
    const upper = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);

    const { data: fixtures, error: fixturesError } = await supabase
      .from("fixtures")
      .select(`
        id,
        league_code,
        season,
        utc_date,
        home_team_id,
        away_team_id,
        home_team:home_team_id(id, name),
        away_team:away_team_id(id, name)
      `)
      .eq("league_code", leagueCode)
      .eq("season", season)
      .gte("utc_date", now.toISOString())
      .lte("utc_date", upper.toISOString())
      .in("status", ["SCHEDULED", "TIMED", "NS", "POSTPONED"])
      .order("utc_date", { ascending: true });

    if (fixturesError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: fixturesError.message,
          league_code: leagueCode,
          season,
        }),
        { status: 500 }
      );
    }

    const typedFixtures = (fixtures || []) as FixtureRow[];

    if (!typedFixtures.length) {
      return new Response(
        JSON.stringify({
          ok: true,
          saved: 0,
          deleted_existing: 0,
          matched_fixtures: 0,
          considered_fixtures: 0,
          league_code: leagueCode,
          season,
          message: "No upcoming fixtures found for odds sync window.",
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const sportKey = getSportKey(leagueCode);

    const oddsUrl = new URL(`${ODDS_API_BASE}/sports/${sportKey}/odds`);
    oddsUrl.searchParams.set("apiKey", apiKey);
    oddsUrl.searchParams.set("regions", DEFAULT_REGIONS);
    oddsUrl.searchParams.set("markets", DEFAULT_MARKETS);
    oddsUrl.searchParams.set("oddsFormat", DEFAULT_ODDS_FORMAT);
    oddsUrl.searchParams.set("dateFormat", "iso");
    oddsUrl.searchParams.set("bookmakers", url.searchParams.get("bookmakers") || "");

    if (!oddsUrl.searchParams.get("bookmakers")) {
      oddsUrl.searchParams.delete("bookmakers");
    }

    const oddsRes = await fetch(oddsUrl.toString(), {
      method: "GET",
      cache: "no-store",
    });

    if (!oddsRes.ok) {
      const text = await oddsRes.text();
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Odds API fetch failed: ${oddsRes.status}`,
          details: text,
          league_code: leagueCode,
          season,
        }),
        { status: 500 }
      );
    }

    const events = (await oddsRes.json()) as OddsApiEvent[];

    const fixtureToRows = new Map<string, OddsUpsertRow[]>();
    const matchedFixtureIds = new Set<string>();

    for (const event of events) {
      const fixture = matchEventToFixture(typedFixtures, event);
      if (!fixture || !fixture.id || !fixture.home_team?.name || !fixture.away_team?.name) {
        continue;
      }

      matchedFixtureIds.add(fixture.id);

      const bookmakerRows: OddsUpsertRow[] = [];
      const homeOddsList: number[] = [];
      const drawOddsList: number[] = [];
      const awayOddsList: number[] = [];

      for (const bookmaker of event.bookmakers || []) {
        const market = (bookmaker.markets || []).find((m) => m.key === "h2h");
        if (!market) continue;

        const homeOdds = findOutcomePrice(market.outcomes, fixture.home_team.name);
        const awayOdds = findOutcomePrice(market.outcomes, fixture.away_team.name);
        const drawOdds = findDrawPrice(market.outcomes);

        if (!homeOdds || !awayOdds || !drawOdds) continue;

        homeOddsList.push(homeOdds);
        drawOddsList.push(drawOdds);
        awayOddsList.push(awayOdds);

        const normalized = normalizeProbabilities(
          impliedPct(homeOdds),
          impliedPct(drawOdds),
          impliedPct(awayOdds)
        );

        bookmakerRows.push({
          fixture_id: fixture.id,
          league_code: leagueCode,
          season,
          bookmaker: bookmaker.title || bookmaker.key || "Unknown",
          market: "h2h",
          home_odds: round3(homeOdds),
          draw_odds: round3(drawOdds),
          away_odds: round3(awayOdds),
          home_implied_pct: normalized.home,
          draw_implied_pct: normalized.draw,
          away_implied_pct: normalized.away,
          market_avg_home_odds: null,
          market_avg_draw_odds: null,
          market_avg_away_odds: null,
          market_avg_home_pct: null,
          market_avg_draw_pct: null,
          market_avg_away_pct: null,
          source: "the-odds-api",
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }

      if (!bookmakerRows.length) continue;

      const marketAvgHomeOdds = avg(homeOddsList);
      const marketAvgDrawOdds = avg(drawOddsList);
      const marketAvgAwayOdds = avg(awayOddsList);

      const normalizedMarket = normalizeProbabilities(
        impliedPct(marketAvgHomeOdds),
        impliedPct(marketAvgDrawOdds),
        impliedPct(marketAvgAwayOdds)
      );

      const syncedAt = new Date().toISOString();

      const completedRows = bookmakerRows.map((row) => ({
        ...row,
        market_avg_home_odds: marketAvgHomeOdds,
        market_avg_draw_odds: marketAvgDrawOdds,
        market_avg_away_odds: marketAvgAwayOdds,
        market_avg_home_pct: normalizedMarket.home,
        market_avg_draw_pct: normalizedMarket.draw,
        market_avg_away_pct: normalizedMarket.away,
        last_synced_at: syncedAt,
        updated_at: syncedAt,
      }));

      completedRows.push({
        fixture_id: fixture.id,
        league_code: leagueCode,
        season,
        bookmaker: "__market__",
        market: "h2h",
        home_odds: marketAvgHomeOdds,
        draw_odds: marketAvgDrawOdds,
        away_odds: marketAvgAwayOdds,
        home_implied_pct: normalizedMarket.home,
        draw_implied_pct: normalizedMarket.draw,
        away_implied_pct: normalizedMarket.away,
        market_avg_home_odds: marketAvgHomeOdds,
        market_avg_draw_odds: marketAvgDrawOdds,
        market_avg_away_odds: marketAvgAwayOdds,
        market_avg_home_pct: normalizedMarket.home,
        market_avg_draw_pct: normalizedMarket.draw,
        market_avg_away_pct: normalizedMarket.away,
        source: "the-odds-api",
        last_synced_at: syncedAt,
        updated_at: syncedAt,
      });

      fixtureToRows.set(fixture.id, completedRows);
    }

    const fixtureIds = Array.from(fixtureToRows.keys());

    let deletedExisting = 0;
    if (fixtureIds.length) {
      const { error: deleteError, count } = await supabase
        .from("odds")
        .delete({ count: "exact" })
        .in("fixture_id", fixtureIds);

      if (deleteError) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: deleteError.message,
            league_code: leagueCode,
            season,
          }),
          { status: 500 }
        );
      }

      deletedExisting = count || 0;
    }

    const rowsToUpsert = fixtureIds.flatMap((fixtureId) => fixtureToRows.get(fixtureId) || []);

    let saved = 0;
    if (rowsToUpsert.length) {
      const { error: insertError } = await supabase.from("odds").upsert(rowsToUpsert, {
        onConflict: "fixture_id,bookmaker,market",
      });

      if (insertError) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: insertError.message,
            league_code: leagueCode,
            season,
          }),
          { status: 500 }
        );
      }

      saved = rowsToUpsert.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        saved,
        deleted_existing: deletedExisting,
        matched_fixtures: fixtureIds.length,
        considered_fixtures: typedFixtures.length,
        odds_events_returned: events.length,
        sport_key: sportKey,
        league_code: leagueCode,
        season,
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
