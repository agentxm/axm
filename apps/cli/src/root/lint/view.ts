import type { LintHumanBlock, LintHumanDiagnostic, LintSummary } from "@agentxm/workspace-lint";

import type { VerbosityLevel } from "../../cli-flags/index.js";
import type { Doc } from "../../screen/index.js";
import {
  errorDoc,
  headlineDoc,
  paragraphDoc,
  severityTone,
  successDoc,
} from "../../screen/index.js";

export interface LintViewEntry {
  readonly channel: "result" | "note";
  readonly doc: Doc;
}

const note = (doc: Doc): LintViewEntry => ({ channel: "note", doc });
const result = (doc: Doc): LintViewEntry => ({ channel: "result", doc });

const summaryDoc = (message: string, counts: LintSummary["counts"]): Doc =>
  counts.errors > 0
    ? errorDoc(message)
    : headlineDoc(counts.warnings > 0 ? "warn" : "info", message);

const diagnosticHeadline = (diagnostic: LintHumanDiagnostic, label: string): Doc => {
  const tone = severityTone(diagnostic.severity);
  return tone === "error" ? errorDoc(label) : headlineDoc(tone, label);
};

const diagnosticDetails = (diagnostic: LintHumanDiagnostic): ReadonlyArray<LintViewEntry> => [
  ...diagnostic.details.map((detail) => note(paragraphDoc(`  - ${detail}`))),
  ...diagnostic.helps.map((help) => note(paragraphDoc(`  ${help}`))),
];

const fullDiagnostic = (diagnostic: LintHumanDiagnostic): ReadonlyArray<LintViewEntry> => {
  const label = `${diagnostic.ruleId}${diagnostic.fixable ? " (auto-fixable)" : ""}: ${diagnostic.title}`;
  return [note(diagnosticHeadline(diagnostic, label)), ...diagnosticDetails(diagnostic)];
};

const groupedDiagnostic = (diagnostic: LintHumanDiagnostic): ReadonlyArray<LintViewEntry> => {
  const location =
    diagnostic.paths.length === 1
      ? (diagnostic.paths[0] ?? "")
      : diagnostic.paths.length > 1
        ? `(${diagnostic.paths.length} locations)`
        : "(workspace)";
  return [
    note(diagnosticHeadline(diagnostic, location)),
    note(
      paragraphDoc(`  rule: ${diagnostic.ruleId}${diagnostic.fixable ? " (auto-fixable)" : ""}`),
    ),
    note(paragraphDoc(`  ${diagnostic.title}`)),
    ...diagnosticDetails(diagnostic),
  ];
};

const normalBlock = (block: LintHumanBlock): ReadonlyArray<LintViewEntry> => {
  switch (block.kind) {
    case "overview":
      return [
        note(summaryDoc(block.message, block.counts)),
        ...block.notes.map((message) => note(paragraphDoc(message))),
      ];
    case "blank":
      return [note(paragraphDoc(""))];
    case "section":
      return [
        note(
          headlineDoc(
            "neutral",
            block.note === undefined ? block.title : `${block.title} (${block.note})`,
          ),
        ),
      ];
    case "diagnostic":
      return groupedDiagnostic(block.diagnostic);
    case "driftBanner":
      return [
        note(headlineDoc("warn", block.title)),
        ...block.ruleIds.map((id) => note(paragraphDoc(`  ${id}`))),
      ];
    case "pathGroup":
      return [note(paragraphDoc(block.path)), ...block.diagnostics.flatMap(fullDiagnostic)];
    case "empty":
      return [result(successDoc(block.message))];
    case "footer":
      return [];
  }
};

const quietBlock = (block: LintHumanBlock): ReadonlyArray<LintViewEntry> => {
  switch (block.kind) {
    case "overview":
      return [note(summaryDoc(block.message, block.counts))];
    case "driftBanner":
      return [note(headlineDoc("warn", block.title))];
    case "empty":
      return [result(successDoc(block.message))];
    case "blank":
    case "section":
    case "diagnostic":
    case "pathGroup":
    case "footer":
      return [];
  }
};

export const lintView = (
  blocks: ReadonlyArray<LintHumanBlock>,
  verbosity: VerbosityLevel,
): ReadonlyArray<LintViewEntry> => blocks.flatMap(verbosity === "quiet" ? quietBlock : normalBlock);
