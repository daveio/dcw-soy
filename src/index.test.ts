import handler from "./index"
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest"

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

  const env = {
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

  return { env, kvStore: store, assetsFetch: env.ASSETS.fetch as ReturnType<typeof createAssetsFetch> }
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
    const { env, assetsFetch } = createMockEnv({ "/": { body: "home" } })
    const response = await handler.fetch(new Request("https://dcw.soy/"), env, createExecutionContext())

    expect(await response.text()).toBe("home")
    expect(assetsFetch).toHaveBeenCalledTimes(1)
  })

  it("serves static assets directly when present", async () => {
    const { env, assetsFetch } = createMockEnv({ "/soy.webp": { status: 200, body: "soy" } })
    const response = await handler.fetch(new Request("https://dcw.soy/soy.webp"), env, createExecutionContext())

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("soy")
    expect(assetsFetch).toHaveBeenCalledTimes(1)
  })

  it("redirects known paths using cached redirects", async () => {
    const { env, kvStore, assetsFetch } = createMockEnv()
    kvStore.set(KV_KEY, { redirects: ["foo"], lastUpdated: new Date().toISOString() })

    const response = await handler.fetch(new Request("https://dcw.soy/foo"), env, createExecutionContext())

    expect(assetsFetch).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(301)
    expect(response.headers.get("Location")).toBe("https://dave.io/go/foo")
  })

  it("serves the not-found page for invalid redirects", async () => {
    const { env, kvStore, assetsFetch } = createMockEnv({
      "/not-found.html": { body: "not-found", headers: { Location: "/should-remove" } }
    })
    kvStore.set(KV_KEY, { redirects: ["existing"], lastUpdated: new Date().toISOString() })

    const response = await handler.fetch(new Request("https://dcw.soy/missing"), env, createExecutionContext())

    expect(assetsFetch).toHaveBeenCalledTimes(2)
    expect(response.status).toBe(404)
    expect(response.headers.get("Location")).toBeNull()
    expect(await response.text()).toBe("not-found")
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

    const { env, kvStore, assetsFetch } = createMockEnv()
    const response = await handler.fetch(new Request("https://dcw.soy/zap"), env, createExecutionContext())

    expect(assetsFetch).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(301)
    expect(response.headers.get("Location")).toBe("https://dave.io/go/zap")

    const cached = (await env.KV.get(KV_KEY, "json")) as { redirects?: string[] } | null
    expect(cached?.redirects).toEqual(remoteRedirects)
    expect(kvStore.has(KV_KEY)).toBe(true)
  })
})
