import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  inspectLocalTrace,
  traceRetrievalPlan,
  decodeTraceRetrieval,
  TraceEvidenceFailure,
  TraceReceiptDocumentSchema,
} from "axm.sh/runtime";
import * as Console from "effect/Console";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

class TraceInspectionFailed extends Data.TaggedError("TraceInspectionFailed")<{
  readonly code:
    | "invalid-arguments"
    | "input-unavailable"
    | "receipt-unavailable"
    | "invalid-json"
    | "seq-unavailable"
    | "trace-not-found"
    | "seq-version"
    | "output-limit";
  readonly message: string;
}> {}

const workspace = fileURLToPath(new URL("..", import.meta.url));
const json = (text: string) =>
  Effect.try({
    try: (): unknown => JSON.parse(text),
    catch: () =>
      new TraceInspectionFailed({
        code: "invalid-json",
        message: "Trace inspection input is not valid JSON.",
      }),
  });
const readJson = Effect.fnUntraced(function* (path: string) {
  const fs = yield* FileSystem.FileSystem;
  const stat = yield* fs.stat(path).pipe(
    Effect.mapError(
      () =>
        new TraceInspectionFailed({
          code: "input-unavailable",
          message: "Cannot read the requested trace evidence file.",
        }),
    ),
  );
  if (stat.size > 1_048_576)
    return yield* new TraceInspectionFailed({
      code: "output-limit",
      message: "The evidence input exceeds the 1 MiB limit.",
    });
  const contents = yield* fs.readFileString(path).pipe(
    Effect.mapError(
      () =>
        new TraceInspectionFailed({
          code: "input-unavailable",
          message: "Cannot read the requested trace evidence file.",
        }),
    ),
  );
  return yield* json(contents);
});

const runSeq = Effect.fnUntraced(
  function* (
    args: ReadonlyArray<string>,
    environment: Readonly<Record<string, string | undefined>>,
  ) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const child = yield* spawner.spawn(
      ChildProcess.make("mise", ["exec", "--", "seqcli", ...args], {
        cwd: workspace,
        env: environment,
        extendEnv: false,
        stdin: "ignore",
      }),
    );
    const [stdout, stderr, code] = yield* Effect.all(
      [
        Stream.runFoldEffect(
          Stream.decodeText(child.stdout),
          (): { bytes: number; chunks: string[] } => ({ bytes: 0, chunks: [] }),
          (output, chunk) => {
            const bytes = output.bytes + Buffer.byteLength(chunk);
            if (bytes > 64 * 1024 * 1024)
              return Effect.fail(
                new TraceInspectionFailed({
                  code: "output-limit",
                  message: "Seq trace output exceeds the 64 MiB limit.",
                }),
              );
            output.chunks.push(chunk);
            return Effect.succeed({ bytes, chunks: output.chunks });
          },
        ),
        Stream.runFold(
          child.stderr,
          (): { bytes: number; chunks: Uint8Array[]; truncated: boolean } => ({
            bytes: 0,
            chunks: [],
            truncated: false,
          }),
          (output, chunk) => {
            // Drain all stderr, retaining only a bounded private classification buffer.
            const retained = Math.min(chunk.byteLength, 4096 - output.bytes);
            if (retained > 0) output.chunks.push(new Uint8Array(chunk.subarray(0, retained)));
            return {
              bytes: output.bytes + retained,
              chunks: output.chunks,
              truncated: output.truncated || retained < chunk.byteLength,
            };
          },
        ),
        child.exitCode,
      ],
      { concurrency: 3 },
    );
    if (code !== 0) {
      const traceId =
        args[0] === "trace" ? /^--id=([0-9a-f]{32})$/.exec(args[1] ?? "")?.[1] : undefined;
      // The pinned client prints exactly this message for an empty trace result.
      // Never forward stderr or infer absence from unrelated/partial error text.
      if (
        code === 1 &&
        traceId !== undefined &&
        stdout.bytes === 0 &&
        !stderr.truncated &&
        Buffer.concat(stderr.chunks).toString("utf8").trim() ===
          `No events found for trace ${traceId}`
      )
        return yield* new TraceInspectionFailed({
          code: "trace-not-found",
          message: "Seq returned no events for the requested trace.",
        });
      return yield* new TraceInspectionFailed({
        code: "seq-unavailable",
        message: "The pinned Seq client could not retrieve trace evidence.",
      });
    }
    return stdout.chunks.join("");
  },
  Effect.scoped,
  Effect.timeout("15 seconds"),
  Effect.mapError((error) =>
    error instanceof TraceInspectionFailed
      ? error
      : new TraceInspectionFailed({
          code: "seq-unavailable",
          message: "The pinned Seq client could not complete its request.",
        }),
  ),
);

