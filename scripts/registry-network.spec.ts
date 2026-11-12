import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Schema from "effect/Schema";
import { controlNetwork } from "./registry-network/control.js";

export const specification = defineSpecification({
  requirement: "tooling/registry-network-profiles",
  title: "Local registry network profiles are explicit and isolated",
  statement:
    "The development registry network workflow shall configure explicit loopback latency profiles, report actual proxy configuration, isolate worktree ownership, and remove only its own proxy without modifying CLI settings or admitting partially configured traffic.",
  class: "quality",
  characteristic: "reliability",
  role: "supporting",
  goals: ["dependable-change-process"],
  boundary: "memory",
  boundaryRationale:
    "The real Effect controller talks through the HTTP client to an in-memory Toxiproxy API substitute. This establishes request ordering and ownership, not native proxy latency, reachability, or platform support.",
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const ProxyInput = Schema.Struct({
  name: Schema.String,
  listen: Schema.String,
  upstream: Schema.String,
  enabled: Schema.Boolean,
});
const Enabled = Schema.Struct({ enabled: Schema.Boolean });
const ToxicInput = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
  stream: Schema.String,
  toxicity: Schema.Number,
  attributes: Schema.Record(Schema.String, Schema.Number),
});
type StoredProxy = typeof ProxyInput.Type & { toxics: Array<typeof ToxicInput.Type> };

const fixture = (failSecondToxic = false) => {
  const proxies = new Map<string, StoredProxy>();
  const requests: Array<{ method: string; path: string }> = [];
  const enabledOnCreate: boolean[] = [];
  let additions = 0;
  const fetcher: typeof globalThis.fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const request =
        input instanceof Request
          ? new Request(input, init)
          : new Request(typeof input === "string" ? input : input.href, init);
      const path = new URL(request.url).pathname;
      requests.push({ method: request.method, path });
      if (path === "/proxies" && request.method === "POST") {
        const body = Schema.decodeUnknownSync(ProxyInput)(await request.json());
        if (proxies.has(body.name)) return new Response(null, { status: 409 });
        enabledOnCreate.push(body.enabled);
        const proxy = { ...body, toxics: [] };
        proxies.set(body.name, proxy);
        return Response.json(proxy, { status: 201 });
      }
      const name = path.split("/")[2] ?? "";
      const proxy = proxies.get(name);
      if (proxy === undefined) return new Response(null, { status: 404 });
      if (request.method === "GET") return Response.json(proxy);
      if (request.method === "DELETE") {
        proxies.delete(name);
        return new Response(null, { status: 204 });
      }
      if (path.endsWith("/toxics")) {
        additions += 1;
        if (failSecondToxic && additions === 2) return new Response(null, { status: 500 });
        const toxic = Schema.decodeUnknownSync(ToxicInput)(await request.json());
        proxy.toxics.push(toxic);
        return Response.json(toxic);
      }
      const enabled = Schema.decodeUnknownSync(Enabled)(await request.json());
      proxies.set(name, { ...proxy, ...enabled });
      return Response.json(proxies.get(name));
    },
    { preconnect: () => undefined },
  );
  const run = (options: Parameters<typeof controlNetwork>[0]) =>
    controlNetwork(options).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetcher),
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error", cache: "no-store" }),
    );
  return { proxies, requests, enabledOnCreate, run };
};
const base = { worktree: "/work/one", api: "http://127.0.0.1:8474" };
const start = {
  ...base,
  action: "start",
  upstream: "http://localhost:8787",
  port: 18080,
} satisfies Parameters<typeof controlNetwork>[0];

describe("local registry network profiles", () => {
  it.effect("adds symmetric delay before enabling the listener and reports actual drift", () =>
    Effect.gen(function* () {
      const server = fixture();
      const result = yield* server.run({ ...start, profile: "typical" });
      expect(server.enabledOnCreate).toEqual([false]);
      expect(result.registryOrigin).toBe("http://127.0.0.1:18080");
      expect(result.proxy?.upstream).toBe("127.0.0.1:8787");
      expect(result.proxy?.toxics.map((toxic) => [toxic.stream, toxic.attributes])).toEqual([
        ["upstream", { latency: 50, jitter: 0 }],
        ["downstream", { latency: 50, jitter: 0 }],
      ]);
      const proxy = server.proxies.get(result.owner);
      if (proxy === undefined) throw new Error("Missing created proxy");
      proxy.toxics.pop();
      expect((yield* server.run({ ...base, action: "status" })).profile).toBe(
        "custom-or-incomplete",
      );
    }),
  );

  it.effect("isolates worktrees, refuses replacement, and makes owned cleanup idempotent", () =>
    Effect.gen(function* () {
      const server = fixture();
      const first = yield* server.run({ ...start, profile: "baseline" });
      const second = yield* server.run({
        ...start,
        worktree: "/work/two",
        port: 18081,
        profile: "constrained",
      });
      expect(first.proxy?.toxics).toEqual([]);
      expect(second.proxy?.toxics.find((toxic) => toxic.type === "bandwidth")?.attributes).toEqual({
        rate: 512,
      });
      const failure = yield* Effect.flip(server.run({ ...start, profile: "slow" }));
      expect(failure.message).toContain("already has a proxy");
      yield* server.run({ ...base, action: "stop" });
      expect((yield* server.run({ ...base, action: "stop" })).active).toBe(false);
      expect(server.proxies.has(second.owner)).toBe(true);
      expect(server.requests.some((request) => request.path === "/reset")).toBe(false);
    }),
  );

  it.effect.each([
    { profile: "slow", latency: 150, jitter: 0 },
    { profile: "variable", latency: 50, jitter: 25 },
  ] satisfies Array<{ profile: "slow" | "variable"; latency: number; jitter: number }>)(
    "reports $profile conditions on both streams",
    ({ profile, latency, jitter }) =>
      Effect.gen(function* () {
        const server = fixture();
        const result = yield* server.run({ ...start, profile });
        expect(result.profile).toBe(profile);
        expect(result.proxy?.toxics.map((toxic) => toxic.attributes)).toEqual([
          { latency, jitter },
          { latency, jitter },
        ]);
      }),
  );

  it.effect("cleans up a failed profile without ever enabling it", () =>
    Effect.gen(function* () {
      const server = fixture(true);
      expect((yield* Effect.flip(server.run(start))).message).toContain("HTTP 500");
      expect(server.proxies.size).toBe(0);
      expect(
        server.requests.filter(
          (request) => request.method === "POST" && /^\/proxies\/[^/]+$/.test(request.path),
        ),
      ).toEqual([]);
    }),
  );

  it.effect.each([
    "https://registry.example.com",
    "http://user:secret@localhost:8787",
    "http://localhost:8787/path",
    "http://localhost:8787/?secret=value",
  ])("rejects inadmissible upstreams before creating a proxy: %s", (upstream) =>
    Effect.gen(function* () {
      const server = fixture();
      yield* Effect.flip(server.run({ ...start, upstream }));
      expect(server.requests.every((request) => request.method === "GET")).toBe(true);
    }),
  );

  it.effect("rejects remote control APIs and a proxy pointing to its own listener", () =>
    Effect.gen(function* () {
      const server = fixture();
      yield* Effect.flip(server.run({ ...base, action: "status", api: "http://example.com" }));
      expect(server.requests).toEqual([]);
      expect(
        (yield* Effect.flip(server.run({ ...start, upstream: "http://127.0.0.1:18080" }))).message,
      ).toContain("distinct");
      expect(server.proxies.size).toBe(0);
    }),
  );
});
