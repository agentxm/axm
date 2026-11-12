/** Controlled wire protocols for distribution benchmarks. No production service is contacted. */
import type * as http from "node:http";
import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import * as Schema from "effect/Schema";
import { startHttpRegistry } from "@agentxm/client-e2e-utils/registry";

const timestamp = "2026-01-01T00:00:00.000Z";
const revision = '"benchmark-revision"';
const record = Schema.Record(Schema.String, Schema.Unknown);
class RegistryFixtureFailure extends Data.TaggedError("RegistryFixtureFailure")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}
const readBody = (request: http.IncomingMessage) =>
  Effect.tryPromise({
    try: async () => {
      const chunks: Buffer[] = [];
      let length = 0;
      for await (const chunk of request) {
        if (!Buffer.isBuffer(chunk))
          throw new RegistryFixtureFailure({ detail: "Expected request bytes" });
        length += chunk.length;
        if (length > 512 * 1024)
          throw new RegistryFixtureFailure({ detail: "Benchmark request exceeds fixture limit" });
        chunks.push(chunk);
      }
      return Schema.decodeUnknownSync(Schema.fromJsonString(record))(
        Buffer.concat(chunks).toString("utf8"),
      );
    },
    catch: (cause) =>
      cause instanceof RegistryFixtureFailure
        ? cause
        : new RegistryFixtureFailure({ detail: "Cannot read benchmark Registry request", cause }),
  });

