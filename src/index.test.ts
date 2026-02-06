import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import handler from "./index"

type AssetResponseConfig = {
  body?: string
  status?: number
  headers?: Record<string, string>
}

type AssetMap = Record<string, AssetResponseConfig>

const KV_KEY = "redirects"

function createAssetsFetch(assetMap: AssetMap) {
  return vi.fn(async (request: Request) => {
    const { pathname } = new URL(request.url)
    const asset = assetMap[pathname]
    if (asset) {
      return new Response(asset.body ?? "", {
        status: asset.status ?? 200,
        headers: asset.headers
      })
    }
    return new Response("not found", { status: 404 })
  })
}

function createMockEnv(assetMap: AssetMap = {}) {
  const store = new Map<string, unknown>()
  const writeDataPoint = vi.fn()

  const env = {
    ANALYTICS: {
      writeDataPoint
    },
    ANALYTICS_API_TOKEN: {
      get: vi.fn(async () => "test-token")
    },
    ACCOUNT_ID: "test-account-id",
    ASSETS: {
      fetch: createAssetsFetch(assetMap),
      connect: vi.fn()
    },
    KV: {
      get: vi.fn(async (key: string, type?: "text" | "json" | "arrayBuffer" | "stream") => {
        const value = store.get(key) ?? null
        if (value === null) return null
        if (type === "json" && typeof value === "string") {
          try {
            return JSON.parse(value)
          } catch {
            return null
          }
        }
        return value as never
      }),
      put: vi.fn(async (key: string, value: string) => {
        store.set(key, value)
      }),
      delete: vi.fn(async (key: string) => {
        store.delete(key)
      }),
      list: vi.fn(),
      getWithMetadata: vi.fn()
    }
  } as unknown as Env

  return { env, kvStore: store, assetsFetch: env.ASSETS.fetch as ReturnType<typeof createAssetsFetch>, writeDataPoint }
}

function createExecutionContext() {
  return {
    waitUntil: vi.fn()
  } as unknown as ExecutionContext
}

