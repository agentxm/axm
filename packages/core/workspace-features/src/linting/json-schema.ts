/**
 * The `axm lint --json` document, as a schema.
 *
 * The shape used to exist only as a hand-written interface in `cli.ts` while
 * the CLI emitted it through `Schema.Any` — so nothing checked that what the
 * runner built and what the renderer promised were the same document, and
 * `--json` consumers had no schema to generate against.
 *
 * `LintJsonDocument` and `LintJsonFinding` are now derived from these schemas,
 * so the emitted document and its contract cannot drift.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as Schema from "effect/Schema";
import { LintJsonFindingSchema } from "@agentxm/extension-content/lint";
export { LintJsonFindingSchema } from "@agentxm/extension-content/lint";
import { AxmSkillCompatibilityReportSchema } from "@agentxm/cli-maintenance/official-skill/domain";

const LintJsonSummarySchema = Schema.Struct({
  total: Schema.Number,
  errors: Schema.Number,
  warnings: Schema.Number,
  infos: Schema.Number,
  exitCategory: Schema.Literals(["clean", "warnings", "errors"] as const).annotate({
    identifier: "LintExitCategory",
    title: "Lint Exit Category",
    description:
      "Whether the run has errors, has warnings without errors, or is clean of both; informational findings remain clean.",
  }),
}).annotate({
  identifier: "LintJsonSummary",
  title: "Lint Summary",
  description: "Finding counts by severity plus the derived exit category.",
});

const LintInputSchema = Schema.Union([
  Schema.Struct({ view: Schema.Literal("filesystem") }),
  Schema.Struct({
    view: Schema.Literal("git-index"),
    fingerprint: Schema.String.check(Schema.isPattern(/^sha256:[0-9a-f]{64}$/u)),
  }),
]).annotate({
  identifier: "LintInput",
  title: "Lint Input",
  description: "Filesystem identity evaluated by the lint run.",
});
export type LintInput = typeof LintInputSchema.Type;

/**
 * JSON envelope shape returned under `axm lint --json`.
 *
 * Matches the registry publish failure envelope structure (`findings[]`,
 * `displayRoot` per entry, per-finding `path` pre-composed).
 *
 * @experimental This API is unstable and may change without notice.
 */
export const LintJsonDocumentSchema = Schema.Struct({
  input: LintInputSchema,
  axmSkillCompatibility: Schema.optionalKey(AxmSkillCompatibilityReportSchema),
  findings: Schema.Array(LintJsonFindingSchema),
  repaired: Schema.Array(LintJsonFindingSchema),
  normalization: Schema.optionalKey(
    Schema.Struct({
      mode: Schema.Literal("preview"),
      changes: Schema.Array(
        Schema.Struct({
          path: Schema.String,
          change: Schema.Literals(["created", "updated", "removed"]),
        }),
      ),
    }),
  ),
  summary: LintJsonSummarySchema,
  driftBanner: Schema.Array(Schema.String),
}).annotate({
  identifier: "LintJsonDocument",
  title: "Lint Document",
  description: "Machine-readable result of an `axm lint` run.",
});

/**
 * One finding as emitted under `--json`.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type LintJsonFinding = typeof LintJsonFindingSchema.Type;

/**
 * The `--json` document.
 *
 * @experimental This API is unstable and may change without notice.
 */
export type LintJsonDocument = typeof LintJsonDocumentSchema.Type;
