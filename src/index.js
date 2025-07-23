export default {
  async fetch(request, env) {
    // Forward all requests to static assets
    return env.ASSETS.fetch(request)
  }
}
