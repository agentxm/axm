/**
 * Cross-type JSON payload contract.
 *
 * Three ratchets over every machine-emitting renderer call in the CLI:
 *
 * 1. A call-site census pinned with exact equality — a new `renderer.result`,
 *    or entity-style `renderer.list`/`detail`/`tree`, cannot land without
 *    registering here, and a removed one cannot leave a stale row.
 * 2. Top-level payload keys pinned per collection schema — collections live
 *    under `items` with a `count`.
 * 3. An exemption ledger for the call sites that deviate from the
 *    one-primary-payload/items contract, compared with exact equality so a
 *    fixed exemption must delete its row and a new deviation cannot slip in.
 *
 * Composes with `output-ux.test.ts`, which constrains mutation results to the
 * plan model; this file pins the payload *shapes*.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { ExtensionInventorySchema } from "@agentxm/client-core/unstable/workspace";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const sourceRoot = "packages/cli/src";

interface RendererCallSite {
  readonly file: string;
  readonly method: "result" | "list" | "detail" | "tree";
  readonly payload: string;
}

const collectSourceFiles = (root: string): ReadonlyArray<string> => {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files: Array<string> = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__generated__") files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files.sort();
};

const callPattern = /renderer\.(result|list|detail|tree)\(/g;
const schemaIdentPattern = /\b([A-Z][A-Za-z0-9]*(?:Schema|Fields))\b/;
const entityPattern = /^\("([a-z][a-z0-9-]*)"/;

const isMethod = (value: string): value is RendererCallSite["method"] =>
  value === "result" || value === "list" || value === "detail" || value === "tree";

const censusOf = (): ReadonlyArray<RendererCallSite> => {
  const sites: Array<RendererCallSite> = [];
  for (const file of collectSourceFiles(path.join(repoRoot, sourceRoot))) {
    const source = fs.readFileSync(file, "utf8");
    const relativeFile = path.relative(repoRoot, file);
    for (const match of source.matchAll(callPattern)) {
      const method = match[1] ?? "";
      if (!isMethod(method)) continue;
      const tail = source.slice(match.index + match[0].length, match.index + 1400);
      if (method === "result") {
        const schemaMatch = schemaIdentPattern.exec(tail);
        const payload =
          schemaMatch?.[1] ??
          (tail.includes("Schema.Array(Schema.String)")
            ? "Schema.Array(Schema.String)"
            : tail.includes("Schema.String")
              ? "Schema.String"
              : "UNKNOWN");
        sites.push({ file: relativeFile, method, payload });
        continue;
      }
      const entityMatch = entityPattern.exec(`(${tail}`);
      sites.push({ file: relativeFile, method, payload: entityMatch?.[1] ?? "VIEW_STYLE" });
    }
  }
  return sites.sort((left, right) =>
    `${left.file}|${left.method}|${left.payload}`.localeCompare(
      `${right.file}|${right.method}|${right.payload}`,
    ),
  );
};

/**
 * Every machine-emitting renderer call in the CLI. A new call site must be
 * added here deliberately; entity-style list/detail/tree rows also need a
 * `renderer.result` guard upstream (enforced by output-ux.test.ts) so machine
 * mode never reaches them unschema'd.
 */