const send = (response: http.ServerResponse, body: unknown, status = 200): void => {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

const kindFor = (plural: string): string => {
  const kinds: Readonly<Record<string, string>> = {
    skills: "skill",
    subagents: "subagent",
    mcps: "mcp-server",
    hooks: "hook",
    rules: "rule",
    knowledge: "knowledge",
    packs: "pack",
  };
  const kind = kinds[plural];
  if (kind === undefined) throw new Error(`Unknown fixture kind ${plural}`);
  return kind;
};

interface LifecycleState {
  archival: { readonly archivedAt: string; readonly message: string } | null;
  deprecation: {
    readonly deprecatedAt: string;
    readonly reason: "unmaintained";
    readonly message: string;
  } | null;
  visibility: "public" | "private";
  yanked: boolean;
}

export interface DistributionRegistryInitialState {
  readonly archived?: boolean;
  readonly deprecated?: boolean;
  readonly yanked?: boolean;
  readonly private?: boolean;
}

export const startDistributionRegistry = async (initial: DistributionRegistryInitialState = {}) => {
  const states = new Map<string, LifecycleState>();
  const availableVersions = new Map<string, Set<string>>();
  let observedRequests = 0;
  let serverProcessingMs = 0;
  let responseBytes = 0;
  const stateFor = (target: string): LifecycleState => {
    const existing = states.get(target);
    if (existing !== undefined) return existing;
    const state: LifecycleState = {
      archival:
        initial.archived === true ? { archivedAt: timestamp, message: "Fixture archived" } : null,
      deprecation:
        initial.deprecated === true
          ? { deprecatedAt: timestamp, reason: "unmaintained", message: "Fixture deprecated" }
          : null,
      visibility: initial.private === true ? "private" : "public",
      yanked: initial.yanked === true,
    };
    states.set(target, state);
    return state;
  };
  const registry = await startHttpRegistry({
    enforcePackDependencies: true,
    handleRequest: (request, response) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const started = performance.now();
          const initialBytes = request.socket.bytesWritten;
          response.once("finish", () => {
            observedRequests += 1;
            serverProcessingMs += performance.now() - started;
            responseBytes += request.socket.bytesWritten - initialBytes;
          });
          const origin = `http://${request.headers.host ?? "127.0.0.1"}`;
          const url = new URL(request.url ?? "/", origin);
          const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
          const method = request.method ?? "GET";
          if (url.pathname === "/v1/auth/me") {
            send(response, {
              user: {
                id: "user_01h455vb4pexka56gq5w2r7cpc",
                handle: "@benchmark",
                email: "benchmark@example.test",
              },
              token: {
                id: "tok_01h455vb4pexka56gq5w2r7cpc",
                type: "session",
                name: null,
                prefix: null,
                permissions: null,
                authority: "account",
                expiresAt: "2099-01-01T00:00:00.000Z",
                approvedAt: timestamp,
                trustedPublisher: null,
              },
            });
            return true;
          }
          if (
            url.pathname === "/v1/owners/%40benchmark" ||
            url.pathname === "/v1/owners/@benchmark"
          ) {
            send(response, { displayName: "Benchmark Owner" });
            return true;
          }
          if (url.pathname === "/v1/discovery" && method === "POST") {
            const body = yield* readBody(request);
            const packages = Schema.decodeUnknownSync(
              Schema.Array(Schema.Struct({ purl: Schema.String, version: Schema.String })),
            )(body["packages"]);
            send(response, {
              results: packages.map((item) => ({
                ...item,
                status: "resolved",
                extensions: [
                  {
                    ref: "@benchmark/skills/benchmark",
                    resolved: true,
                    source: { type: "registry", url: origin },
                    extension: {
                      owner: "@benchmark",
                      type: "skill",
                      name: "benchmark",
                      resolution: { type: "registry", version: "1.0.0" },
                    },
                    attestedBy: ["package"],
                    official: true,
                    packageVersionInRange: true,
                  },
                ],
              })),
            });
            return true;
          }
          if (parts[0] !== "v1" || parts[1] !== "extensions") return false;
          const owner = parts[2];
          const plural = parts[3];
          const name = parts[4];
          if (owner === undefined || plural === undefined || name === undefined) return false;
          const target = `${owner}/${plural}/${name}`;
          const state = stateFor(target);
          const segment = parts[5];
          if (segment === "visibility" && method === "GET") {
            const value = url.searchParams.get("intentVisibility");
            const intent =
              value === null
                ? null
                : {
                    value,
                    source: url.searchParams.get("intentSource"),
                    fingerprint: url.searchParams.get("intentFingerprint"),
                  };
            send(response, {
              target,
              intent,
              request: null,
              resolved: { value: state.visibility, disposition: "preserve", source: "existing" },
              actual: { value: state.visibility, revision },
              comparison:
                intent === null
                  ? "unconfigured"
                  : intent.value === state.visibility
                    ? "match"
                    : "drift",
              findings: [],
            });
            return true;
          }
          if (segment === undefined && method === "PATCH") {
            const body = yield* readBody(request);
            const value = Schema.decodeUnknownSync(Schema.Literals(["public", "private"]))(
              body["visibility"],
            );
            const before = state.visibility;
            state.visibility = value;
            send(response, {
              target,
              before,
              after: value,
              authority: body["authority"],
              result: before === value ? "already-satisfied" : "changed",
              revision,
            });
            return true;
          }
          if (segment === "archival" || segment === "deprecation") {
            const before = state[segment];
            if (method === "GET") {
              send(response, { [segment]: before, revision });
              return true;
            }
            if (method === "PUT") {
              const body = yield* readBody(request);
              const message =
                typeof body["message"] === "string" ? body["message"] : "Fixture state";
              if (segment === "archival") state.archival = { archivedAt: timestamp, message };
              else state.deprecation = { deprecatedAt: timestamp, reason: "unmaintained", message };
            } else if (method === "DELETE") {
              if (segment === "archival") state.archival = null;
              else state.deprecation = null;
            } else return false;
            const after = state[segment];
            send(response, {
              target,
              before,
              after,
              disposition:
                JSON.stringify(before) === JSON.stringify(after)
                  ? "unchanged"
                  : after === null
                    ? "restored"
                    : before === null
                      ? "created"
                      : "edited",
              revision,
            });
            return true;
          }
          if (parts[6] === "yank" && segment !== undefined) {
            const before = state.yanked
              ? { yankedAt: timestamp, yankCategory: "broken", yankMessage: "Fixture state" }
              : { yankedAt: null, yankCategory: null, yankMessage: null };
            if (segment === "versions") {
              yield* readBody(request);
              const affected = [...(availableVersions.get(target) ?? [])].sort();
              availableVersions.set(target, new Set());
              state.yanked = true;
              send(response, {
                selection: "all-available",
                affectedVersions: affected,
                futureVersionsAffected: false,
                before: affected,
                after: [],
                disposition: affected.length > 0 ? "changed" : "already-current",
                revision,
              });
              return true;
            }
            let category: unknown = null;
            let message: unknown = null;
            if (method === "POST") {
              const body = yield* readBody(request);
              category = body["category"] ?? null;
              message = body["message"] ?? null;
            } else if (method !== "DELETE") return false;
            const yanked = method === "POST";
            const changed = state.yanked !== yanked;
            state.yanked = yanked;
            const available = availableVersions.get(target) ?? new Set<string>();
            if (yanked) available.delete(segment);
            else available.add(segment);
            availableVersions.set(target, available);
            send(response, {
              owner,
              type: kindFor(plural),
              name,
              version: segment,
              links: { html: `${origin}/${target}` },
              before,
              yankedAt: yanked ? timestamp : null,
              yankCategory: yanked ? category : null,
              yankMessage: yanked ? message : null,
              disposition: changed ? "changed" : "already-current",
              revision,
            });
            return true;
          }
          return false;
        }),
      ),
  });
  return {
    ...registry,
    seed: (input: Parameters<typeof registry.seed>[0]) => {
      registry.seed(input);
      const target = `${input.owner}/${input.plural}/${input.name}`;
      const available = availableVersions.get(target) ?? new Set<string>();
      if (initial.yanked !== true) available.add(input.version);
      availableVersions.set(target, available);
    },
    stateFor,
    resetMetrics: () => {
      observedRequests = 0;
      serverProcessingMs = 0;
      responseBytes = 0;
    },
    metrics: () => ({
      requests: observedRequests,
      serverProcessingMs,
      responseWireBytes: responseBytes,
    }),
  };
};
