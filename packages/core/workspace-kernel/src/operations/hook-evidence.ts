/** Hook execution result vocabulary; native invocation remains separate from fixtures. */
import * as Schema from "effect/Schema";

export const HookFixtureResultSchema = Schema.Struct({
  fixture: Schema.String,
  implementation: Schema.String,
  binding: Schema.String,
  protocol: Schema.String,
  runtime: Schema.String,
  runtimeVersion: Schema.NullOr(Schema.String),
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
  scope: Schema.Literals(["project", "user"]),
  platform: Schema.Struct({ os: Schema.String, architecture: Schema.String }),
  environment: Schema.Array(Schema.String),
  environmentFreshness: Schema.Literal("historical-only"),
  nativeInvocation: Schema.Literal("not-observed"),
  sandboxed: Schema.Literal(false),
  fixtures: Schema.Array(HookFixtureResultSchema),
  passed: Schema.Boolean,
  receiptPath: Schema.String,
});
export type HookTestResult = typeof HookTestResultSchema.Type;

export const HookEvidenceStatusSchema = Schema.Struct({
  state: Schema.Literals(["absent", "invalid", "stale", "historical"]),
  receipt: Schema.optionalKey(HookTestResultSchema),
  reason: Schema.String,
});

export type HookEvidenceStatus = typeof HookEvidenceStatusSchema.Type;
