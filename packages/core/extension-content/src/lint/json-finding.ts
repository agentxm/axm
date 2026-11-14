import * as Schema from "effect/Schema";
import { ExtensionTypeSchema } from "@agentxm/extension-model/unstable/extensions/common";

const LintJsonLocationSchema = Schema.Struct({
  file: Schema.String,
  line: Schema.optional(Schema.Number),
  column: Schema.optional(Schema.Number),
}).annotate({
  identifier: "LintJsonLocation",
  title: "Lint Finding Location",
  description: "Document-relative location a finding points at.",
});

/**
 * One finding as emitted under `--json`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export const LintJsonFindingSchema = Schema.Struct({
  group: Schema.Union([ExtensionTypeSchema, Schema.Literal("workspace")]).annotate({
    identifier: "LintFindingGroup",
    title: "Lint Finding Group",
    description: "Rule catalog the finding came from.",
  }),
  kind: Schema.Literal("advisory"),
  ruleId: Schema.String,
  severity: Schema.Literals(["error", "warning", "info"] as const),
  message: Schema.String,
  displayRoot: Schema.String,
  path: Schema.String,
  subject: Schema.String,
  authority: Schema.String,
  observed: Schema.String,
  expected: Schema.String,
  location: Schema.optional(LintJsonLocationSchema),
}).annotate({
  identifier: "LintJsonFinding",
  title: "Lint Finding",
  description: "A single lint finding with its rule, severity, and rendered path.",
});

export type LintJsonFinding = typeof LintJsonFindingSchema.Type;
