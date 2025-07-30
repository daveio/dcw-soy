export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url: URL = new URL(request.url);
    const { pathname }: { pathname: string } = url;

    // Serve static site for root paths
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

  // Check if the redirect exists at dave.io/go/{path}
  const redirectPath: string = pathname.startsWith("/") ? pathname.substring(1) : pathname;
  const redirectUrl: string = `https://dave.io/go/${redirectPath}`;

  try {
    const checkResponse: Response = await checkRedirectExists(redirectUrl);

    // If it's a 404, serve our custom not-found page
    if (checkResponse.status === 404) {
      return await serveNotFoundPage(request, env);
    }

    // Otherwise, redirect to dave.io
    return Response.redirect(redirectUrl, 301);
  } catch (error) {
    // If there's an error checking, serve the not-found page
    return await serveNotFoundPage(request, env);
  }
}

/**
 * Check if a redirect exists at the given URL
 */
async function checkRedirectExists(redirectUrl: string): Promise<Response> {
  return await fetch(redirectUrl, {
    method: "GET",
    redirect: "manual",
    headers: {
      "User-Agent": "THERE IS NO USER AGENT. THERE IS ONLY SOY.",
    },
  });
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
