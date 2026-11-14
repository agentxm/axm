import * as Schema from "effect/Schema";
import {
  WireReceiptSchema,
  WireRegisterSchema,
  WireWitnessSchema,
  type WireReceipt,
  type WireRoute,
} from "./wire-contracts.js";

/** Frozen before running the redesigned CLI; discovery also detects new unlisted adapters/modes. */
const REQUIRED_WIRE_RESULTS = [
  "agent-capabilities:query",
  "agents-list:query",
  "cache-prune:apply",
  "cache-status:query",
  "cache-verify:apply",
  "diagnostic-export:apply",
  "diagnostic-review:query",
  "discover:query",
  "extension-inventory:query",
  "extension-list:query",
  "help-topic:query",
  "hook-fixture-execution:apply",
  "instructions-status:query",
  "knowledge-concept-capabilities:query",
  "knowledge-concept-get:query",
  "knowledge-concept-query:query",
  "knowledge-concept-related:query",
  "knowledge-concept-resolve:query",
  "knowledge-lint:query",
  "knowledge-list:query",
  "local-inspection:query",
  "local-check:query",
  "login:apply",
  "logout:apply",
  "mcp-inventory:query",
  "plan-resolution:preview",
  "plan-resolution:apply",
  "publish:preview",
  "publish:apply",
  "registry-transition:apply",
  "registry-view:query",
  "setup:preview",
  "setup:apply",
  "subagent-show:query",
  "token-list:query",
  "token-revoke:apply",
  "upgrade:preview",
  "upgrade:apply",
  "visibility-evaluation:query",
  "whoami:query",
  "workspace-lint:query",
  "workspace-lint:preview",
  "workspace-lint:apply",
  "workspace-share:query",
] as const;

const REQUIRED_WIRE_VARIANTS = [
  "formatter:help",
  "formatter:version",
  "schema-document",
  "generic-error:before-operation",
  "generic-error:after-operation",
  "operation-failure",
  "login:pending-human",
  "registry-view:scalar",
  "subagent-render:supported",
  "subagent-render:unsupported",
  "knowledge-get:raw",
  "lint-fix:preview",
  "lint-fix:apply",
  "publish:no-op",
  "local-check:satisfied",
  "local-check:attention-required",
  "credential-refusal",
] as const;

// This route deliberately exports an external standard instead of a bundled
// stdout schema. Its existing fixture independently asserts the standard's
// identity and retained components; it must be observed, but cannot be counted
// as validation against a schema AXM intentionally does not publish.
const REQUIRED_EXTERNAL_DOCUMENTS = ["axm lock export"] as const;

export const wireCoverage = (
  routes: ReadonlyArray<WireRoute>,
  receipts: ReadonlyArray<WireReceipt>,
  witnesses: ReadonlyArray<{ readonly stdoutSha256: string; readonly variant: string }>,
) => {
  const validated = receipts.filter((entry) => entry.schemaSha256 !== undefined);
  const observedResults = new Set(
    validated
      .filter((entry) => entry.document === "result" && entry.mode !== undefined)
      .map((entry) => `${entry.family}:${entry.mode}`),
  );
  const variants = new Set([
    ...validated.flatMap((entry) => entry.variants),
    ...validated.filter((entry) => entry.document === "schema").map(() => "schema-document"),
    ...witnesses
      .filter((witness) =>
        validated.some(
          (entry) => entry.stdoutSha256 === witness.stdoutSha256 && entry.document === "error",
        ),
      )
      .map((entry) => entry.variant),
  ]);
  const discovered = new Set(
    routes
      .filter((entry) => entry.class === "structured-result")
      .flatMap((entry) => entry.modes.map((mode) => `${entry.family}:${mode}`)),
  );
  const frozen = new Set<string>(REQUIRED_WIRE_RESULTS);
  return {
    requiredResults: REQUIRED_WIRE_RESULTS,
    requiredVariants: REQUIRED_WIRE_VARIANTS,
    observedResults: [...observedResults].sort(),
    observedVariants: [...variants].sort(),
    missingResults: REQUIRED_WIRE_RESULTS.filter((entry) => !observedResults.has(entry)),
    missingVariants: REQUIRED_WIRE_VARIANTS.filter((entry) => !variants.has(entry)),
    requiredExternalDocuments: REQUIRED_EXTERNAL_DOCUMENTS,
    missingExternalDocuments: REQUIRED_EXTERNAL_DOCUMENTS.filter(
      (route) =>
        !receipts.some(
          (entry) =>
            entry.route === route &&
            entry.document === "external" &&
            entry.family === "external-document",
        ),
    ),
    unregisteredRequirements: REQUIRED_WIRE_RESULTS.filter((entry) => !discovered.has(entry)),
    unfrozenAdapters: [...discovered].filter((entry) => !frozen.has(entry)).sort(),
    // A registered route, formatter response or early error is never counted
    // as evidence that its domain adapter actually emitted a result.
    routesWithoutResult: [
      ...new Set(
        routes
          .filter(
            (route) =>
              route.class === "structured-result" &&
              !validated.some(
                (entry) => entry.route === route.route && entry.document === "result",
              ),
          )
          .map((entry) => entry.route),
      ),
    ].sort(),
    externalDocuments: receipts.filter((entry) => entry.document === "external"),
  };
};

