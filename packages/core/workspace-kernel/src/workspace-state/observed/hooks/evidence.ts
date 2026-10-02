/** Historical hook execution evidence is local state, separate from accepted package resolution. */
import { createHash } from "node:crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

export const HookFixtureResultSchema = Schema.Struct({
  fixture: Schema.String,
  implementation: Schema.String,
  binding: Schema.String,
  protocol: Schema.String,
  runtime: Schema.String,
  outcome: Schema.Literals(["passed", "failed"]),
  expectedExitCode: Schema.Number,
  observedExitCode: Schema.NullOr(Schema.Number),
  stdoutMatches: Schema.NullOr(Schema.Boolean),
  stderrMatches: Schema.NullOr(Schema.Boolean),
  detail: Schema.String,
});
export const HookTestResultSchema = Schema.Struct({
  kind: Schema.Literal("fixture-execution"),
  package: Schema.String,
  version: Schema.String,
  contentHash: Schema.String,
  configurationHash: Schema.String,
  startedAt: Schema.Number,
  completedAt: Schema.Number,
  cwd: Schema.Literal("package-root"),
  environment: Schema.Array(Schema.String),
  environmentFreshness: Schema.Literal("historical-only"),
  nativeInvocation: Schema.Literal("not-observed"),
  sandboxed: Schema.Literal(false),
  fixtures: Schema.Array(HookFixtureResultSchema),
  passed: Schema.Boolean,
  receiptPath: Schema.String,
});
export type HookTestResult = typeof HookTestResultSchema.Type;

export const hookConfigurationHash = (values: Readonly<Record<string, unknown>>): string =>
  createHash("sha256")
    .update(
      JSON.stringify(Object.entries(values).sort(([left], [right]) => left.localeCompare(right))),
    )
    .digest("hex");

export const hookReceiptFilename = (root: string): string =>
  `${createHash("sha256").update(root).digest("hex")}.json`;

export const HookEvidenceStatusSchema = Schema.Struct({
  state: Schema.Literals(["absent", "invalid", "stale", "historical"]),
  receipt: Schema.optionalKey(HookTestResultSchema),
  reason: Schema.String,
});

export const readHookEvidence = Effect.fn("Hook.readEvidence")(function* (args: {
  readonly runtimeDir: string;
  readonly packageRoot: string;
  readonly contentHash: string;
  readonly configurationHash: string;
}): Effect.fn.Return<
  typeof HookEvidenceStatusSchema.Type,
  import("effect/PlatformError").PlatformError,
  FileSystem.FileSystem | Path.Path
> {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(args.runtimeDir, "hook-tests", hookReceiptFilename(args.packageRoot));
  if (!(yield* fs.exists(file)))
    return {
      state: "absent",
      reason: "No fixture execution has been recorded for this package location",
    };
  const raw = yield* fs.readFileString(file);
  const decoded = Schema.decodeUnknownResult(Schema.fromJsonString(HookTestResultSchema))(raw);
  if (Result.isFailure(decoded))
    return { state: "invalid", reason: "The local fixture receipt is invalid" };
  const receipt = decoded.success;
  if (
    receipt.contentHash !== args.contentHash ||
    receipt.configurationHash !== args.configurationHash
  ) {
    return {
      state: "stale",
      receipt,
      reason: "Package content or effective configuration changed after fixture execution",
    };
  }
  return {
    state: "historical",
    receipt,
    reason:
      "Content and configuration match; runtime environment and native host invocation have not been reverified",
  };
});
