import { createHash } from "node:crypto";
import { join } from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import { runTraceInspection } from "./trace-inspect.js";

const traceId = "0123456789abcdef0123456789abcdef";
const spanId = "0123456789abcdef";
const receipt = {
  schemaVersion: 2,
  service: "axm",
  traceId,
  spanId,
  mode: "summary",
  detailSelection: { kinds: [], phase: null },
  commandRoute: "unresolved",
  build: {
    version: "0.51.0",
    revision: "1".repeat(40),
    dirty: false,
    execution: "source",
    runtime: "bun",
    runtimeVersion: "1.4.4",
  },
  timings: {
    startupMillis: 2,
    executionMillis: 12,
    runtimeElapsedAtExecutionEndMillis: 14,
    exportFinalizationMillis: 3,
  },
  producerComplete: true,
  retainedSpanCount: 1,
  spanIdsSha256: createHash("sha256").update(spanId).digest("hex"),
  aggregateEventCount: 0,
  aggregateEventsSha256: createHash("sha256").update("").digest("hex"),
  droppedAggregateEventCount: 0,
  droppedSpanCount: 0,
  unrecognizedSpanCount: 0,
  unrecognizedAttributeCount: 0,
  summaryOverflowCount: 0,
};
const tree = {
  traceId,
  complete: true,
  root: {
    type: "span",
    spanId,
    message: "axm.cli.invocation",
    elapsedMs: 12,
    columns: {
      "@Properties": { axm: { outcome: "success", command: { route: "unresolved" } } },
      "@Resource.service.name": "axm",
      "@Resource.service.version": "0.51.0",
      "@Resource.axm.build.revision": receipt.build.revision,
      "@Resource.axm.build.dirty": receipt.build.dirty,
      "@Resource.axm.execution.kind": receipt.build.execution,
      "@Resource.process.runtime.name": receipt.build.runtime,
      "@Resource.process.runtime.version": receipt.build.runtimeVersion,
    },
  },
};

// Substitute only Seq at the child-process port; real filesystem and child streams exercise the workflow boundary.
const fixture = Effect.fnUntraced(function* (
  response: string,
  exitCode = 0,
  version = "2026.1.1+fixture",
  stderr = "PRIVATE_QUERY_KEY",
) {
  const fs = yield* FileSystem.FileSystem;
  const realSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "axm-trace-inspect-" });
  const receiptPath = join(directory, "receipt with spaces.json");
  yield* fs.writeFileString(receiptPath, JSON.stringify(receipt));
  const commands: Array<ChildProcess.StandardCommand> = [];
  const spawner = ChildProcessSpawner.make((command) => {
    if (command._tag !== "StandardCommand")
      return Effect.fail(
        PlatformError.badArgument({
          module: "ChildProcess",
          method: "spawn",
          description: "Unexpected pipeline",
        }),
      );
    commands.push(command);
    const isVersion = command.args.includes("version");
    return realSpawner.spawn(
      ChildProcess.make(process.execPath, [
        "-e",
        "process.stdout.write(process.argv[1]);process.stderr.write(process.argv[3]);process.exitCode=Number(process.argv[2]);",
        isVersion ? version : response,
        String(isVersion ? 0 : exitCode),
        isVersion ? "PRIVATE_QUERY_KEY" : stderr,
      ]),
    );
  });
  const files = FileSystem.make({
    ...fs,
    readFile: (path) =>
      path.endsWith("mise.toml")
        ? Effect.succeed(new TextEncoder().encode('"github:datalust/seqcli" = "2026.1.1"'))
        : fs.readFile(path),
  });
  const inspect = (args: ReadonlyArray<string> = []) =>
    runTraceInspection(["--receipt", receiptPath, ...args], {
      SEQCLI_CONNECTION_APIKEY: "PRIVATE_QUERY_KEY",
    }).pipe(
      Effect.provideService(FileSystem.FileSystem, files),
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
    );
  return {
    inspect,
    commands,
    replaceReceipt: (document: unknown) =>
      fs.writeFileString(receiptPath, JSON.stringify(document)),
    removeReceipt: fs.remove(receiptPath),
  };
});