describe("worker fetch", () => {
  const realFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = realFetch
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it("serves the root page from assets", async () => {
    const { env, assetsFetch, writeDataPoint } = createMockEnv({ "/": { body: "home" } })
    const response = await handler.fetch(new Request("https://dcw.soy/"), env, createExecutionContext())

    expect(await response.text()).toBe("home")
    expect(assetsFetch).toHaveBeenCalledTimes(1)
    expect(writeDataPoint).toHaveBeenCalledTimes(1)
    expect(writeDataPoint).toHaveBeenCalledWith(
      expect.objectContaining({
        blobs: ["static_root", "GET", "unknown", "n/a"],
        doubles: expect.arrayContaining([200]),
        indexes: ["/"]
      })
    )
  })

  it("serves static assets directly when present", async () => {
    const { env, assetsFetch, writeDataPoint } = createMockEnv({ "/soy.webp": { status: 200, body: "soy" } })
    const response = await handler.fetch(new Request("https://dcw.soy/soy.webp"), env, createExecutionContext())

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("soy")
    expect(assetsFetch).toHaveBeenCalledTimes(1)
    expect(writeDataPoint).toHaveBeenCalledTimes(1)
    expect(writeDataPoint).toHaveBeenCalledWith(
      expect.objectContaining({
        blobs: ["static_asset", "GET", "unknown", "n/a"],
        doubles: expect.arrayContaining([200]),
        indexes: ["soy.webp"]
      })
    )
  })

  it("redirects known paths using cached redirects", async () => {
    const { env, kvStore, assetsFetch, writeDataPoint } = createMockEnv()
    kvStore.set(KV_KEY, { redirects: ["foo"], lastUpdated: new Date().toISOString() })

    const response = await handler.fetch(new Request("https://dcw.soy/foo"), env, createExecutionContext())

    expect(assetsFetch).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(301)
    expect(response.headers.get("Location")).toBe("https://dave.io/go/foo")
    expect(writeDataPoint).toHaveBeenCalledTimes(1)
    expect(writeDataPoint).toHaveBeenCalledWith(
      expect.objectContaining({
        blobs: ["redirect", "GET", "unknown", "hit"],
        doubles: expect.arrayContaining([301]),
        indexes: ["foo"]
      })
    )
  })

  it("serves the not-found page for invalid redirects", async () => {
    const { env, kvStore, assetsFetch, writeDataPoint } = createMockEnv({
      "/not-found.html": { body: "not-found", headers: { Location: "/should-remove" } }
    })
    kvStore.set(KV_KEY, { redirects: ["existing"], lastUpdated: new Date().toISOString() })

    const response = await handler.fetch(new Request("https://dcw.soy/missing"), env, createExecutionContext())

    expect(assetsFetch).toHaveBeenCalledTimes(2)
    expect(response.status).toBe(404)
    expect(response.headers.get("Location")).toBeNull()
    expect(await response.text()).toBe("not-found")
    expect(writeDataPoint).toHaveBeenCalledTimes(1)
    expect(writeDataPoint).toHaveBeenCalledWith(
      expect.objectContaining({
        blobs: ["not_found", "GET", "unknown", "hit"],
        doubles: expect.arrayContaining([404]),
        indexes: ["missing"]
      })
    )
  })

  it("serves generic 404 when not-found.html asset is missing", async () => {
    const { env, kvStore, assetsFetch, writeDataPoint } = createMockEnv() // No not-found.html asset
    kvStore.set(KV_KEY, { redirects: ["existing"], lastUpdated: new Date().toISOString() })

    const response = await handler.fetch(new Request("https://dcw.soy/missing"), env, createExecutionContext())

    expect(assetsFetch).toHaveBeenCalledTimes(2)
    expect(response.status).toBe(404)
    expect(response.headers.get("Location")).toBeNull()
    expect(await response.text()).toBe("404 - Page Not Found")
    expect(response.headers.get("Content-Type")).toBe("text/plain")
    expect(writeDataPoint).toHaveBeenCalledTimes(1)
  })

  it("fetches redirects remotely on cache miss and caches the result", async () => {
    const remoteRedirects = ["zap"]
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            result: { redirects: remoteRedirects },
            message: "ok",
            error: null,
            status: { message: "ok" },
            timestamp: new Date().toISOString()
          }),
          { status: 200 }
        )
    )
    globalThis.fetch = fetchMock

    const { env, kvStore, assetsFetch, writeDataPoint } = createMockEnv()
    const response = await handler.fetch(new Request("https://dcw.soy/zap"), env, createExecutionContext())

    expect(assetsFetch).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(301)
    expect(response.headers.get("Location")).toBe("https://dave.io/go/zap")

    const cached = (await env.KV.get(KV_KEY, "json")) as { redirects?: string[] } | null
    expect(cached?.redirects).toEqual(remoteRedirects)
    expect(kvStore.has(KV_KEY)).toBe(true)
    expect(writeDataPoint).toHaveBeenCalledTimes(1)
    expect(writeDataPoint).toHaveBeenCalledWith(
      expect.objectContaining({
        blobs: ["redirect", "GET", "unknown", "miss"],
        doubles: expect.arrayContaining([301]),
        indexes: ["zap"]
      })
    )
  })
})

