/** Real child processes and a transparent loopback relay; neither fabricates telemetry. */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import { isAbsolute, join } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import * as Effect from "effect/Effect";
import * as Data from "effect/Data";
import * as Deferred from "effect/Deferred";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import {
  createBinaryRunner,
  createTempDir,
  runCommand,
  withoutLocalGitEnvironment,
  type CliResult,
  type RunCliOptions,
} from "@agentxm/client-e2e-utils";
import { resolveHostBinaryPath } from "../distribution-targets.js";

export class TraceFixtureError extends Data.TaggedError("TraceFixtureError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const repository = fileURLToPath(new URL("../../../../", import.meta.url));
const inspectorFixture = fileURLToPath(
  new URL("../fixtures/local-trace-inspection.mjs", import.meta.url),
);
const sourceEntry = fileURLToPath(new URL("../../../cli/src/main.ts", import.meta.url));
const invokeCompiled = createBinaryRunner(resolveHostBinaryPath());
export const command = (...args: Parameters<typeof runCommand>) =>
  Effect.tryPromise(() => runCommand(...args));
export const invoke = (
  kind: "source" | "compiled",
  args: ReadonlyArray<string>,
  options: RunCliOptions,
) =>
  Effect.gen(function* () {
    if (kind === "compiled") return yield* Effect.tryPromise(() => invokeCompiled(args, options));
    // Resolve the pinned runtime before replacing HOME/cwd, then use the exact
    // source condition published by `pnpm axm`; a built dependency fallback is
    // not equivalent source evidence.
    const runtime = yield* command("bun", ["--print", "process.execPath"], {
      cwd: repository,
      env: {
        MISE_AUTO_INSTALL: "false",
        MISE_NOT_FOUND_AUTO_INSTALL: "false",
        MISE_NOT_FOUND_SYSTEM_FALLBACK: "false",
      },
    });
    const executable = runtime.stdout.trim();
    if (runtime.exitCode !== 0 || !isAbsolute(executable) || !fs.existsSync(executable))
      return yield* new TraceFixtureError({
        message: "Bun did not identify its source runtime executable",
      });
    // Bun documents this cache separately from application state:
    // https://bun.sh/docs/runtime/environment-variables#runtime-transpiler-caching
    // Isolate it, rather than dropping files from the product-home state oracle.
    return yield* Effect.acquireUseRelease(
      Effect.sync(createTempDir),
      (cache) =>
        command(executable, ["--conditions=axm-source", sourceEntry, ...args], {
          ...options,
          env: { ...options.env, BUN_RUNTIME_TRANSPILER_CACHE_PATH: cache.path },
        }),
      (cache) => Effect.sync(cache.cleanup),
    );
  });

const progressClock = Schema.Struct({
  type: Schema.Literal("progress"),
  event: Schema.Struct({ atMs: Schema.Number }),
});
const jsonLine = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown));
/** Clock readings differ between processes; retain every other byte/field. Raw output is saved separately. */
export const comparableProduct = (result: CliResult) => ({
  ...result,
  stderr: result.stderr
    .split("\n")
    .map((line) => {
      const parsed = jsonLine(line);
      if (Option.isNone(parsed) || !Schema.is(progressClock)(parsed.value)) return line;
      return JSON.stringify({ ...parsed.value, event: { ...parsed.value.event, atMs: 0 } });
    })
    .join("\n"),
});
export const temporary = Effect.acquireRelease(Effect.sync(createTempDir), (value) =>
  Effect.sync(value.cleanup),
);
export const readJson = (path: string) =>
  Effect.try({ try: (): unknown => JSON.parse(fs.readFileSync(path, "utf8")), catch: String });
export const writeJson = (path: string, value: unknown) =>
  Effect.sync(() => fs.writeFileSync(path, JSON.stringify(value)));

export const evidenceDirectory = (name: string) =>
  Effect.sync(() => {
    const parent = join(repository, "test-results", "cli-e2e-tracing", "evidence");
    fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
    return fs.mkdtempSync(join(parent, name + "-"));
  });

export const sourceIdentity = Effect.gen(function* () {
  const revision = yield* command("git", ["rev-parse", "HEAD"], { cwd: repository });
  const status = yield* command("git", ["status", "--porcelain"], { cwd: repository });
  if (
    revision.exitCode !== 0 ||
    !/^[0-9a-f]{40}$/.test(revision.stdout.trim()) ||
    status.exitCode !== 0
  )
    return yield* new TraceFixtureError({ message: "Could not establish source identity" });
  return {
    AXM_TRACE_BUILD_REVISION: revision.stdout.trim(),
    AXM_TRACE_BUILD_DIRTY: status.stdout.length > 0 ? "1" : "0",
  };
});