it.effect(
  "retrieves a full tree with the pinned client and keeps credentials out of arguments and output",
  () =>
    Effect.gen(function* () {
      const { inspect, commands } = yield* fixture(JSON.stringify(tree));
      const output = yield* inspect(["--span-id", spanId]);
      expect(output).toMatchObject({
        evidence: { spanIdentityVerified: true, expectations: "not-supplied" },
      });
      expect(commands).toHaveLength(2);
      expect(commands[1]?.args).toEqual([
        "exec",
        "--",
        "seqcli",
        "trace",
        `--id=${traceId}`,
        "--json",
        "--logs",
        "--column=@Properties",
        "--column=@Resource.service.name",
        "--column=@Resource.service.version",
        "--column=@Resource.axm.build.revision",
        "--column=@Resource.axm.build.dirty",
        "--column=@Resource.axm.execution.kind",
        "--column=@Resource.process.runtime.name",
        "--column=@Resource.process.runtime.version",
      ]);
      expect(commands[1]?.options.env).toMatchObject({
        SEQCLI_CONNECTION_APIKEY: "PRIVATE_QUERY_KEY",
        SEQCLI_CONNECTION_SERVERURL: "http://127.0.0.1:5341",
      });
      expect(commands[1]?.options.shell).not.toBe(true);
      expect(JSON.stringify(commands.map((command) => command.args))).not.toContain(
        "PRIVATE_QUERY_KEY",
      );
      expect(JSON.stringify(output)).not.toContain("PRIVATE_QUERY_KEY");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect(
  "distinguishes exact trace absence from private Seq errors, malformed responses and a different client version",
  () =>
    Effect.gen(function* () {
      const absent = `No events found for trace ${traceId}\n`;
      for (const [response, code, version, stderr, expectedCode] of [
        ["", 1, "2026.1.1+fixture", absent, "trace-not-found"],
        ["PRIVATE_QUERY_KEY", 1, "2026.1.1+fixture", absent, "seq-unavailable"],
        ["", 1, "2026.1.1+fixture", absent + "PRIVATE_QUERY_KEY", "seq-unavailable"],
        ["", 1, "2026.1.1+fixture", absent.replace(traceId, "f".repeat(32)), "seq-unavailable"],
        ["", 2, "2026.1.1+fixture", absent, "seq-unavailable"],
        ["", 1, "2026.1.1+fixture", absent + " ".repeat(4096), "seq-unavailable"],
        [
          "PRIVATE_QUERY_KEY",
          2,
          "2026.1.1+fixture",
          "PRIVATE_QUERY_KEY".repeat(4096),
          "seq-unavailable",
        ],
        ["PRIVATE_QUERY_KEY", 0, "2026.1.1+fixture", "PRIVATE_QUERY_KEY", "invalid-json"],
        [JSON.stringify(tree), 0, "2026.1.2", "PRIVATE_QUERY_KEY", "seq-version"],
      ] as const) {
        const { inspect } = yield* fixture(response, code, version, stderr);
        const failure = yield* Effect.flip(inspect());
        expect(failure).toMatchObject({ code: expectedCode });
        expect(JSON.stringify(failure)).not.toContain("PRIVATE_QUERY_KEY");
      }
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect("rejects remote endpoints and unsafe or unbounded arguments before invoking Seq", () =>
  Effect.gen(function* () {
    const rejected = yield* Effect.flip(
      runTraceInspection(["--receipt", "PRIVATE"], {
        SEQCLI_CONNECTION_SERVERURL: "https://remote.invalid",
      }),
    );
    expect(rejected).toMatchObject({ code: "invalid-arguments" });
    const { inspect, commands } = yield* fixture(JSON.stringify(tree));
    expect(yield* Effect.flip(inspect(["--span-id", "$(touch SECRET)"]))).toMatchObject({
      code: "invalid-arguments",
    });
    expect(yield* Effect.flip(inspect(["--max-nodes", "100001"]))).toMatchObject({
      code: "invalid-arguments",
    });
    expect(commands).toHaveLength(0);
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect(
  "selects one projected query for a large declared capture without first loading a capped tree",
  () =>
    Effect.gen(function* () {
      const { inspect, commands, replaceReceipt } = yield* fixture(
        JSON.stringify({
          Columns: [
            "traceId",
            "spanId",
            "parentSpanId",
            "isSpan",
            "message",
            "elapsedMs",
            "c0",
            "c1",
            "c2",
            "c3",
            "c4",
            "c5",
            "c6",
            "c7",
          ],
          Rows: [],
        }),
      );
      yield* replaceReceipt({
        ...receipt,
        mode: "detail",
        detailSelection: { kinds: ["io"], phase: null },
        retainedSpanCount: 10_000,
      });
      expect(yield* Effect.flip(inspect())).toMatchObject({ code: "identity-mismatch" });
      expect(commands).toHaveLength(2);
      expect(commands[1]?.args.slice(0, 7)).toEqual([
        "exec",
        "--",
        "seqcli",
        "query",
        "--json",
        "--timeout=15000",
        "--query",
      ]);
      expect(commands[1]?.args.at(-1)).toContain(`where @TraceId = '${traceId}' limit 10001`);
      expect(commands.some((command) => command.args.includes("trace"))).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect(
  "reports disabled, unfinished, failed setup and unavailable receipt without querying Seq",
  () =>
    Effect.gen(function* () {
      const { inspect, commands, replaceReceipt, removeReceipt } = yield* fixture(
        JSON.stringify(tree),
      );
      for (const [captureState, code] of [
        ["disabled", "export-disabled"],
        ["invalid-endpoint", "invalid-endpoint"],
        ["setup-failed", "setup-failed"],
        ["starting", "producer-incomplete"],
      ]) {
        yield* replaceReceipt({ schemaVersion: 2, service: "axm", captureState });
        expect(yield* Effect.flip(inspect())).toMatchObject({ code });
      }
      for (const incomplete of [
        { ...receipt, producerComplete: false },
        { ...receipt, timings: null },
      ]) {
        yield* replaceReceipt(incomplete);
        expect(yield* Effect.flip(inspect())).toMatchObject({ code: "producer-incomplete" });
      }
      for (const loss of [
        { ...receipt, droppedSpanCount: 1 },
        { ...receipt, droppedAggregateEventCount: 1 },
        { ...receipt, unrecognizedSpanCount: 1 },
        { ...receipt, unrecognizedAttributeCount: 1 },
        { ...receipt, summaryOverflowCount: 1 },
        { ...receipt, retainedSpanCount: 2050 },
        { ...receipt, aggregateEventCount: 513 },
      ]) {
        yield* replaceReceipt(loss);
        expect(yield* Effect.flip(inspect())).toMatchObject({ code: "producer-loss" });
      }
      for (const invalidSelection of [
        { mode: "summary", detailSelection: { kinds: ["io"], phase: null } },
        { mode: "detail", detailSelection: { kinds: [], phase: null } },
        { mode: "detail", detailSelection: { kinds: ["io", "io"], phase: null } },
        { mode: "summary", detailSelection: { kinds: [], phase: "planning" } },
      ]) {
        yield* replaceReceipt({ ...receipt, ...invalidSelection });
        expect(yield* Effect.flip(inspect())).toMatchObject({ code: "receipt-unavailable" });
      }
      yield* removeReceipt;
      expect(yield* Effect.flip(inspect())).toMatchObject({ code: "receipt-unavailable" });
      expect(commands).toHaveLength(0);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
