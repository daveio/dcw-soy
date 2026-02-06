// Constants for KV caching
const KV_KEY = "redirects"
const KV_LOCK_KEY = "redirects-lock"
const CACHE_TTL = 3600 // 1 hour in seconds
const REFRESH_LOCK_TTL = 300 // 5 minutes - prevents stuck locks

// Interface for cached redirect data
interface RedirectCache {
  redirects: string[]
  lastUpdated: string // ISO 8601 timestamp
}

// Analytics Engine data model
// Blob order:  [eventType, method, country, cacheStatus]
// Double order: [statusCode, responseTimeMs]
// Index:       [pathname]
type EventType = "static_root" | "static_asset" | "redirect" | "redirect_fallback" | "not_found"
type CacheStatus = "hit" | "miss" | "n/a"

interface AnalyticsEvent {
  eventType: EventType
  method: string
  country: string
  cacheStatus: CacheStatus
  statusCode: number
  responseTimeMs: number
  pathname: string
}

function writeAnalyticsEvent(env: Env, event: AnalyticsEvent): void {
  env.ANALYTICS.writeDataPoint({
    blobs: [event.eventType, event.method, event.country, event.cacheStatus],
    doubles: [event.statusCode, event.responseTimeMs],
    indexes: [event.pathname]
  })
}

interface ValidRedirectsResult {
  redirects: string[] | null
  cacheHit: boolean
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startTime = Date.now()
    const url: URL = new URL(request.url)
    const { pathname }: { pathname: string } = url
    const analyticsPath = pathname.startsWith("/") ? pathname.substring(1) : pathname
    const country: string = String(request.cf?.country ?? "unknown")
    const method = request.method

    // Serve static site for root paths
    // run_worker_first is enabled, so the worker handles all requests
    // including root and static assets (for analytics tracking)
    if (pathname === "/" || pathname === "") {
      const response = await env.ASSETS.fetch(request)
      writeAnalyticsEvent(env, {
        eventType: "static_root",
        method,
        country,
        cacheStatus: "n/a",
        statusCode: response.status,
        responseTimeMs: Date.now() - startTime,
        pathname: analyticsPath || "/"
      })
      return response
    }

    // Stats API endpoints — must come before static asset check
    if (pathname.startsWith("/stats/api/")) {
      return handleStatsApi(pathname, method, env)
    }

    // Serve static assets directly if they exist
    if (method === "GET" || method === "HEAD") {
      const assetResponse = await env.ASSETS.fetch(request)
      if (assetResponse.status !== 404) {
        writeAnalyticsEvent(env, {
          eventType: "static_asset",
          method,
          country,
          cacheStatus: "n/a",
          statusCode: assetResponse.status,
          responseTimeMs: Date.now() - startTime,
          pathname: analyticsPath
        })
        return assetResponse
      }
    }

    return await handleRedirect(request, env, ctx, startTime, country)
  }
} satisfies ExportedHandler<Env>

/**
 * Handle redirect logic for non-root paths
 */
async function handleRedirect(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  startTime: number,
  country: string
): Promise<Response> {
  const url: URL = new URL(request.url)
  const { pathname }: { pathname: string } = url

  // Extract the redirect path without leading slash
  const redirectPath: string = pathname.startsWith("/") ? pathname.substring(1) : pathname

  // Get the list of valid redirects
  const { redirects: validRedirects, cacheHit } = await getValidRedirects(env, ctx)

  // If we can't determine valid redirects, redirect anyway and let dave.io handle it
  if (validRedirects === null) {
    const redirectUrl: string = `https://dave.io/go/${redirectPath}`
    writeAnalyticsEvent(env, {
      eventType: "redirect_fallback",
      method: request.method,
      country,
      cacheStatus: "miss",
      statusCode: 301,
      responseTimeMs: Date.now() - startTime,
      pathname: redirectPath
    })
    return Response.redirect(redirectUrl, 301)
  }

  // Check if the requested path is in the list of valid redirects
  if (validRedirects.includes(redirectPath)) {
    // Redirect to dave.io
    const redirectUrl: string = `https://dave.io/go/${redirectPath}`
    writeAnalyticsEvent(env, {
      eventType: "redirect",
      method: request.method,
      country,
      cacheStatus: cacheHit ? "hit" : "miss",
      statusCode: 301,
      responseTimeMs: Date.now() - startTime,
      pathname: redirectPath
    })
    return Response.redirect(redirectUrl, 301)
  }

  // Path not found in valid redirects, serve the not-found page
  writeAnalyticsEvent(env, {
    eventType: "not_found",
    method: request.method,
    country,
    cacheStatus: cacheHit ? "hit" : "miss",
    statusCode: 404,
    responseTimeMs: Date.now() - startTime,
    pathname: redirectPath
  })
  return await serveNotFoundPage(request, env)
}

