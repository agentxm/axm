import type { KnowledgeRuleSet } from "@agentxm/extension-content/knowledge";
import type { KnowledgeLintQueryResultSchema } from "@agentxm/workspace-features/knowledge-query";

import { ExitCode } from "../../app-error/index.js";
import {
  count,
  emptyDoc,
  exitPhrase,
  list,
  operationResultDoc,
  titleDoc,
  type Doc,
  type LedgerColumn,
  type LedgerRow,
} from "../../screen/index.js";

const KNOWLEDGE_LINT_COLUMNS: ReadonlyArray<LedgerColumn> = [
  { header: "Finding", role: "name" },
  { header: "Location", role: "elastic", priority: "required" },
];

const ruleSetLabels = {
  "okf-conformance": "OKF conformance",
  "agentxm-profile": "AgentXM profile",
  "registry-safety": "Registry safety",
} as const satisfies Record<KnowledgeRuleSet, string>;

/**
 * `axm knowledge lint` as `axm lint` reads: a findings ledger with what is
 * wrong and where, the rule set beneath each finding, and the counts last.
 */
export const knowledgeLintDoc = (
  document: typeof KnowledgeLintQueryResultSchema.Type,
  result: { readonly bundleCount: number; readonly errorCount: number },
): Doc => {
  const bundles = count(result.bundleCount, "bundle");
  if (document.diagnostics.length === 0) {
    return emptyDoc({ tone: "ok", statement: "No findings", facts: [`in ${bundles}`] });
  }
  const warnings = document.diagnostics.filter(
    (diagnostic) => diagnostic.severity !== "error",
  ).length;
  const rows = document.diagnostics.map((diagnostic): LedgerRow => ({
    mark: diagnostic.severity === "error" ? "error" : "warn",
    cells: [
      diagnostic.message.replace(/\.$/u, ""),
      `${diagnostic.bundle}/${diagnostic.relativePath}${
        diagnostic.line === undefined
          ? ""
          : `:${String(diagnostic.line)}${diagnostic.column === undefined ? "" : `:${String(diagnostic.column)}`}`
      }`,
    ],
    children: [{ _tag: "paragraph", tone: "dim", text: ruleSetLabels[diagnostic.ruleSet] }],
  }));
  return operationResultDoc({
    title: titleDoc("Lint knowledge", { facts: [bundles] }),
    body: [{ _tag: "ledger", columns: KNOWLEDGE_LINT_COLUMNS, rows }],
    verdict: [
      {
        _tag: "headline",
        verdict: true,
        tone: result.errorCount > 0 ? "error" : "warn",
        text: list([
          ...(result.errorCount === 0 ? [] : [count(result.errorCount, "error")]),
          ...(warnings === 0 ? [] : [count(warnings, "warning")]),
        ]),
        ...(result.errorCount > 0 ? { aside: [{ text: exitPhrase(ExitCode.Issues) }] } : {}),
      },
    ],
  });
};