export const runTraceInspection = Effect.fnUntraced(function* (
  args: ReadonlyArray<string>,
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const invalidArguments = () =>
    new TraceInspectionFailed({
      code: "invalid-arguments",
      message:
        "Use trace:inspect --receipt FILE [--expect FILE] [--span-id ID] [--max-nodes 1..100000]. Local Seq requires a loopback HTTP URL without credentials, query, or fragment.",
    });
  const { values } = yield* Effect.try({
    try: () =>
      parseArgs({
        args: [...args],
        strict: true,
        options: {
          receipt: { type: "string" },
          expect: { type: "string" },
          "span-id": { type: "string" },
          "max-nodes": { type: "string" },
          help: { type: "boolean" },
        },
      }),
    catch: invalidArguments,
  });
  if (values.help)
    return {
      usage: "trace:inspect --receipt FILE [--expect FILE] [--span-id ID] [--max-nodes 1..100000]",
      output: "JSON; full invocation evidence is verified before subtree selection",
      expectations: "Independent fixture/operation counts and ownership; optional",
      timeoutSeconds: 15,
    };
  if (
    values.receipt === undefined ||
    (values["span-id"] !== undefined && !/^[0-9a-f]{16}$/.test(values["span-id"]))
  )
    return yield* invalidArguments();
  const maxNodes = values["max-nodes"] === undefined ? 100_000 : Number(values["max-nodes"]);
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 1 || maxNodes > 100_000)
    return yield* invalidArguments();
  const server = environment["SEQCLI_CONNECTION_SERVERURL"] ?? "http://127.0.0.1:5341";
  const url = yield* Effect.try({ try: () => new URL(server), catch: invalidArguments });
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    return yield* invalidArguments();
  const receipt = yield* readJson(values.receipt).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(TraceReceiptDocumentSchema)),
    Effect.mapError(
      () =>
        new TraceInspectionFailed({
          code: "receipt-unavailable",
          message:
            "The receipt is missing or invalid; capture or receipt persistence could not be established.",
        }),
    ),
  );
  // Producer evidence can already disqualify a capture. Preserve that diagnosis
  // even when no trace reached Seq; the inspector owns the failure classification.
  if (
    "captureState" in receipt ||
    !receipt.producerComplete ||
    receipt.timings === null ||
    receipt.droppedSpanCount !== 0 ||
    receipt.droppedAggregateEventCount !== 0 ||
    receipt.unrecognizedSpanCount !== 0 ||
    receipt.unrecognizedAttributeCount !== 0 ||
    receipt.summaryOverflowCount !== 0
  )
    return yield* inspectLocalTrace(receipt, undefined);
  const retrieval = yield* traceRetrievalPlan(receipt);
  const expected = values.expect === undefined ? undefined : yield* readJson(values.expect);
  const fs = yield* FileSystem.FileSystem;
  const miseConfig = yield* fs.readFileString(resolve(workspace, "mise.toml")).pipe(
    Effect.mapError(
      () =>
        new TraceInspectionFailed({
          code: "seq-version",
          message: "Cannot determine the repository's pinned Seq client version.",
        }),
    ),
  );
  const pinned = /"github:datalust\/seqcli"\s*=\s*"([0-9.]+)"/.exec(miseConfig)?.[1];
  const childEnvironment = { ...environment, SEQCLI_CONNECTION_SERVERURL: server };
  const version = yield* runSeq(["version"], childEnvironment);
  if (pinned === undefined || version.trim().split("+")[0] !== pinned)
    return yield* new TraceInspectionFailed({
      code: "seq-version",
      message: "The Seq client does not match the repository pin.",
    });
  const output = yield* runSeq(retrieval.args, childEnvironment);
  const tree = yield* decodeTraceRetrieval(receipt, yield* json(output));
  return yield* inspectLocalTrace(receipt, tree, {
    ...(expected === undefined ? {} : { expected }),
    ...(values["span-id"] === undefined ? {} : { spanId: values["span-id"] }),
    maxNodes,
  });
});

const entryPath = process.argv[1];
if (entryPath !== undefined && resolve(entryPath) === fileURLToPath(import.meta.url)) {
  NodeRuntime.runMain(
    runTraceInspection(process.argv.slice(2)).pipe(
      Effect.flatMap((result) => Console.log(JSON.stringify(result))),
      Effect.catch((error) =>
        Effect.gen(function* () {
          process.exitCode = 1;
          yield* Console.log(
            JSON.stringify({
              schemaVersion: 2,
              evidence: "failed",
              code:
                error instanceof TraceEvidenceFailure || error instanceof TraceInspectionFailed
                  ? error.code
                  : "inspection-failed",
              message:
                error instanceof TraceEvidenceFailure || error instanceof TraceInspectionFailed
                  ? error.message
                  : "Trace evidence inspection failed.",
            }),
          );
        }),
      ),
      Effect.provide(NodeServices.layer),
    ),
  );
}
