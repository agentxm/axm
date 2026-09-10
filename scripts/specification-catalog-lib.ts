/**
 * Static extraction and validation for the specification catalog.
 *
 * Reads `specifications/` source with the TypeScript compiler API without
 * executing any test file, so the catalog renders even when an
 * implementation fails its specification. Metadata must be literal-only:
 * computed metadata is rejected so every requirement-contract change is an
 * explicit source diff. Vocabulary, shape, and corpus linkage come from the
 * shared contract in `@agentxm/extension-model`; this module owns only the
 * static extraction and the repository's catalog rendering.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import ts from "typescript";

import {
  type BoundEvidenceGate,
  type ConformanceIssue,
  type ExecutionBinding,
  type ProductGoalRegistry,
  type SpecificationMetadata,
  checkSpecificationCorpus,
  decodeBoundEvidence,
  decodeExecutionBinding,
  decodeProductGoalRegistry,
  decodeSpecificationMetadata,
  sharedProductGoals,
} from "@agentxm/extension-model/unstable/specifications";

export interface CatalogSpecification {
  readonly metadata: SpecificationMetadata;
  /**
   * Static gates declared beside the specification whose results are bound
   * to its requirement identity as evidence. Bound evidence supports the
   * owning specification; it never replaces it.
   */
  readonly boundEvidence: readonly BoundEvidenceGate[];
  /** Repository-relative source path. */
  readonly source: string;
}

export interface CatalogExecutionBinding extends ExecutionBinding {
  /** Repository-relative source path. */
  readonly source: string;
}

export interface CatalogProductGoal {
  readonly id: string;
  readonly outcome: string;
  readonly status: "active" | "retired";
  /** Whether the goal is registered in the shared contract or locally. */
  readonly scope: "shared" | "local";
}

export type CatalogIssue = ConformanceIssue;

export interface SpecificationCatalog {
  readonly specifications: readonly CatalogSpecification[];
  readonly productGoals: readonly CatalogProductGoal[];
  readonly executionBindings: readonly CatalogExecutionBinding[];
  readonly issues: readonly CatalogIssue[];
}

const REQUIREMENT_ROLE_ORDER = ["experience", "interface", "supporting"] as const;

const REQUIREMENT_ROLE_LABELS: Readonly<Record<(typeof REQUIREMENT_ROLE_ORDER)[number], string>> = {
  experience: "Product behavior",
  interface: "Programmatic interfaces",
  supporting: "Supporting system behavior",
};

export const SPECIFICATION_AREAS = [
  "cli",
  "extension-identity",
  "package-identity",
  "settings-contract",
  "source-resolution",
  "version-constraints",
  "system",
] as const;

const PRODUCT_GOALS_SOURCE = "specifications/product-goals.ts";

type LiteralValue =
  string | number | boolean | readonly LiteralValue[] | { readonly [key: string]: LiteralValue };

interface LiteralFailure {
  readonly message: string;
}

type LiteralResult =
  | { readonly kind: "value"; readonly value: LiteralValue }
  | { readonly kind: "failure"; readonly failure: LiteralFailure };

const literalFailure = (message: string): LiteralResult => ({
  kind: "failure",
  failure: { message },
});

const evaluateLiteral = (node: ts.Expression): LiteralResult => {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { kind: "value", value: node.text };
  }
  if (ts.isNumericLiteral(node)) {
    return { kind: "value", value: Number(node.text) };
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return { kind: "value", value: true };
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return { kind: "value", value: false };
  }
  if (ts.isArrayLiteralExpression(node)) {
    const values: LiteralValue[] = [];
    for (const element of node.elements) {
      const result = evaluateLiteral(element);
      if (result.kind === "failure") {
        return result;
      }
      values.push(result.value);
    }
    return { kind: "value", value: values };
  }
  if (ts.isObjectLiteralExpression(node)) {
    const record: Record<string, LiteralValue> = {};
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) {
        return literalFailure("metadata objects may use only plain property assignments");
      }
      const name = property.name;
      let key: string;
      if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
        key = name.text;
      } else {
        return literalFailure("metadata keys must be identifiers or string literals");
      }
      const result = evaluateLiteral(property.initializer);
      if (result.kind === "failure") {
        return result;
      }
      record[key] = result.value;
    }
    return { kind: "value", value: record };
  }
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
    return evaluateLiteral(node.expression);
  }
  if (ts.isParenthesizedExpression(node)) {
    return evaluateLiteral(node.expression);
  }
  return literalFailure(
    `metadata must be literal-only (strings, numbers, booleans, arrays, objects); found ${
      ts.SyntaxKind[node.kind]
    }`,
  );
};