interface RedirectsResult {
  redirects: string[]
}

interface RedirectsApiResponse {
  ok: boolean
  result: RedirectsResult
  message: string
  error: null | string
  status: {
    message: string
  }
  timestamp: string
}

/**
 * Fetch the list of valid redirects from dave.io/api/redirects
 */
async function fetchValidRedirects(): Promise<string[] | null> {
  try {
    const response = await fetch("https://dave.io/api/redirects", {
      method: "GET",
      headers: {
        "User-Agent": "THERE IS NO USER AGENT. THERE IS ONLY SOY."
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch redirects: ${response.status}`)
    }

    const data: RedirectsApiResponse = await response.json()
    const redirects = data?.result?.redirects

    if (!Array.isArray(redirects)) {
      throw new Error("Invalid response format from redirects endpoint")
    }

    // Validate that all elements are strings
    if (!redirects.every((item) => typeof item === "string")) {
      throw new Error("Invalid redirects format: expected array of strings")
    }

    return redirects
  } catch (error) {
    console.error("Error fetching valid redirects:", error)
    return null
  }
}

/**
 * Get the list of valid redirects with KV caching
 */
async function getValidRedirects(env: Env, ctx: ExecutionContext): Promise<ValidRedirectsResult> {
  try {
    // Try to get from cache
    const cached = (await env.KV.get(KV_KEY, "json")) as RedirectCache | null

    if (cached?.redirects) {
      // Cache hit - return cached data immediately
      // Schedule async refresh (non-blocking) only if no refresh is already in progress
      ctx.waitUntil(refreshCacheWithLock(env))
      return { redirects: cached.redirects, cacheHit: true }
    }

    // Cache miss - fetch synchronously and update cache
    const redirects = await fetchValidRedirects()
    if (redirects === null) {
      // Fetch error - return null to trigger optimistic fallback redirect
      return { redirects: null, cacheHit: false }
    }

    // Valid response (possibly empty) - cache if non-empty
    if (redirects.length > 0) {
      await updateCache(env, redirects)
    }
    return { redirects, cacheHit: false }
  } catch (error) {
    // On any error, return null to indicate "redirect anyway"
    console.error("Error in getValidRedirects:", error)
    return { redirects: null, cacheHit: false }
  }
}

/**
 * Update the KV cache with new redirect data
 */
async function updateCache(env: Env, redirects: string[]): Promise<void> {
  const cacheData: RedirectCache = {
    redirects,
    lastUpdated: new Date().toISOString()
  }
  await env.KV.put(KV_KEY, JSON.stringify(cacheData), {
    expirationTtl: CACHE_TTL
  })
}

/**
 * Refresh the cache asynchronously with locking to prevent race conditions
 */
async function refreshCacheWithLock(env: Env): Promise<void> {
  try {
    // Check if a refresh is already in progress
    const lockExists = await env.KV.get(KV_LOCK_KEY)
    if (lockExists !== null) {
      // Another refresh is in progress, skip this one
      return
    }

    // Acquire the lock
    await env.KV.put(KV_LOCK_KEY, new Date().toISOString(), {
      expirationTtl: REFRESH_LOCK_TTL
    })

    // Perform the refresh
    await refreshCache(env)

    // Release the lock
    await env.KV.delete(KV_LOCK_KEY)
  } catch (error) {
    console.error("Error in refreshCacheWithLock:", error)
    // Ensure lock is released even if refresh fails
    try {
      await env.KV.delete(KV_LOCK_KEY)
    } catch (lockReleaseError) {
      console.error("Error releasing refresh lock:", lockReleaseError)
    }
  }
}

/**
 * Refresh the cache asynchronously (internal function)
 */
async function refreshCache(env: Env): Promise<void> {
  try {
    const redirects = await fetchValidRedirects()
    if (redirects !== null && redirects.length > 0) {
      await updateCache(env, redirects)
    }
  } catch (error) {
    console.error("Error refreshing cache:", error)
  }
}

/**
 * Serve the not-found page with 404 status
 */
async function serveNotFoundPage(request: Request, env: Env): Promise<Response> {
  const notFoundUrl: URL = new URL(request.url)
  notFoundUrl.pathname = "/not-found.html"
  const notFoundRequest: Request = new Request(notFoundUrl.toString())
  const response: Response = await env.ASSETS.fetch(notFoundRequest)

  if (response.status === 404) {
    console.error("Error serving not-found page: asset missing")
    return new Response("404 - Page Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain" }
    })
  }

  // Return the not-found page with 404 status but keep the original URL
  const headers: Headers = new Headers(response.headers)
  headers.delete("Location")
  return new Response(response.body, {
    status: 404,
    headers
  })
}

// --- Stats API ---

const STATS_API_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=30"
} as const

/**
 * Query the Cloudflare Analytics Engine SQL API
 */
async function queryAnalyticsEngine(env: Env, sql: string): Promise<{ data: Record<string, unknown>[] }> {
  const token = await env.ANALYTICS_API_TOKEN.get()
  const accountId = await env.ACCOUNT_ID.get()
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: sql
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Analytics Engine query failed (${response.status}): ${text}`)
  }
  return response.json()
}

/**
 * Route and handle stats API endpoint requests
 */
async function handleStatsApi(pathname: string, method: string, env: Env): Promise<Response> {
  if (method !== "GET" && method !== "HEAD") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...STATS_API_HEADERS, Allow: "GET, HEAD" }
    })
  }

  try {
    const route = pathname.replace("/stats/api/", "")
    let result: { data: Record<string, unknown>[] }

    switch (route) {
      case "overview":
        result = await queryOverview(env)
        break
      case "traffic":
        result = await queryTraffic(env)
        break
      case "paths":
        result = await queryTopPaths(env)
        break
      case "countries":
        result = await queryCountries(env)
        break
      case "cache":
        result = await queryCache(env)
        break
      default:
        return new Response(JSON.stringify({ error: "Unknown endpoint" }), { status: 404, headers: STATS_API_HEADERS })
    }

    return new Response(JSON.stringify(result.data), { headers: STATS_API_HEADERS })
  } catch (error) {
    console.error("Stats API error:", error)
    return new Response(JSON.stringify({ error: "Failed to query analytics" }), {
      status: 500,
      headers: STATS_API_HEADERS
    })
  }
}