/** Original observations and selection scope; claimed coverage fields are deliberately not inputs. */
export const WireRunEvidenceSchema = Schema.Struct({
  testRun: Schema.Literals(["passed", "failed", "interrupted"]),
  suiteSelected: Schema.Boolean,
  shard: Schema.NullOr(Schema.Struct({ index: Schema.Number, count: Schema.Number })),
  registers: Schema.Array(WireRegisterSchema),
  receipts: Schema.Array(WireReceiptSchema),
  witnesses: Schema.Array(WireWitnessSchema),
});
export type WireRunEvidence = typeof WireRunEvidenceSchema.Type;

/** Recompute one complete matrix from all independently recorded partitions. */
export const aggregateWireCoverage = (
  runs: ReadonlyArray<WireRunEvidence>,
  expectedShards: number,
) => {
  const issues: string[] = [];
  if (!Number.isInteger(expectedShards) || expectedShards < 1)
    issues.push("The expected shard count must be a positive integer.");
  if (runs.length !== expectedShards)
    issues.push(`Expected ${expectedShards} shard reports; received ${runs.length}.`);
  const indices = new Set<number>();
  for (const run of runs) {
    if (run.testRun !== "passed") issues.push("A wire shard did not pass its test run.");
    if (!run.suiteSelected) issues.push("A wire shard filtered the complete suite selection.");
    const shard = run.shard;
    if (
      shard === null ||
      shard.count !== expectedShards ||
      !Number.isInteger(shard.index) ||
      shard.index < 1 ||
      shard.index > expectedShards
    ) {
      issues.push("A wire shard has missing or inconsistent partition metadata.");
    } else if (indices.has(shard.index)) {
      issues.push(`Duplicate wire shard index ${shard.index}.`);
    } else {
      indices.add(shard.index);
    }
  }
  const registers = runs.flatMap((run) => run.registers);
  const receipts = runs.flatMap((run) => run.receipts);
  const witnesses = runs.flatMap((run) => run.witnesses);
  const coverage = wireCoverage(
    registers.flatMap((entry) => entry.routes),
    receipts,
    witnesses,
  );
  const schemaHashes = [...new Set(registers.map((entry) => entry.schemaSha256))];
  if (schemaHashes.length !== 1)
    issues.push("Wire shards must observe one identical schema bundle.");
  if (
    receipts.some(
      (receipt) =>
        receipt.schemaSha256 !== undefined && !schemaHashes.includes(receipt.schemaSha256),
    )
  )
    issues.push("A wire receipt names a schema bundle absent from the captured registers.");
  const gaps = [
    ...coverage.missingResults,
    ...coverage.missingVariants,
    ...coverage.missingExternalDocuments,
    ...coverage.unregisteredRequirements,
    ...coverage.unfrozenAdapters,
  ];
  if (gaps.length > 0) issues.push(`Unverified wire variants: ${[...new Set(gaps)].join(", ")}`);
  return {
    ...coverage,
    complete: issues.length === 0,
    issues,
    partitions: runs.map((run) => ({
      testRun: run.testRun,
      suiteSelected: run.suiteSelected,
      shard: run.shard,
    })),
    schemaHashes,
    artifacts: [...new Set(registers.map((entry) => entry.artifact))],
    validatedDocuments: receipts.filter((entry) => entry.schemaSha256 !== undefined).length,
  };
};
