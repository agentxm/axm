import { fixtureFailure } from "./observability-contract.js";
/** Deterministic, authenticated loopback management protocol with independent mutable state. */
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { RequestRecord } from "./lifecycle-registry.js";
import type { ObservabilityScenario, WorkspaceTemplate } from "./observability-fixtures.js";

const target = "@acme/skills/bench-managed";
const prefix = "/v1/extensions/" + target;
const instant = "2026-01-01T00:00:00.000Z";
const token = "synthetic-lifecycle-benchmark-token";
const archive = { archivedAt: instant, message: "Synthetic archive." };
const deprecation = {
  deprecatedAt: instant,
  reason: "obsolete",
  message: "Synthetic obsolete guidance.",
};
const available = { yankedAt: null, yankCategory: null, yankMessage: null };
const yanked = {
  yankedAt: instant,
  yankCategory: "broken",
  yankMessage: "Synthetic broken version.",
};
const transitionOutput = Schema.fromJsonString(
  Schema.Struct({
    ok: Schema.Literal(true),
    result: Schema.Struct({
      disposition: Schema.Literal("changed"),
      revision: Schema.Literal("revision-1"),
    }),
  }),
);
const document = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
);

const startManagementRegistry = Effect.gen(function* () {
  let archived = false;
  let deprecated = false;
  let retired = false;
  let revision = 0;
  let errors: string[] = [];
  let requests: RequestRecord[] = [];
  const snapshot = () => ({ archived, deprecated, retired, revision });
  const server = http.createServer((request, response) => {
    const startedAtMs = Date.now();
    const method = request.method ?? "GET";
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const send = (status: number, value: unknown) => {
      const body = JSON.stringify(value);
      requests.push({
        startedAtMs,
        finishedAtMs: Date.now(),
        key: method + " " + pathname,
        status,
        responseBytes: Buffer.byteLength(body),
        archiveBody: false,
      });
      response.writeHead(status, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      });
      response.end(body);
    };
    const handle = Effect.tryPromise({
      try: async () => {
        if (request.headers.authorization !== "Bearer " + token)
          throw fixtureFailure("Missing synthetic management authorization");
        const chunks: Buffer[] = [];
        let length = 0;
        for await (const chunk of request) {
          if (!Buffer.isBuffer(chunk)) throw fixtureFailure("Invalid management body chunk");
          length += chunk.byteLength;
          if (length > 65_536) throw fixtureFailure("Management request exceeds fixture limit");
          chunks.push(chunk);
        }
        const body = length === 0 ? {} : document(Buffer.concat(chunks).toString("utf8"));
        const currentRevision = "revision-" + revision;
        if (pathname === prefix + "/archival" || pathname === prefix + "/deprecation") {
          const archival = pathname.endsWith("/archival");
          const before = archival ? (archived ? archive : null) : deprecated ? deprecation : null;
          if (method === "GET")
            return archival
              ? { archival: before, revision: currentRevision }
              : { deprecation: before, revision: currentRevision };
          if (
            (method !== "PUT" && method !== "DELETE") ||
            request.headers["if-match"] !== currentRevision
          )
            throw fixtureFailure("Lifecycle mutation did not carry the observed revision");
          const enabled = method === "PUT";
          if (
            enabled &&
            (archival
              ? body["message"] !== archive.message
              : body["reason"] !== deprecation.reason ||
                body["message"] !== deprecation.message ||
                JSON.stringify(body["replacement"]) !== '{"kind":"clear"}')
          )
            throw fixtureFailure("Lifecycle mutation body differs from its requested operation");
          if ((archival ? archived : deprecated) === enabled)
            throw fixtureFailure("Lifecycle benchmark attempted a no-op");
          if (archival) archived = enabled;
          else deprecated = enabled;
          revision++;
          return {
            target,
            before,
            after: enabled ? (archival ? archive : deprecation) : null,
            disposition: enabled ? "created" : "restored",
            revision: "revision-" + revision,
          };
        }
        if (pathname === prefix + "/1.0.0/yank") {
          if (method !== "POST" && method !== "DELETE")
            throw fixtureFailure("Unsupported version lifecycle method");
          const enabled = method === "POST";
          if (
            enabled &&
            (body["category"] !== yanked.yankCategory || body["message"] !== yanked.yankMessage)
          )
            throw fixtureFailure("Yank body differs from its requested operation");
          if (retired === enabled) throw fixtureFailure("Yank benchmark attempted a no-op");
          const before = retired ? yanked : available;
          retired = enabled;
          revision++;
          return {
            owner: "@acme",
            type: "skill",
            name: "bench-managed",
            version: "1.0.0",
            ...(retired ? yanked : available),
            before,
            disposition: "changed",
            revision: "revision-" + revision,
            links: { html: "https://registry.example.test/@acme/skills/bench-managed" },
          };
        }
        throw fixtureFailure("Unexpected management route: " + method + " " + pathname);
      },
      catch: (cause) => fixtureFailure(String(cause)),
    });
    // HTTP callback is the runtime boundary; command and fixture lifetimes are scoped Effects.
    void Effect.runPromise(handle).then(
      (value) => send(200, value),
      (cause: unknown) => {
        errors.push(String(cause));
        send(400, { error: "Invalid lifecycle fixture request" });
      },
    );
  });
  yield* Effect.addFinalizer(() =>
    Effect.promise(
      () =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
  yield* Effect.tryPromise({
    try: () =>
      new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
      }),
    catch: (cause) => fixtureFailure(String(cause)),
  });
  const address = server.address();
  if (address === null || typeof address === "string")
    return yield* fixtureFailure("Lifecycle fixture has no TCP address");
  return {
    url: "http://127.0.0.1:" + address.port,
    snapshot,
    requests: () => requests,
    errors: () => errors,
    reset: (operation: string) =>
      Effect.sync(() => {
        archived = operation === "unarchive";
        deprecated = operation === "undeprecate";
        retired = operation === "unyank";
        revision = 0;
        errors = [];
        requests = [];
      }),
  };
});