describe("analytics data model", () => {
  const realFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = realFetch
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it("writes exactly 4 blobs, 2 doubles, and 1 index per data point", async () => {
    const { env, writeDataPoint } = createMockEnv({ "/": { body: "home" } })
    await handler.fetch(new Request("https://dcw.soy/"), env, createExecutionContext())

    expect(writeDataPoint).toHaveBeenCalledTimes(1)
    const dataPoint = writeDataPoint.mock.calls[0][0]
    expect(dataPoint.blobs).toHaveLength(4)
    expect(dataPoint.doubles).toHaveLength(2)
    expect(dataPoint.indexes).toHaveLength(1)
  })

  it("records non-negative response time", async () => {
    const { env, writeDataPoint } = createMockEnv({ "/": { body: "home" } })
    await handler.fetch(new Request("https://dcw.soy/"), env, createExecutionContext())

    const dataPoint = writeDataPoint.mock.calls[0][0]
    expect(dataPoint.doubles[1]).toBeGreaterThanOrEqual(0)
  })

  it("reports redirect_fallback with cache miss when redirect list is unavailable", async () => {
    const fetchMock = vi.fn(async () => new Response("error", { status: 500 }))
    globalThis.fetch = fetchMock

    const { env, writeDataPoint } = createMockEnv()
    const response = await handler.fetch(new Request("https://dcw.soy/anything"), env, createExecutionContext())

    expect(response.status).toBe(301)
    expect(writeDataPoint).toHaveBeenCalledTimes(1)
    expect(writeDataPoint).toHaveBeenCalledWith(
      expect.objectContaining({
        blobs: ["redirect_fallback", "GET", "unknown", "miss"],
        doubles: expect.arrayContaining([301]),
        indexes: ["anything"]
      })
    )
  })
})

describe("stats API", () => {
  const realFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = realFetch
  })

  afterEach(() => {
    globalThis.fetch = realFetch
  })

  const analyticsResponse = {
    data: [{ total_requests: 100, redirects: 80, not_found: 5, static_served: 15, avg_response_ms: 2.5 }],
    meta: [],
    rows: 1,
    rows_before_limit_at_least: 1
  }

  function mockAnalyticsFetch() {
    return vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
      if (url.includes("analytics_engine/sql")) {
        return new Response(JSON.stringify(analyticsResponse), { status: 200 })
      }
      return new Response("not found", { status: 404 })
    })
  }

  it("returns JSON for valid endpoints", async () => {
    globalThis.fetch = mockAnalyticsFetch()
    const { env } = createMockEnv()
    const response = await handler.fetch(
      new Request("https://dcw.soy/stats/api/overview"),
      env,
      createExecutionContext()
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Type")).toBe("application/json")
    const body = await response.json()
    expect(body).toEqual(analyticsResponse.data)
  })

  it("returns 404 for unknown endpoints", async () => {
    const { env } = createMockEnv()
    const response = await handler.fetch(
      new Request("https://dcw.soy/stats/api/unknown"),
      env,
      createExecutionContext()
    )

    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body).toHaveProperty("error")
  })

  it("returns 500 on query failure", async () => {
    globalThis.fetch = vi.fn(async () => new Response("internal error", { status: 500 }))
    const { env } = createMockEnv()
    const response = await handler.fetch(
      new Request("https://dcw.soy/stats/api/overview"),
      env,
      createExecutionContext()
    )

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).toHaveProperty("error")
  })

  it("does not write analytics events for stats API requests", async () => {
    globalThis.fetch = mockAnalyticsFetch()
    const { env, writeDataPoint } = createMockEnv()
    await handler.fetch(new Request("https://dcw.soy/stats/api/overview"), env, createExecutionContext())

    expect(writeDataPoint).not.toHaveBeenCalled()
  })

  it("serves /stats from ASSETS (not intercepted by API handler)", async () => {
    const { env, assetsFetch } = createMockEnv({
      "/stats": { body: "dashboard", status: 200 },
      "/stats/": { body: "dashboard", status: 200 }
    })
    const response = await handler.fetch(new Request("https://dcw.soy/stats"), env, createExecutionContext())

    expect(assetsFetch).toHaveBeenCalled()
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("dashboard")
  })

  it("handles all five endpoint names", async () => {
    globalThis.fetch = mockAnalyticsFetch()
    const { env } = createMockEnv()
    const endpoints = ["overview", "traffic", "paths", "countries", "cache"]

    for (const endpoint of endpoints) {
      const response = await handler.fetch(
        new Request(`https://dcw.soy/stats/api/${endpoint}`),
        env,
        createExecutionContext()
      )
      expect(response.status).toBe(200)
    }
  })
})
