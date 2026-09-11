import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as Schema from "effect/Schema";
import YAML from "yaml";

const Job = Schema.Struct({
  needs: Schema.optional(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
  if: Schema.optional(Schema.String),
  "continue-on-error": Schema.optional(Schema.Boolean),
  strategy: Schema.optional(
    Schema.Struct({
      matrix: Schema.Struct({ include: Schema.Array(Schema.Record(Schema.String, Schema.String)) }),
    }),
  ),
  steps: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      uses: Schema.optional(Schema.String),
      run: Schema.optional(Schema.String),
      with: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
    }),
  ),
});
/**
 * GitHub parses the trigger key as `on`, which YAML 1.1 readers would fold to
 * the boolean `true`; the `yaml` package keeps it a string, so both spellings
 * are accepted here rather than assumed.
 */
const Triggers = Schema.Struct({
  release: Schema.Struct({ types: Schema.Array(Schema.String) }),
  workflow_dispatch: Schema.Struct({
    inputs: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Unknown)),
  }),
});
export type ReleaseWorkflowTriggers = typeof Triggers.Type;

const Workflow = Schema.Struct({
  concurrency: Schema.Struct({ group: Schema.String, "cancel-in-progress": Schema.Boolean }),
  jobs: Schema.Record(Schema.String, Job),
});
const parseReleaseWorkflow = (): unknown =>
  YAML.parse(
    readFileSync(
      fileURLToPath(new URL("../.github/workflows/publish.yml", import.meta.url)),
      "utf8",
    ),
  );

export const readReleaseWorkflow = () => Schema.decodeUnknownSync(Workflow)(parseReleaseWorkflow());

/** The declared triggers of the canonical release-publication workflow. */
export const readReleaseWorkflowTriggers = (): ReleaseWorkflowTriggers => {
  const document = parseReleaseWorkflow();
  if (typeof document !== "object" || document === null) {
    throw new Error("publish.yml must parse to a mapping");
  }
  const entries: Partial<Record<string, unknown>> = { ...document };
  return Schema.decodeUnknownSync(Triggers)(entries["on"] ?? entries["true"]);
};

/** Evaluate only the conjunction grammar used by the canonical promotion gate. */
export const promotionPermitted = (
  condition: string,
  results: Readonly<Record<string, string>>,
  distributed = true,
): boolean =>
  condition
    .replace(/^\s*\$\{\{|\}\}\s*$/gu, "")
    .split("&&")
    .every((raw) => {
      const term = raw.trim();
      if (term === "!cancelled()") return true;
      if (term === "needs.release.outputs.outcome == 'distributed'") return distributed;
      const match = /^needs\.([a-z-]+)\.result == 'success'$/u.exec(term);
      const job = match?.[1];
      if (job === undefined) throw new Error(`Unexpected promotion readiness expression: ${term}`);
      return results[job] === "success";
    });