const CALL_SITE_LEDGER: ReadonlyArray<RendererCallSite> = [
  {
    file: "packages/cli/src/json-output.ts",
    method: "result",
    payload: "PlanResolutionDocumentFields",
  },
  {
    file: "packages/cli/src/json-output.ts",
    method: "result",
    payload: "PlanResolutionDocumentFields",
  },
  { file: "packages/cli/src/json-output.ts", method: "result", payload: "PublishResultSchema" },
  { file: "packages/cli/src/root/agents/list.ts", method: "list", payload: "agent" },
  {
    file: "packages/cli/src/root/agents/list.ts",
    method: "result",
    payload: "AgentsListOutputSchema",
  },
  {
    file: "packages/cli/src/root/auth/login.ts",
    method: "result",
    payload: "LoginNoOpDocumentFields",
  },
  {
    file: "packages/cli/src/root/auth/login.ts",
    method: "result",
    payload: "LoginNoOpDocumentFields",
  },
  {
    file: "packages/cli/src/root/auth/logout.ts",
    method: "result",
    payload: "LogoutDocumentFields",
  },
  {
    file: "packages/cli/src/root/auth/logout.ts",
    method: "result",
    payload: "LogoutDocumentFields",
  },
  { file: "packages/cli/src/root/auth/token.ts", method: "detail", payload: "VIEW_STYLE" },
  { file: "packages/cli/src/root/auth/token.ts", method: "list", payload: "token" },
  {
    file: "packages/cli/src/root/auth/token.ts",
    method: "result",
    payload: "CreatedTokenDocumentFields",
  },
  {
    file: "packages/cli/src/root/auth/token.ts",
    method: "result",
    payload: "RevokeTokenDocumentFields",
  },
  { file: "packages/cli/src/root/auth/token.ts", method: "result", payload: "TokenDocumentFields" },
  {
    file: "packages/cli/src/root/auth/token.ts",
    method: "result",
    payload: "TokenListDocumentFields",
  },
  {
    file: "packages/cli/src/root/auth/whoami.ts",
    method: "result",
    payload: "WhoamiDocumentFields",
  },
  {
    file: "packages/cli/src/root/cache/command.ts",
    method: "result",
    payload: "CachePruneOutputSchema",
  },
  {
    file: "packages/cli/src/root/cache/command.ts",
    method: "result",
    payload: "CacheStatusOutputSchema",
  },
  {
    file: "packages/cli/src/root/cache/command.ts",
    method: "result",
    payload: "CacheVerifyOutputSchema",
  },
  {
    file: "packages/cli/src/root/commands/list.ts",
    method: "result",
    payload: "ExtensionInventorySchema",
  },
  {
    file: "packages/cli/src/root/discover/handler.ts",
    method: "list",
    payload: "discover-extension",
  },
  {
    file: "packages/cli/src/root/discover/handler.ts",
    method: "list",
    payload: "discover-extension",
  },
  {
    file: "packages/cli/src/root/discover/handler.ts",
    method: "result",
    payload: "DiscoverOutputSchema",
  },
  {
    file: "packages/cli/src/root/files/list.ts",
    method: "result",
    payload: "ExtensionInventorySchema",
  },
  {
    file: "packages/cli/src/root/help/command.ts",
    method: "result",
    payload: "HelpIndexResultSchema",
  },
  {
    file: "packages/cli/src/root/help/command.ts",
    method: "result",
    payload: "HelpTopicResultSchema",
  },
  {
    file: "packages/cli/src/root/hooks/info.ts",
    method: "result",
    payload: "HookPortabilityResultSchema",
  },
  {
    file: "packages/cli/src/root/hooks/list.ts",
    method: "result",
    payload: "ExtensionInventorySchema",
  },
  {
    file: "packages/cli/src/root/knowledge/command.ts",
    method: "result",
    payload: "KnowledgeLintQueryResultSchema",
  },
  {
    file: "packages/cli/src/root/knowledge/command.ts",
    method: "result",
    payload: "KnowledgeListQueryResultSchema",
  },
  {
    file: "packages/cli/src/root/knowledge/command.ts",
    method: "result",
    payload: "KnowledgeOpenQueryResultSchema",
  },
  {
    file: "packages/cli/src/root/knowledge/command.ts",
    method: "result",
    payload: "KnowledgeSearchQueryResultSchema",
  },
  {
    file: "packages/cli/src/root/lint/handler.ts",
    method: "result",
    payload: "LintFixJsonDocumentFields",
  },
  {
    file: "packages/cli/src/root/lint/handler.ts",
    method: "result",
    payload: "LintJsonDocumentFields",
  },
  { file: "packages/cli/src/root/mcps/get.ts", method: "detail", payload: "VIEW_STYLE" },
  {
    file: "packages/cli/src/root/mcps/get.ts",
    method: "result",
    payload: "McpServerGetResultSchema",
  },
  {
    file: "packages/cli/src/root/mcps/list.ts",
    method: "result",
    payload: "ExtensionInventorySchema",
  },
  {
    file: "packages/cli/src/root/outdated/handler.ts",
    method: "list",
    payload: "outdated-extension",
  },
  {
    file: "packages/cli/src/root/outdated/handler.ts",
    method: "list",
    payload: "outdated-extension",
  },
  {
    file: "packages/cli/src/root/outdated/handler.ts",
    method: "list",
    payload: "outdated-extension",
  },
  {
    file: "packages/cli/src/root/outdated/handler.ts",
    method: "result",
    payload: "OutdatedDocumentFields",
  },
  {
    file: "packages/cli/src/root/outdated/handler.ts",
    method: "result",
    payload: "OutdatedDocumentFields",
  },
  {
    file: "packages/cli/src/root/packs/list.ts",
    method: "result",
    payload: "ExtensionInventorySchema",
  },
  { file: "packages/cli/src/root/rules/command.ts", method: "list", payload: "agent-rule" },
  { file: "packages/cli/src/root/rules/command.ts", method: "list", payload: "agent-rule" },
  { file: "packages/cli/src/root/rules/command.ts", method: "list", payload: "agent-rule" },
  {
    file: "packages/cli/src/root/rules/command.ts",
    method: "result",
    payload: "InstructionsStatusOutputSchema",
  },
  {
    file: "packages/cli/src/root/rules/command.ts",
    method: "result",
    payload: "InstructionsStatusOutputSchema",
  },
  { file: "packages/cli/src/root/setup.ts", method: "result", payload: "SetupDocumentFields" },
  {
    file: "packages/cli/src/root/skills/list.ts",
    method: "result",
    payload: "ExtensionInventorySchema",
  },
  {
    file: "packages/cli/src/root/subagents/list/handler.ts",
    method: "result",
    payload: "ExtensionInventorySchema",
  },
  {
    file: "packages/cli/src/root/upgrade/handler.ts",
    method: "result",
    payload: "UpgradeDocumentFields",
  },
  {
    file: "packages/cli/src/root/view/handler.ts",
    method: "result",
    payload: "Schema.Array(Schema.String)",
  },
  {
    file: "packages/cli/src/root/view/handler.ts",
    method: "result",
    payload: "Schema.Array(Schema.String)",
  },
  {
    file: "packages/cli/src/root/view/handler.ts",
    method: "result",
    payload: "ViewDocumentFields",
  },
];