const isExported = (statement: ts.VariableStatement): boolean =>
  statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;

/**
 * Finds `export const <name> = <definer>({ ... })` (the definer call is
 * optional) and evaluates the literal argument.
 */
const extractDefinedLiteral = (
  sourceText: string,
  filePath: string,
  exportName: string,
  definerNames: readonly string[],
): { readonly value?: LiteralValue; readonly issues: CatalogIssue[] } => {
  const issues: CatalogIssue[] = [];
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, false);
  let found: LiteralValue | undefined;

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement) || !isExported(statement)) {
      continue;
    }
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== exportName) {
        continue;
      }
      const initializer = declaration.initializer;
      if (initializer === undefined) {
        issues.push({
          severity: "error",
          source: filePath,
          message: `export \`${exportName}\` has no initializer`,
        });
        continue;
      }
      let expression: ts.Expression = initializer;
      if (
        ts.isCallExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        definerNames.includes(expression.expression.text)
      ) {
        const argument = expression.arguments[0];
        if (argument === undefined || expression.arguments.length !== 1) {
          issues.push({
            severity: "error",
            source: filePath,
            message: `${expression.expression.text} must receive exactly one literal object`,
          });
          continue;
        }
        expression = argument;
      }
      const result = evaluateLiteral(expression);
      if (result.kind === "failure") {
        issues.push({
          severity: "error",
          source: filePath,
          message: `export \`${exportName}\`: ${result.failure.message}`,
        });
        continue;
      }
      if (found !== undefined) {
        issues.push({
          severity: "error",
          source: filePath,
          message: `duplicate export \`${exportName}\``,
        });
        continue;
      }
      found = result.value;
    }
  }

  return found === undefined ? { issues } : { value: found, issues };
};

const isRecordValue = (
  value: LiteralValue | undefined,
): value is { readonly [key: string]: LiteralValue } =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseSpecificationFile = (
  sourceText: string,
  relativePath: string,
): { readonly specification?: CatalogSpecification; readonly issues: CatalogIssue[] } => {
  const issues: CatalogIssue[] = [];
  const extraction = extractDefinedLiteral(sourceText, relativePath, "specification", [
    "defineSpecification",
  ]);
  issues.push(...extraction.issues);
  if (extraction.value === undefined) {
    if (extraction.issues.length === 0) {
      issues.push({
        severity: "error",
        source: relativePath,
        message: "specification file must export a `specification` constant",
      });
    }
    return { issues };
  }
  if (isRecordValue(extraction.value) && extraction.value["cases"] !== undefined) {
    issues.push({
      severity: "error",
      source: relativePath,
      message: "`cases` duplicates native test names; use native tests as reportable scenarios",
    });
    return { issues };
  }
  const decoded = decodeSpecificationMetadata(extraction.value);
  if (!decoded.ok) {
    for (const issue of decoded.issues) {
      issues.push({ severity: "error", source: relativePath, message: `specification: ${issue}` });
    }
    return { issues };
  }
  const evidenceExtraction = extractDefinedLiteral(sourceText, relativePath, "boundEvidence", [
    "defineBoundEvidence",
  ]);
  issues.push(...evidenceExtraction.issues);
  if (evidenceExtraction.issues.length > 0) {
    return { issues };
  }
  let boundEvidence: readonly BoundEvidenceGate[] = [];
  if (evidenceExtraction.value !== undefined) {
    const decodedEvidence = decodeBoundEvidence(evidenceExtraction.value);
    if (!decodedEvidence.ok) {
      for (const issue of decodedEvidence.issues) {
        issues.push({
          severity: "error",
          source: relativePath,
          message: `boundEvidence: ${issue}`,
        });
      }
      return { issues };
    }
    boundEvidence = decodedEvidence.value;
  }
  return {
    specification: { metadata: decoded.value, boundEvidence, source: relativePath },
    issues,
  };
};