export const prepareRegistryLifecycleObservabilityFixtures = Effect.fnUntraced(function* (options: {
  readonly root: string;
  readonly base: WorkspaceTemplate;
  readonly copy: (source: WorkspaceTemplate, destination: string) => WorkspaceTemplate;
}) {
  const server = yield* startManagementRegistry;
  const template = options.copy(options.base, path.join(options.root, "registry-management"));
  fs.writeFileSync(
    path.join(template.workspace, "axm.json"),
    JSON.stringify({
      owner: "@acme",
      agents: ["claude-code"],
      defaultRegistry: "management",
      sources: [{ name: "management", type: "registry", location: server.url }],
    }),
  );
  const cases = [
    { command: "archive", args: ["archive", target, "--message", archive.message] },
    { command: "unarchive", args: ["unarchive", target] },
    {
      command: "deprecate",
      args: ["deprecate", target, "--reason", "obsolete", "--message", deprecation.message],
    },
    { command: "undeprecate", args: ["undeprecate", target] },
    {
      command: "yank",
      args: ["yank", target + "@1.0.0", "--category", "broken", "--message", yanked.yankMessage],
    },
    { command: "unyank", args: ["unyank", target + "@1.0.0"] },
  ];
  return cases.map((item): ObservabilityScenario => ({
    ...item,
    id: "typed/registry/" + item.command,
    template,
    condition: {
      source: "registry",
      extensions: 1,
      cache: "not-applicable",
      network: "baseline",
      archiveBodyDelayMillis: 0,
    },
    environment: { AXM_TOKEN: token },
    requests: server.requests,
    external: { reset: server.reset(item.command), snapshot: server.snapshot },
    verify: ({ stdout }) =>
      Effect.gen(function* () {
        yield* Schema.decodeUnknownEffect(transitionOutput)(stdout);
        const state = server.snapshot();
        if (
          server.errors().length > 0 ||
          state.revision !== 1 ||
          state.archived !== (item.command === "archive") ||
          state.deprecated !== (item.command === "deprecate") ||
          state.retired !== (item.command === "yank")
        )
          return yield* fixtureFailure(
            "Independent management state did not reach the requested transition",
          );
        const expected = item.command === "yank" || item.command === "unyank" ? 1 : 2;
        if (
          server.requests().length !== expected ||
          server.requests().some((request) => request.status !== 200)
        )
          return yield* fixtureFailure("Unexpected lifecycle protocol request sequence");
        return {
          assertions: [
            "Independent Registry state changed exactly once",
            "Authenticated protocol requests carried the expected body and observed revision",
            "CLI acknowledged the independently retained transition",
          ],
        };
      }),
  }));
});
