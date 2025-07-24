export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const {pathname} = url

    // Serve static site for root paths
    if (pathname === '/' || pathname === '') {
      return env.ASSETS.fetch(request)
    }

    // Check if the redirect exists at dave.io/go/{path}
    const redirectPath = pathname.startsWith('/') ? pathname.substring(1) : pathname
    const redirectUrl = `https://dave.io/go/${redirectPath}`

    try {
      const checkResponse = await fetch(redirectUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'THERE IS NO USER AGENT. THERE IS ONLY SOY.'
        }
      })

      // If it's a 404, serve our custom not-found page
      if (checkResponse.status === 404) {
        const notFoundUrl = new URL(request.url)
        notFoundUrl.pathname = '/not-found.html'
        const notFoundRequest = new Request(notFoundUrl.toString())
        const response = await env.ASSETS.fetch(notFoundRequest)
        // Return the not-found page with 404 status but keep the original URL
        const headers = new Headers(response.headers)
        headers.delete('Location')
        return new Response(response.body, {
          status: 404,
          headers
        })
      }

      // Otherwise, redirect to dave.io
      return Response.redirect(redirectUrl, 301)
    } catch (error) {
      // If there's an error checking, serve the not-found page
      const notFoundUrl = new URL(request.url)
      notFoundUrl.pathname = '/not-found.html'
      const notFoundRequest = new Request(notFoundUrl.toString())
      const response = await env.ASSETS.fetch(notFoundRequest)
      const headers = new Headers(response.headers)
      headers.delete('Location')
      return new Response(response.body, {
        status: 404,
        headers
      })
    }
  }
}