export const parseProductGoalRegistry = (
  sourceText: string,
  relativePath: string,
): { readonly registry?: ProductGoalRegistry; readonly issues: CatalogIssue[] } => {
  const issues: CatalogIssue[] = [];
  const extraction = extractDefinedLiteral(sourceText, relativePath, "productGoals", [
    "defineProductGoals",
  ]);
  issues.push(...extraction.issues);
  if (extraction.value === undefined) {
    issues.push({
      severity: "error",
      source: relativePath,
      message: "product-goal registry must export a `productGoals` object literal",
    });
    return { issues };
  }
  const decoded = decodeProductGoalRegistry(extraction.value);
  if (!decoded.ok) {
    for (const issue of decoded.issues) {
      issues.push({ severity: "error", source: relativePath, message: `productGoals: ${issue}` });
    }
    return { issues };
  }
  return { registry: decoded.value, issues };
};

export const parseExecutionBindingFile = (
  sourceText: string,
  relativePath: string,
): { readonly binding?: CatalogExecutionBinding; readonly issues: CatalogIssue[] } => {
  const issues: CatalogIssue[] = [];
  const extraction = extractDefinedLiteral(sourceText, relativePath, "executionBinding", [
    "defineExecutionBinding",
  ]);
  issues.push(...extraction.issues);
  if (extraction.value === undefined) {
    return { issues };
  }
  const decoded = decodeExecutionBinding(extraction.value);
  if (!decoded.ok) {
    for (const issue of decoded.issues) {
      issues.push({
        severity: "error",
        source: relativePath,
        message: `executionBinding: ${issue}`,
      });
    }
    return { issues };
  }
  return { binding: { ...decoded.value, source: relativePath }, issues };
};

const listFilesRecursively = (root: string, suffix: string): string[] => {
  if (!fs.existsSync(root)) {
    return [];
  }
  const collected: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "out-tsc" || entry.name === "dist") {
        continue;
      }
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (entry.name.endsWith(suffix)) {
        collected.push(entryPath);
      }
    }
  };
  walk(root);
  return collected.sort();
};

const toCatalogGoals = (
  registry: ProductGoalRegistry,
  scope: CatalogProductGoal["scope"],
): CatalogProductGoal[] =>
  Object.entries(registry).map(([id, definition]) => ({
    id,
    outcome: definition.outcome,
    status: definition.status ?? "active",
    scope,
  }));

export interface CollectCatalogOptions {
  readonly repoRoot: string;
  /** Directories under the repository root that hold execution bindings. */
  readonly executionBindingRoots?: readonly string[];
}

