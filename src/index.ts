/**
 * Cloudflare Workers redirect proxy for dcw.soy
 *
 * This worker serves static assets from the root path and handles redirect
 * proxy functionality by checking if redirects exist at dave.io/go/{path}.
 * If a redirect doesn't exist, it serves a custom 404 page.
 *
 * - Run `bun run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `bun run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `bun run cf-typegen`.
 */

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url: URL = new URL(request.url);
    const { pathname }: { pathname: string } = url;

    // Serve static site for root paths
    if (pathname === "/" || pathname === "") {
      return env.ASSETS.fetch(request);
    }

    // Check if the redirect exists at dave.io/go/{path}
    const redirectPath: string = pathname.startsWith("/") ? pathname.substring(1) : pathname;
    const redirectUrl: string = `https://dave.io/go/${redirectPath}`;

    try {
      const checkResponse: Response = await fetch(redirectUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          "User-Agent": "THERE IS NO USER AGENT. THERE IS ONLY SOY.",
        },
      });

      // If it's a 404, serve our custom not-found page
      if (checkResponse.status === 404) {
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

      // Otherwise, redirect to dave.io
      return Response.redirect(redirectUrl, 301);
    } catch (error) {
      // If there's an error checking, serve the not-found page
      const notFoundUrl: URL = new URL(request.url);
      notFoundUrl.pathname = "/not-found.html";
      const notFoundRequest: Request = new Request(notFoundUrl.toString());
      const response: Response = await env.ASSETS.fetch(notFoundRequest);
      const headers: Headers = new Headers(response.headers);
      headers.delete("Location");
      return new Response(response.body, {
        status: 404,
        headers,
      });
    }
  },
} satisfies ExportedHandler<Env>;
