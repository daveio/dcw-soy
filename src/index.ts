// Constants for KV caching
const KV_KEY = "redirects";
const KV_LOCK_KEY = "redirects-lock";
const CACHE_TTL = 3600; // 1 hour in seconds
const REFRESH_LOCK_TTL = 300; // 5 minutes - prevents stuck locks

// Interface for cached redirect data
interface RedirectCache {
  redirects: string[];
  lastUpdated: string; // ISO 8601 timestamp
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url: URL = new URL(request.url);
    const { pathname }: { pathname: string } = url;

    // Serve static site for root paths
    // we only have to handle the main path, asset URLs like the image are
    // already handled through default routing to the assets binding
    if (pathname === "/" || pathname === "") {
      return env.ASSETS.fetch(request);
    }

    return await handleRedirect(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;

/**
 * Handle redirect logic for non-root paths
 */
async function handleRedirect(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url: URL = new URL(request.url);
  const { pathname }: { pathname: string } = url;

  // Extract the redirect path without leading slash
  const redirectPath: string = pathname.startsWith("/") ? pathname.substring(1) : pathname;

  // Get the list of valid redirects
  const validRedirects: string[] | null = await getValidRedirects(env, ctx);

  // If we can't determine valid redirects, redirect anyway and let dave.io handle it
  if (validRedirects === null) {
    const redirectUrl: string = `https://dave.io/go/${redirectPath}`;
    return Response.redirect(redirectUrl, 301);
  }

  // Check if the requested path is in the list of valid redirects
  if (validRedirects.includes(redirectPath)) {
    // Redirect to dave.io
    const redirectUrl: string = `https://dave.io/go/${redirectPath}`;
    return Response.redirect(redirectUrl, 301);
  }

  // Path not found in valid redirects, serve the not-found page
  return await serveNotFoundPage(request, env);
}

interface RedirectsResult {
  redirects: string[];
}

interface RedirectsApiResponse {
  ok: boolean;
  result: RedirectsResult;
  message: string;
  error: null | string;
  status: {
    message: string;
  };
  timestamp: string;
}

/**
 * Fetch the list of valid redirects from dave.io/api/redirects
 */
async function fetchValidRedirects(): Promise<string[]> {
  try {
    const response = await fetch("https://dave.io/api/redirects", {
      method: "GET",
      headers: {
        "User-Agent": "THERE IS NO USER AGENT. THERE IS ONLY SOY.",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch redirects: ${response.status}`);
    }

    const data: RedirectsApiResponse = await response.json();
    const redirects = data?.result?.redirects;

    if (!Array.isArray(redirects)) {
      throw new Error("Invalid response format from redirects endpoint");
    }

    // Validate that all elements are strings
    if (!redirects.every((item) => typeof item === "string")) {
      throw new Error("Invalid redirects format: expected array of strings");
    }

    return redirects;
  } catch (error) {
    console.error("Error fetching valid redirects:", error);
    return [];
  }
}

/**
 * Get the list of valid redirects with KV caching
 */
async function getValidRedirects(env: Env, ctx: ExecutionContext): Promise<string[] | null> {
  try {
    // Try to get from cache
    const cached = (await env.KV.get(KV_KEY, "json")) as RedirectCache | null;

    if (cached?.redirects) {
      // Cache hit - return cached data immediately
      // Schedule async refresh (non-blocking) only if no refresh is already in progress
      ctx.waitUntil(refreshCacheWithLock(env));
      return cached.redirects;
    }

    // Cache miss - fetch synchronously and update cache
    const redirects = await fetchValidRedirects();
    if (redirects.length > 0) {
      await updateCache(env, redirects);
      return redirects;
    }

    // Empty redirects array means something went wrong - redirect anyway
    return null;
  } catch (error) {
    // On any error, return null to indicate "redirect anyway"
    console.error("Error in getValidRedirects:", error);
    return null;
  }
}

/**
 * Update the KV cache with new redirect data
 */
async function updateCache(env: Env, redirects: string[]): Promise<void> {
  const cacheData: RedirectCache = {
    redirects,
    lastUpdated: new Date().toISOString(),
  };
  await env.KV.put(KV_KEY, JSON.stringify(cacheData), {
    expirationTtl: CACHE_TTL,
  });
}

/**
 * Refresh the cache asynchronously with locking to prevent race conditions
 */
async function refreshCacheWithLock(env: Env): Promise<void> {
  try {
    // Check if a refresh is already in progress
    const lockExists = await env.KV.get(KV_LOCK_KEY);
    if (lockExists !== null) {
      // Another refresh is in progress, skip this one
      return;
    }

    // Acquire the lock
    await env.KV.put(KV_LOCK_KEY, new Date().toISOString(), {
      expirationTtl: REFRESH_LOCK_TTL,
    });

    // Perform the refresh
    await refreshCache(env);

    // Release the lock
    await env.KV.delete(KV_LOCK_KEY);
  } catch (error) {
    console.error("Error in refreshCacheWithLock:", error);
    // Ensure lock is released even if refresh fails
    try {
      await env.KV.delete(KV_LOCK_KEY);
    } catch (lockReleaseError) {
      console.error("Error releasing refresh lock:", lockReleaseError);
    }
  }
}

/**
 * Refresh the cache asynchronously (internal function)
 */
async function refreshCache(env: Env): Promise<void> {
  try {
    const redirects = await fetchValidRedirects();
    if (redirects.length > 0) {
      await updateCache(env, redirects);
    }
  } catch (error) {
    console.error("Error refreshing cache:", error);
  }
}

/**
 * Serve the not-found page with 404 status
 */
async function serveNotFoundPage(request: Request, env: Env): Promise<Response> {
  const notFoundUrl: URL = new URL(request.url);
  notFoundUrl.pathname = "/not-found.html";
  const notFoundRequest: Request = new Request(notFoundUrl.toString());
  const response: Response = await env.ASSETS.fetch(notFoundRequest);

  // Return the not-found page with 404 status but keep the original URL
  const headers: Headers = new Headers(response.headers);
  headers.delete("Location");
  return new Response(response.body, {
    status: 404,
    headers,
  });
}