/** Include untracked source in dirty-worktree provenance; never substitute HEAD alone. */
export const sourceTreeSha256 = Effect.gen(function* () {
  const listed = yield* command(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "apps/cli",
      "packages",
      "tools",
      "pnpm-lock.yaml",
      "package.json",
      "tsconfig.base.json",
      "mise.toml",
    ],
    { cwd: repository, exactOutput: true },
  );
  if (listed.exitCode !== 0)
    return yield* new TraceFixtureError({ message: "Could not inventory product source" });
  return yield* Effect.sync(() => {
    const digest = createHash("sha256");
    for (const relative of [...new Set(listed.stdout.split("\0").filter(Boolean))].sort()) {
      const absolute = join(repository, relative);
      digest.update(relative + "\0");
      if (fs.existsSync(absolute)) digest.update(fs.readFileSync(absolute));
      else digest.update("<deleted>");
      digest.update("\0");
    }
    return digest.digest("hex");
  });
});

export const rootEnvironment = (home: string) => ({
  HOME: home,
  AXM_USER_HOME: home,
  AXM_TELEMETRY: "0",
  AXM_NO_UPDATE_CHECK: "1",
  AXM_TOKEN: "",
  AXM_TRACE: "",
  AXM_TRACE_RECEIPT: "",
  AXM_TRACE_DETAIL: "",
  AXM_TRACE_DETAIL_PHASE: "",
  ACTIONS_ID_TOKEN_REQUEST_URL: "",
  ACTIONS_ID_TOKEN_REQUEST_TOKEN: "",
  CI: "0",
  // Exercise portable file credentials, independently of the host keychain.
  SSH_TTY: "/dev/axm-e2e",
});

const jsonResult = (result: CliResult) =>
  Effect.try({
    try: (): unknown => JSON.parse(result.stdout),
    catch: (cause) =>
      new TraceFixtureError({
        message: "Published trace inspection did not produce exactly one JSON document",
        cause,
      }),
  });
export const inspectReceipt = (
  receipt: string,
  expected?: string,
  extra: ReadonlyArray<string> = [],
) =>
  command(
    "pnpm",
    [
      "-s",
      "trace:inspect",
      "--receipt",
      receipt,
      ...(expected ? ["--expect", expected] : []),
      ...extra,
    ],
    { cwd: repository, timeout: 30_000 },
  ).pipe(
    Effect.flatMap((result) =>
      jsonResult(result).pipe(Effect.map((json) => ({ ...result, json }))),
    ),
  );

// Validate the public output fields these boundary cases use, without importing an app implementation.
const Numeric = Schema.NullOr(Schema.Number);
const Attributes = Schema.Record(Schema.String, Schema.Unknown);
const Summary = Schema.Struct({
  schemaVersion: Schema.Literal(2),
  detailSelection: Schema.Struct({
    kinds: Schema.Array(Schema.String),
    phase: Schema.NullOr(Schema.String),
  }),
  traceId: Schema.String,
  rootSpanId: Schema.String,
  mode: Schema.String,
  build: Schema.Struct({
    execution: Schema.String,
    revision: Schema.String,
    dirty: Schema.Boolean,
    runtime: Schema.String,
  }),
  evidence: Schema.Struct({
    producerComplete: Schema.Boolean,
    retrievalComplete: Schema.Boolean,
    spanIdentityVerified: Schema.Boolean,
    aggregateIdentityVerified: Schema.Boolean,
    detailCoverage: Schema.Literal("selected-span-delivery-only"),
    aggregateEventCount: Schema.Number,
    retainedDetailSpanCount: Schema.Number,
    expectations: Schema.String,
    retainedSpanCount: Schema.Number,
  }),
  invocation: Schema.Struct({ elapsedMs: Schema.Number, attributes: Attributes }),
  scope: Schema.Struct({ kind: Schema.String, spanId: Schema.String }),
  waits: Schema.Array(Schema.Struct({ name: Schema.String, elapsedMs: Schema.Number })),
  work: Schema.Array(
    Schema.Struct({
      kind: Schema.String,
      owner: Schema.String,
      ownerName: Schema.String,
      dimensions: Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Boolean])),
      count: Schema.Number,
      workCount: Numeric,
      requested: Numeric,
      executed: Numeric,
      reused: Numeric,
      bytes: Numeric,
      ioBytes: Numeric,
      archiveBytes: Numeric,
      archiveEntries: Numeric,
      batchItems: Numeric,
      registryBatchItems: Numeric,
      deniedItems: Numeric,
      workDurationMs: Numeric,
      measurements: Schema.Record(
        Schema.String,
        Schema.Struct({
          total: Schema.Number,
          measured: Schema.Number,
          occurrences: Schema.Number,
        }),
      ),
    }),
  ),
});