/**
 * Query summary totals for the last 24 hours
 */
async function queryOverview(env: Env) {
  return queryAnalyticsEngine(
    env,
    `
    SELECT
      SUM(_sample_interval) AS total_requests,
      SUM(IF(blob1 = 'redirect', _sample_interval, 0)) AS redirects,
      SUM(IF(blob1 = 'not_found', _sample_interval, 0)) AS not_found,
      SUM(IF(blob1 = 'static_root' OR blob1 = 'static_asset', _sample_interval, 0)) AS static_served,
      SUM(_sample_interval * double2) / SUM(_sample_interval) AS avg_response_ms
    FROM "dcw-soy"
    WHERE timestamp > NOW() - INTERVAL '1' DAY
  `
  )
}

/**
 * Query hourly traffic buckets by event type for the last 24 hours
 */
async function queryTraffic(env: Env) {
  return queryAnalyticsEngine(
    env,
    `
    SELECT
      toStartOfInterval(timestamp, INTERVAL '1' HOUR) AS hour,
      blob1 AS event_type,
      SUM(_sample_interval) AS count
    FROM "dcw-soy"
    WHERE timestamp > NOW() - INTERVAL '1' DAY
    GROUP BY hour, event_type
    ORDER BY hour ASC
  `
  )
}

/**
 * Query top 20 paths by hit count for the last 24 hours
 */
async function queryTopPaths(env: Env) {
  return queryAnalyticsEngine(
    env,
    `
    SELECT
      index1 AS path,
      blob1 AS event_type,
      SUM(_sample_interval) AS hits,
      SUM(_sample_interval * double2) / SUM(_sample_interval) AS avg_ms
    FROM "dcw-soy"
    WHERE timestamp > NOW() - INTERVAL '1' DAY
    GROUP BY path, event_type
    ORDER BY hits DESC
    LIMIT 20
  `
  )
}

/**
 * Query top 15 countries by request count for the last 24 hours
 */
async function queryCountries(env: Env) {
  return queryAnalyticsEngine(
    env,
    `
    SELECT
      blob3 AS country,
      SUM(_sample_interval) AS requests
    FROM "dcw-soy"
    WHERE timestamp > NOW() - INTERVAL '1' DAY
      AND blob3 != 'unknown'
    GROUP BY country
    ORDER BY requests DESC
    LIMIT 15
  `
  )
}

/**
 * Query cache hit/miss counts for the last 24 hours
 */
async function queryCache(env: Env) {
  return queryAnalyticsEngine(
    env,
    `
    SELECT
      blob4 AS cache_status,
      SUM(_sample_interval) AS count
    FROM "dcw-soy"
    WHERE timestamp > NOW() - INTERVAL '1' DAY
      AND blob4 != 'n/a'
    GROUP BY cache_status
  `
  )
}