export const collectCatalog = (options: CollectCatalogOptions): SpecificationCatalog => {
  const { repoRoot, executionBindingRoots = ["apps/cli-e2e/src"] } = options;
  const issues: CatalogIssue[] = [];
  const specifications: CatalogSpecification[] = [];

  const specificationsRoot = path.join(repoRoot, "specifications");
  const productGoalsPath = path.join(repoRoot, PRODUCT_GOALS_SOURCE);
  let localGoals: ProductGoalRegistry = {};
  if (fs.existsSync(productGoalsPath)) {
    const parsed = parseProductGoalRegistry(
      fs.readFileSync(productGoalsPath, "utf8"),
      PRODUCT_GOALS_SOURCE,
    );
    localGoals = parsed.registry ?? {};
    issues.push(...parsed.issues);
  } else {
    issues.push({
      severity: "error",
      source: PRODUCT_GOALS_SOURCE,
      message: "product-goal registry file is missing",
    });
  }

  for (const area of SPECIFICATION_AREAS) {
    for (const filePath of listFilesRecursively(path.join(specificationsRoot, area), ".spec.ts")) {
      const relativePath = path.relative(repoRoot, filePath);
      const parsed = parseSpecificationFile(fs.readFileSync(filePath, "utf8"), relativePath);
      issues.push(...parsed.issues);
      if (parsed.specification !== undefined) {
        specifications.push(parsed.specification);
      }
    }
  }

  const executionBindings: CatalogExecutionBinding[] = [];
  for (const bindingRoot of executionBindingRoots) {
    for (const filePath of listFilesRecursively(path.join(repoRoot, bindingRoot), ".ts")) {
      const relativePath = path.relative(repoRoot, filePath);
      const parsed = parseExecutionBindingFile(fs.readFileSync(filePath, "utf8"), relativePath);
      issues.push(...parsed.issues);
      if (parsed.binding !== undefined) {
        executionBindings.push(parsed.binding);
      }
    }
  }

  issues.push(
    ...checkSpecificationCorpus({
      specifications,
      localGoals,
      localGoalsSource: PRODUCT_GOALS_SOURCE,
      executionBindings: executionBindings.map((binding) => ({
        source: binding.source,
        binding,
      })),
    }),
  );

  for (const specification of specifications) {
    const directory = path.dirname(specification.source).replace(/^specifications\//, "");
    if (!specification.metadata.requirement.startsWith(`${directory}/`)) {
      issues.push({
        severity: "warning",
        source: specification.source,
        message: `requirement identity \`${specification.metadata.requirement}\` does not match its directory \`${directory}\``,
      });
    }
  }

  return {
    specifications,
    productGoals: [
      ...toCatalogGoals(sharedProductGoals, "shared"),
      ...toCatalogGoals(localGoals, "local"),
    ],
    executionBindings,
    issues,
  };
};

const groupLabel = (segment: string): string => {
  if (segment === "cli") {
    return "CLI";
  }
  if (segment === "extension-identity") {
    return "Extension identity";
  }
  if (segment === "package-identity") {
    return "Package identity";
  }
  if (segment === "settings-contract") {
    return "Settings contract";
  }
  if (segment === "source-resolution") {
    return "Source resolution";
  }
  if (segment === "version-constraints") {
    return "Version constraints";
  }
  if (segment === "system") {
    return "System";
  }
  return segment
    .split("-")
    .map((word) => (word.length > 0 ? `${word.slice(0, 1).toUpperCase()}${word.slice(1)}` : word))
    .join(" ");
};

const renderStatedOrUnknown = (value: readonly string[] | "unknown"): string | undefined => {
  if (value === "unknown") {
    return "unknown (not yet assessed)";
  }
  if (value.length === 0) {
    return undefined;
  }
  return value.join("; ");
};

interface CatalogDirectory {
  readonly specifications: CatalogSpecification[];
  readonly directories: Map<string, CatalogDirectory>;
}

/** Renders the committed, product-shaped catalog document. */
export const renderCatalogMarkdown = (catalog: SpecificationCatalog): string => {
  const lines: string[] = [
    "# AXM specification catalog",
    "",
    "Generated from `specifications/` metadata by `scripts/specification-catalog.ts`.",
    "Do not edit by hand: run `pnpm run generate` after a specification change.",
    "This catalog lists every requirement specification whether or not its",
    "implementation currently passes; execution evidence lives in test results,",
    "never here. Every specification in this catalog is normative: a",
    "specification on `main` is accepted authority, and merging the change that",
    "adds, revises, or removes one is the acceptance decision. Requirements are",
    "organized by their role in the product contract: product behavior,",
    "programmatic interfaces, and supporting system behavior. Within each role,",
    "directory headings follow the specification tree; CLI directories name",
    "registered command paths. Requirements at each node precede its child commands.",
    "",
    "Start from a command or an operating context with these structural maps:",
    "",
    "- [Command and parameter inventory](support/command-behavior-allocation.json) — command routes, flags and arguments with their applicable owners or unresolved scope.",
    "- [Context inventory](support/context-allocation.json) — extension types, sources, scopes and other declared contexts with their applicable owners or named interface authority.",
    "",
    "These maps support navigation and structural checks. They do not establish",
    "semantic completeness, correct applicability, or passing behavior.",
    "",
  ];

  const byRole = new Map<string, CatalogDirectory>();
  for (const specification of catalog.specifications) {
    const directories = specification.source
      .replace(/\\/g, "/")
      .replace(/^specifications\//, "")
      .split("/")
      .slice(0, -1);
    const role = specification.metadata.role;
    const root = byRole.get(role) ?? {
      specifications: [],
      directories: new Map<string, CatalogDirectory>(),
    };
    let directory: CatalogDirectory = root;
    for (const segment of directories) {
      const child = directory.directories.get(segment) ?? {
        specifications: [],
        directories: new Map<string, CatalogDirectory>(),
      };
      directory.directories.set(segment, child);
      directory = child;
    }
    directory.specifications.push(specification);
    byRole.set(role, root);
  }

  const bindingsByRequirement = new Map<string, CatalogExecutionBinding[]>();
  for (const binding of catalog.executionBindings) {
    for (const requirement of binding.requirements) {
      const entries = bindingsByRequirement.get(requirement) ?? [];
      entries.push(binding);
      bindingsByRequirement.set(requirement, entries);
    }
  }

  const renderSpecification = (entry: CatalogSpecification, directoryDepth: number): void => {
    const { metadata } = entry;
    const titleLevel = directoryDepth + 3;
    lines.push(
      titleLevel <= 6 ? `${"#".repeat(titleLevel)} ${metadata.title}` : `**${metadata.title}**`,
      "",
    );
    lines.push(`- Requirement: \`${metadata.requirement}\``);
    lines.push(`- Statement: ${metadata.statement}`);
    lines.push(
      `- Class: ${metadata.class}${
        metadata.characteristic !== undefined ? ` (${metadata.characteristic})` : ""
      }`,
    );
    lines.push(`- Role: ${metadata.role}`);
    lines.push(`- Product goals: ${metadata.goals.map((goal) => `\`${goal}\``).join(", ")}`);
    lines.push(
      `- Boundary: ${metadata.boundary ?? "memory"}; selection: ${metadata.selection ?? "per-change"}`,
    );
    if (metadata.boundaryRationale !== undefined) {
      lines.push(`- Boundary rationale: ${metadata.boundaryRationale}`);
    }
    lines.push(`- Methods: ${metadata.methods.join(", ")}`);
    if (metadata.derivedFrom.length > 0) {
      lines.push(
        `- Derived from: ${metadata.derivedFrom.map((entry) => `\`${entry}\``).join(", ")}`,
      );
    }
    if (metadata.supersedes.length > 0) {
      lines.push(`- Supersedes: ${metadata.supersedes.map((entry) => `\`${entry}\``).join(", ")}`);
    }
    const assumptions = renderStatedOrUnknown(metadata.assumptions);
    if (assumptions !== undefined) {
      lines.push(`- Assumptions: ${assumptions}`);
    }
    const openQuestions = renderStatedOrUnknown(metadata.openQuestions);
    if (openQuestions !== undefined) {
      lines.push(`- Open questions: ${openQuestions}`);
    }
    for (const limitation of metadata.limitations ?? []) {
      lines.push(
        `- Limitation: ${limitation.limitation} Retires when: ${limitation.retirementCondition}`,
      );
    }
    for (const gateEvidence of entry.boundEvidence) {
      lines.push(`- Bound evidence: \`${gateEvidence.gate}\` — ${gateEvidence.verifies}`);
    }
    const bindings = bindingsByRequirement.get(metadata.requirement) ?? [];
    for (const binding of bindings) {
      lines.push(
        `- Additional evidence: ${binding.boundary} via [\`${binding.source}\`](../${binding.source}) — ${binding.rationale}`,
      );
    }
    lines.push(`- Source: [\`${entry.source}\`](../${entry.source})`);
    lines.push("");
  };

  const renderDirectory = (directory: CatalogDirectory, segments: readonly string[]): void => {
    const name = segments.at(-1);
    if (name !== undefined) {
      // Markdown has six heading levels; deeper directory paths stay explicit as breadcrumbs.
      const label = segments.length > 4 ? segments.map(groupLabel).join(" / ") : groupLabel(name);
      lines.push(`${"#".repeat(Math.min(segments.length + 2, 6))} ${label}`, "");
    }
    for (const entry of [...directory.specifications].sort((a, b) =>
      a.metadata.requirement.localeCompare(b.metadata.requirement),
    )) {
      renderSpecification(entry, segments.length);
    }
    for (const [segment, child] of [...directory.directories.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      renderDirectory(child, [...segments, segment]);
    }
  };

  for (const role of REQUIREMENT_ROLE_ORDER) {
    const directory = byRole.get(role);
    if (directory === undefined) {
      continue;
    }
    lines.push(`## ${REQUIREMENT_ROLE_LABELS[role]}`, "");
    renderDirectory(directory, []);
  }

  lines.push("## Product goals", "");
  for (const scope of ["shared", "local"] as const) {
    lines.push(
      `### ${scope === "shared" ? "Shared across AgentXM repositories" : "Local to AXM"}`,
      "",
    );
    for (const goal of catalog.productGoals
      .filter((entry) => entry.scope === scope)
      .sort((a, b) => a.id.localeCompare(b.id))) {
      const suffix = goal.status === "retired" ? " (retired)" : "";
      lines.push(`- \`${goal.id}\`${suffix} — ${goal.outcome}`);
    }
    lines.push("");
  }
  return lines.join("\n");
};

export const formatIssue = (issue: CatalogIssue): string =>
  `${issue.severity}: ${issue.source}: ${issue.message}`;
