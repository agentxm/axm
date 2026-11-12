import { createHash } from "node:crypto";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";

export class NetworkControlError extends Data.TaggedError("NetworkControlError")<{
  readonly message: string;
}> {}

export const Profile = Schema.Literals(["baseline", "typical", "slow", "variable", "constrained"]);
type Profile = typeof Profile.Type;
const Toxic = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
  stream: Schema.Literals(["upstream", "downstream"]),
  toxicity: Schema.Number,
  attributes: Schema.Record(Schema.String, Schema.Number),
});
type Toxic = typeof Toxic.Type;
const Proxy = Schema.Struct({
  name: Schema.String,
  listen: Schema.String,
  upstream: Schema.String,
  enabled: Schema.Boolean,
  toxics: Schema.Array(Toxic),
});
type Proxy = typeof Proxy.Type;

export const profileToxics = (profile: Profile): ReadonlyArray<Toxic> => {
  const latency = profile === "baseline" ? 0 : profile === "slow" ? 150 : 50;
  const jitter = profile === "variable" ? 25 : 0;
  const toxics: Toxic[] =
    latency === 0
      ? []
      : ["upstream", "downstream"].map<Toxic>((stream) => ({
          name: `axm-latency-${stream}`,
          type: "latency",
          stream: stream === "upstream" ? "upstream" : "downstream",
          toxicity: 1,
          attributes: { latency, jitter },
        }));
  if (profile === "constrained") {
    toxics.push({
      name: "axm-bandwidth-downstream",
      type: "bandwidth",
      stream: "downstream",
      toxicity: 1,
      attributes: { rate: 512 },
    });
  }
  return toxics;
};

const profiles: ReadonlyArray<Profile> = ["baseline", "typical", "slow", "variable", "constrained"];
const identifyProfile = (proxy: Proxy) =>
  profiles.find((profile) => {
    const expected = profileToxics(profile);
    return (
      proxy.enabled &&
      proxy.toxics.length === expected.length &&
      expected.every((toxic) =>
        proxy.toxics.some(
          (actual) =>
            actual.name === toxic.name &&
            actual.type === toxic.type &&
            actual.stream === toxic.stream &&
            actual.toxicity === toxic.toxicity &&
            Object.keys(actual.attributes).length === Object.keys(toxic.attributes).length &&
            Object.entries(toxic.attributes).every(
              ([key, value]) => actual.attributes[key] === value,
            ),
        ),
      )
    );
  }) ?? "custom-or-incomplete";

export const loopbackOrigin = (value: string) =>
  Effect.gen(function* () {
    const url = yield* Effect.try({
      try: () => new URL(value),
      catch: () => new NetworkControlError({ message: "Expected a loopback HTTP origin." }),
    });
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return yield* new NetworkControlError({
        message: "Use a loopback HTTP origin without credentials, path, query, or fragment.",
      });
    }
    if (url.hostname === "localhost") url.hostname = "127.0.0.1";
    return url;
  });

export interface NetworkOptions {
  readonly action: "start" | "status" | "stop";
  readonly worktree: string;
  readonly api: string;
  readonly upstream?: string;
  readonly port?: number;
  readonly profile?: Profile;
}

/** Only this worktree's named proxy is addressed; never use the server-wide reset API. */
export const controlNetwork = (options: NetworkOptions) =>
  Effect.gen(function* () {
    const api = yield* loopbackOrigin(options.api);
    const name = `axm-registry-${createHash("sha256").update(options.worktree).digest("hex").slice(0, 20)}`;
    const route = `/proxies/${name}`;
    const client = yield* HttpClient.HttpClient;
    const request = (method: "GET" | "POST" | "DELETE", path: string, body?: unknown) =>
      Effect.scoped(
        Effect.gen(function* () {
          let req = HttpClientRequest.make(method)(`${api.origin}${path}`);
          if (body !== undefined)
            req = HttpClientRequest.bodyText(JSON.stringify(body), "application/json")(req);
          const response = yield* client.execute(req);
          const text = yield* response.text;
          return { status: response.status, text };
        }),
      ).pipe(Effect.timeout("5 seconds"));
    const requireStatus = (response: { readonly status: number }, status: number) =>
      response.status === status
        ? Effect.void
        : Effect.fail(
            new NetworkControlError({
              message: `Toxiproxy returned HTTP ${response.status}; expected ${status}. Inspect the server terminal.`,
            }),
          );
    const read = Effect.gen(function* () {
      const response = yield* request("GET", route);
      if (response.status === 404) return undefined;
      yield* requireStatus(response, 200);
      return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Proxy))(response.text);
    });
    const describe = (proxy: Proxy | undefined) => ({
      owner: name,
      api: api.origin,
      active: proxy?.enabled ?? false,
      profile: proxy === undefined ? null : identifyProfile(proxy),
      registryOrigin: proxy === undefined ? null : `http://${proxy.listen}`,
      proxy: proxy ?? null,
    });
    const existing = yield* read;
    if (options.action === "status") return describe(existing);
    if (options.action === "stop") {
      if (existing !== undefined) yield* requireStatus(yield* request("DELETE", route), 204);
      return describe(undefined);
    }
    if (existing !== undefined)
      return yield* new NetworkControlError({
        message:
          "This worktree already has a proxy. Inspect status, then stop it before starting another profile.",
      });
    if (options.upstream === undefined)
      return yield* new NetworkControlError({
        message: "start requires --upstream http://127.0.0.1:PORT for a running local registry.",
      });
    const upstream = yield* loopbackOrigin(options.upstream);
    const port = options.port ?? 18080;
    if (
      !Number.isInteger(port) ||
      port < 1024 ||
      port > 65535 ||
      port === Number(upstream.port || 80) ||
      port === Number(api.port || 80) ||
      upstream.origin === api.origin
    )
      return yield* new NetworkControlError({
        message:
          "Use a proxy port from 1024 to 65535, distinct from the registry and control API ports.",
      });
    const profile = options.profile ?? "typical";
    // Disabled until every toxic is installed: partial setup must never admit unshaped traffic.
    yield* requireStatus(
      yield* request("POST", "/proxies", {
        name,
        listen: `127.0.0.1:${port}`,
        upstream: `${upstream.hostname}:${upstream.port || 80}`,
        enabled: false,
      }),
      201,
    );
    return yield* Effect.gen(function* () {
      for (const toxic of profileToxics(profile)) {
        yield* requireStatus(yield* request("POST", `${route}/toxics`, toxic), 200);
      }
      yield* requireStatus(yield* request("POST", route, { enabled: true }), 200);
      const active = yield* read;
      if (
        active === undefined ||
        identifyProfile(active) !== profile ||
        active.listen !== `127.0.0.1:${port}` ||
        active.name !== name ||
        active.upstream !== `${upstream.hostname}:${upstream.port || 80}`
      ) {
        return yield* new NetworkControlError({
          message: "Proxy readback did not match the requested profile.",
        });
      }
      return describe(active);
    }).pipe(Effect.onError(() => request("DELETE", route).pipe(Effect.ignore)));
  });
