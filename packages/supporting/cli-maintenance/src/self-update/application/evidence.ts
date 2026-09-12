import * as Schema from "effect/Schema";

/** Recorded installer-command evidence carried by upgrade outcomes. */
export const CommandRecordSchema = Schema.Struct({
  purpose: Schema.Literals([
    "detection",
    "preparation",
    "delegation",
    "verification",
    "rollback",
  ] as const),
  executable: Schema.String,
  args: Schema.Array(Schema.String),
  display: Schema.String,
  executionState: Schema.Literals(["not-started", "exited", "timed-out"] as const),
  exitCode: Schema.NullOr(Schema.Number),
  stdout: Schema.String,
  stderr: Schema.String,
  outputTruncated: Schema.Boolean,
});
export type CommandRecord = typeof CommandRecordSchema.Type;