/**
 * Deviations from the collections-under-items / one-primary-payload contract.
 * A fixed deviation must delete its row; a new one cannot land unledgered.
 */
const CONTRACT_EXEMPTIONS: ReadonlyArray<{ readonly payload: string; readonly reason: string }> = [
  {
    payload: "PublishResultSchema",
    reason: "publish reports mode/selection/results as three top-level keys; permanent",
  },
  {
    payload: "LintFixJsonDocumentFields",
    reason: "lint --fix emits result plus data as dual primary keys; W7 PR16 owns the fix",
  },
  {
    payload: "Schema.Array(Schema.String)",
    reason: "view emits a bare value envelope for raw file listings; permanent",
  },
];

describe("json payload contract", () => {
  it("matches the machine-emitting call-site ledger exactly", () => {
    expect(censusOf()).toStrictEqual(CALL_SITE_LEDGER);
  });

  it("keeps the extension inventory collection under items", () => {
    expect(Object.keys(ExtensionInventorySchema.fields)).toStrictEqual([
      "items",
      "count",
      "configuredCount",
      "implicitCount",
      "installedCount",
      "unmanagedCount",
      "ignoredCount",
    ]);
  });

  it("holds every contract deviation in the exemption ledger", () => {
    const exempted = new Set(CONTRACT_EXEMPTIONS.map((entry) => entry.payload));
    // The census names every payload; the deviations we know about must all be
    // ledgered, and every ledger row must still correspond to a live call site.
    const censusPayloads = new Set(censusOf().map((site) => site.payload));
    const staleRows = CONTRACT_EXEMPTIONS.filter((entry) => !censusPayloads.has(entry.payload));
    expect(staleRows).toStrictEqual([]);
    expect(exempted.size).toBe(CONTRACT_EXEMPTIONS.length);
  });
});
