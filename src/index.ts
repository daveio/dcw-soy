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

    return await handleRedirect(request, env);
  },
} satisfies ExportedHandler<Env>;

/**
 * Handle redirect logic for non-root paths
 */
async function handleRedirect(request: Request, env: Env): Promise<Response> {
  const url: URL = new URL(request.url);
  const { pathname }: { pathname: string } = url;

  // Extract the redirect path without leading slash
  const redirectPath: string = pathname.startsWith("/") ? pathname.substring(1) : pathname;

  // Get the list of valid redirects
  const validRedirects: string[] = await getValidRedirects();

  // Check if the requested path is in the list of valid redirects
  if (validRedirects.includes(redirectPath)) {
    // Redirect to dave.io
    const redirectUrl: string = `https://dave.io/go/${redirectPath}`;
    return Response.redirect(redirectUrl, 301);
  }

  // Path not found in valid redirects, serve the not-found page
  return await serveNotFoundPage(request, env);
}

/**
 * Fetch the list of valid redirects from dave.io/api/ping
 */
async function fetchValidRedirects(): Promise<string[]> {
  try {
    const response = await fetch("https://dave.io/api/ping", {
      method: "GET",
      headers: {
        "User-Agent": "THERE IS NO USER AGENT. THERE IS ONLY SOY.",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch redirects: ${response.status}`);
    }

    const data: any = await response.json();
    const redirects = data?.result?.pingData?.redirects;

    if (!Array.isArray(redirects)) {
      throw new Error("Invalid response format from ping endpoint");
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
 * Get the list of valid redirects (wrapper for future caching)
 */
async function getValidRedirects(): Promise<string[]> {
  // For now, just fetch directly
  // Future: implement caching logic here
  return await fetchValidRedirects();
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
