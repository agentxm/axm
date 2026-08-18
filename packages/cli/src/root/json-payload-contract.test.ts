/**
 * Shared payload-shape checks.
 *
 * Command-path exhaustiveness belongs to `machine-output-contracts.test.ts`,
 * which derives the public surface from the real Effect command tree. This
 * file focuses on cross-command schema invariants that are easier to verify at
 * the shared payload level.
 */

import { describe, expect, it } from "vitest";

import { ExtensionInventorySchema } from "@agentxm/client-core/unstable/workspace";

import { MACHINE_OUTPUT_CONTRACT_ROWS } from "../machine-output-contracts.js";
import { AgentsListOutputSchema } from "./agents/list.js";
import { TokenListDocumentSchema } from "./auth/token.js";
import { DiscoverOutputSchema } from "./discover/handler.js";
import { HookPortabilityResultSchema } from "./hooks/info.js";
import { KnowledgeListQueryResultSchema } from "./knowledge/list.js";
import { KnowledgeConceptQueryPageSchema } from "./knowledge/concepts/schemas.js";
import { ExtensionListDocumentSchema } from "./list/command.js";
import { InstructionsStatusOutputSchema } from "./instructions.js";

const COLLECTION_PAYLOADS = [
  [
    "axm agents list",
    AgentsListOutputSchema.fields,
    ["items", "configured", "detected", "available", "count"],
  ],
  [
    "axm discover",
    DiscoverOutputSchema.fields,
    ["items", "count", "totalDetected", "registryAvailable"],
  ],
  ["axm hooks info", HookPortabilityResultSchema.fields, ["items", "count"]],
  ["axm knowledge list", KnowledgeListQueryResultSchema.fields, ["items", "count"]],
  [
    "axm knowledge concepts search",
    KnowledgeConceptQueryPageSchema.fields,
    ["query", "corpusFingerprint", "items", "count", "hasMore", "cursor", "explanation"],
  ],
  [
    "axm list",
    ExtensionListDocumentSchema.fields,
    ["filter", "items", "count", "totalCount", "coverage"],
  ],
  [
    "axm instructions",
    InstructionsStatusOutputSchema.fields,
    ["enabled", "sourceFileName", "gitignoreAliases", "roots", "items"],
  ],
  ["axm token list", TokenListDocumentSchema.fields, ["items", "count", "hasMore", "cursor"]],
  [
    "axm <type> list",
    ExtensionInventorySchema.fields,
    ["items", "count", "configuredCount", "implicitCount", "installedCount", "unmanagedCount"],
  ],
] as const satisfies ReadonlyArray<
  readonly [command: string, fields: Record<string, unknown>, keys: ReadonlyArray<string>]
>;

const EXPECTED_RESULT_EXCEPTIONS = [
  {
    family: "formatter-help",
    reason: "built-in help is formatter-owned and uses a type discriminator",
  },
  {
    family: "publish",
    reason: "publish uses mode/selection/results for reconciliation",
  },
  {
    family: "registry-view",
    reason: "selected fields use value while full documents use data",
  },
] as const;

describe("JSON payload contract", () => {
  it.each(COLLECTION_PAYLOADS)("pins the top-level keys of %s", (_name, fields, keys) => {
    expect(Object.keys(fields)).toStrictEqual(keys);
  });

  it("names every collection under items", () => {
    expect(
      COLLECTION_PAYLOADS.filter(([, , keys]) => !keys.includes("items")).map(([name]) => name),
    ).toStrictEqual([]);
  });

  it("keeps every nonstandard result family in the explicit exception ledger", () => {
    const liveFamilyIds = new Set(MACHINE_OUTPUT_CONTRACT_ROWS.map((row) => row.family.id));
    const stale = EXPECTED_RESULT_EXCEPTIONS.filter((entry) => !liveFamilyIds.has(entry.family));

    expect(stale).toStrictEqual([]);
    expect(new Set(EXPECTED_RESULT_EXCEPTIONS.map((entry) => entry.family)).size).toBe(
      EXPECTED_RESULT_EXCEPTIONS.length,
    );
    for (const entry of EXPECTED_RESULT_EXCEPTIONS) {
      expect(entry.reason).not.toBe("");
    }
  });
});