/** Seq delivery is asynchronous; retry only retrieval, always the same exact receipt identity. */
export const inspectEventually = (receipt: string, expected?: string) =>
  Effect.gen(function* () {
    let last = yield* inspectReceipt(receipt, expected);
    for (let attempt = 1; last.exitCode !== 0 && attempt < 20; attempt += 1) {
      yield* Effect.sleep("100 millis");
      last = yield* inspectReceipt(receipt, expected);
    }
    if (last.exitCode !== 0)
      return yield* new TraceFixtureError({ message: "Trace inspection failed: " + last.stdout });
    // Keep the complete published output, including build/timing fields that
    // this test's typed assertion subset does not otherwise consume.
    yield* Effect.sync(() => fs.writeFileSync(receipt + ".inspection.json", last.stdout));
    return yield* Schema.decodeUnknownEffect(Summary)(last.json);
  });

export const inspectFixture = (receipt: string, tree: string, expected: string, mutation: string) =>
  command("bun", [inspectorFixture, "inspect", receipt, tree, expected, mutation], {
    cwd: repository,
  }).pipe(
    Effect.flatMap((result) =>
      jsonResult(result).pipe(Effect.map((json) => ({ ...result, json }))),
    ),
  );

/** Preserve the complete Seq projection after the published inspector has verified its pin/identity. */
export const retrieveTree = (traceId: string, destination: string) =>
  Effect.gen(function* () {
    const columnsResult = yield* command("bun", [inspectorFixture, "columns"], { cwd: repository });
    const columns = yield* Schema.decodeUnknownEffect(Schema.Array(Schema.String))(
      yield* jsonResult(columnsResult),
    );
    const result = yield* command(
      "mise",
      [
        "exec",
        "--",
        "seqcli",
        "trace",
        `--id=${traceId}`,
        "--json",
        "--logs",
        ...columns.map((column) => `--column=${column}`),
      ],
      {
        cwd: repository,
        timeout: 30_000,
        env: {
          SEQCLI_CONNECTION_SERVERURL:
            process.env["SEQCLI_CONNECTION_SERVERURL"] ?? "http://127.0.0.1:5341",
        },
      },
    );
    if (result.exitCode !== 0)
      return yield* new TraceFixtureError({ message: "Raw exact Seq retrieval failed" });
    const value = yield* jsonResult(result);
    yield* writeJson(destination, value);
    return result.stdout;
  });

export const snapshotFiles = (directory: string): Readonly<Record<string, string>> => {
  const result: Record<string, string> = {};
  const walk = (current: string, relative: string) => {
    if (!fs.existsSync(current)) return;
    for (const item of fs.readdirSync(current, { withFileTypes: true })) {
      const key = relative ? relative + "/" + item.name : item.name;
      const absolute = join(current, item.name);
      if (item.isDirectory()) walk(absolute, key);
      else if (item.isSymbolicLink()) result[key] = "link:" + fs.readlinkSync(absolute);
      else result[key] = createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
    }
  };
  walk(directory, "");
  return result;
};

export type RelayBehavior = "forward" | "reject" | "stall" | "drop-first" | "hold" | "hold-body";
export const startTraceRelay = (upstream: string, initial: RelayBehavior = "forward") =>
  Effect.gen(function* () {
    const target = new URL(upstream);
    if (
      target.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
      target.username !== "" ||
      target.password !== "" ||
      target.search !== "" ||
      target.hash !== ""
    )
      return yield* new TraceFixtureError({
        message: "The trace E2E relay requires a loopback HTTP upstream",
      });
    let behavior = initial;
    const payloads: Buffer[] = [];
    const deliveries: Array<{
      action: "drop" | "forward" | "reject";
      channel: "traces" | "logs" | "product";
      status: number;
      bytes: number;
    }> = [];
    const pending: Array<() => void> = [];
    const bodyHolds: Array<{
      startedAtMillis: number;
      endedAtMillis: number | null;
      bytes: number;
    }> = [];
    let forwarded = 0;
    const server = http.createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const bytes = Buffer.concat(chunks);
        const otlp = target.pathname.endsWith("/v1/traces");
        const channel = otlp ? (request.url?.endsWith("/logs") ? "logs" : "traces") : "product";
        payloads.push(bytes);
        if (behavior === "stall") return;
        if (behavior === "reject") {
          response.once("finish", () =>
            deliveries.push({ action: "reject", channel, status: 503, bytes: bytes.length }),
          );
          response.writeHead(503).end();
          return;
        }
        if (behavior === "drop-first" && payloads.length === 1) {
          response.once("finish", () =>
            deliveries.push({ action: "drop", channel, status: 200, bytes: bytes.length }),
          );
          response.writeHead(200, { "content-type": "application/json" }).end("{}");
          return;
        }
        const send = () => {
          forwarded += 1;
          const outgoing = http.request(
            new URL(
              channel === "logs"
                ? target.pathname.replace(/traces$/, "logs")
                : target.pathname === "/"
                  ? (request.url ?? "/")
                  : target.pathname,
              target,
            ),
            {
              method: request.method,
              headers: { ...request.headers, host: target.host },
            },
            (received) => {
              response.once("finish", () =>
                deliveries.push({
                  action: "forward",
                  channel,
                  status: received.statusCode ?? 502,
                  bytes: bytes.length,
                }),
              );
              response.writeHead(received.statusCode ?? 502, received.headers);
              if (behavior === "hold-body") {
                const hold: (typeof bodyHolds)[number] = {
                  startedAtMillis: performance.now(),
                  endedAtMillis: null,
                  bytes: 0,
                };
                response.flushHeaders();
                const body: Buffer[] = [];
                received.on("data", (chunk: Buffer) => body.push(chunk));
                received.on("end", () => {
                  const bytes = Buffer.concat(body);
                  hold.bytes = bytes.length;
                  bodyHolds.push(hold);
                  pending.push(() => {
                    hold.endedAtMillis = performance.now();
                    response.end(bytes);
                  });
                });
              } else received.pipe(response);
            },
          );
          outgoing.on("error", () => {
            if (!response.destroyed) response.writeHead(502).end();
          });
          response.on("close", () => outgoing.destroy());
          outgoing.end(bytes);
        };
        if (behavior === "hold") pending.push(send);
        else send();
      });
    });
    yield* Effect.callback<void, TraceFixtureError>((resume) => {
      server.once("error", (cause) =>
        resume(
          Effect.fail(new TraceFixtureError({ message: "Trace relay failed to listen", cause })),
        ),
      );
      server.listen(0, "127.0.0.1", () => resume(Effect.void));
    });
    yield* Effect.addFinalizer(() =>
      Effect.callback<void>((resume) => {
        server.closeAllConnections();
        server.close(() => resume(Effect.void));
      }),
    );
    const address = server.address();
    if (address === null || typeof address === "string")
      return yield* new TraceFixtureError({ message: "Relay did not allocate a TCP port" });
    return {
      url: `http://127.0.0.1:${address.port}${target.pathname.endsWith("/v1/traces") ? "/v1/traces" : ""}`,
      payloads,
      deliveries,
      bodyHolds,
      forwarded: () => forwarded,
      setBehavior: (next: RelayBehavior) => {
        behavior = next;
      },
      release: () => {
        for (const send of pending.splice(0)) send();
      },
    };
  });

export const waitUntil = (condition: () => boolean) =>
  Effect.gen(function* () {
    while (!condition()) yield* Effect.sleep("10 millis");
  }).pipe(Effect.timeout("10 seconds"));

export const startKilledInvocation = (
  args: ReadonlyArray<string>,
  cwd: string,
  environment: Readonly<Record<string, string>>,
) =>
  Effect.acquireRelease(
    Effect.gen(function* () {
      const closed = yield* Deferred.make<string | null, TraceFixtureError>();
      const { FORCE_COLOR: _color, ...parent } = withoutLocalGitEnvironment(process.env);
      const child = spawn(resolveHostBinaryPath(), [...args], {
        cwd,
        env: { ...parent, ...environment, NO_COLOR: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.resume();
      child.stderr.resume();
      child.once("error", (cause) =>
        Deferred.doneUnsafe(
          closed,
          Effect.fail(new TraceFixtureError({ message: "Invocation process failed", cause })),
        ),
      );
      child.once("close", (_code, signal) => Deferred.doneUnsafe(closed, Effect.succeed(signal)));
      return { child, closed: Deferred.await(closed) };
    }),
    ({ child, closed }) =>
      Effect.sync(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      }).pipe(Effect.andThen(closed), Effect.ignore),
  );

export const seqEndpoint = () => {
  const connection = process.env["SEQCLI_CONNECTION_SERVERURL"] ?? "http://127.0.0.1:5341";
  return new URL("/ingest/otlp/v1/traces", connection).href;
};
