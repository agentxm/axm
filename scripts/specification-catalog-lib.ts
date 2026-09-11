/**
 * Static extraction and validation for the specification catalog.
 *
 * Reads specification source with the TypeScript compiler API without
 * executing any test file, so the catalog renders even when an
 * implementation fails its specification. Metadata must be literal-only:
 * computed metadata is rejected so every requirement-contract change is an
 * explicit source diff. Vocabulary, shape, and corpus linkage come from the
 * shared contract; this module owns only the static extraction, the
 * statically derived digests the verdict compares, and the repository's
 * catalog rendering. Which files are specifications, and which project owns
 * each, is decided by `workspace-discovery.ts`.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import ts from "typescript";

import { digestContent } from "./specification-evidence.js";

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
} from "@agentxm/specification-metadata";

export interface ParsedSpecification {
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

export interface CatalogSpecification extends ParsedSpecification {
  /** Nx project that owns the canonical source file. */
  readonly owner: string;
}

/**
 * One specification with the statically derived digests the verdict
 * compares: raw bytes for evidence-receipt matching, the decisive example
 * surface, and the normalized body.
 */
export interface SpecificationSource {
  readonly specification: CatalogSpecification;
  /** SHA-256 of the file bytes, matched against execution receipts. */
  readonly contentDigest: string;
  /** SHA-256 of the ordered decisive example surface. */
  readonly examplesDigest: string;
  /** SHA-256 of the AST printed without comments or formatting. */
  readonly bodyDigest: string;
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

/** The local product-goal registry stays beside the generated catalog. */
export const PRODUCT_GOALS_SOURCE = "specifications/product-goals.ts";

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
): { readonly specification?: ParsedSpecification; readonly issues: CatalogIssue[] } => {
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

const TEST_CALLEES: ReadonlySet<string> = new Set(["describe", "suite", "it", "test"]);

const calleeChain = (expression: ts.Expression): string[] | undefined => {
  if (ts.isIdentifier(expression)) return [expression.text];
  if (ts.isPropertyAccessExpression(expression)) {
    const chain = calleeChain(expression.expression);
    return chain === undefined ? undefined : [...chain, expression.name.text];
  }
  return undefined;
};

const literalText = (node: ts.Node, sourceFile: ts.SourceFile): string =>
  ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
    ? node.text
    : node.getText(sourceFile);

const rowLabel = (row: ts.Expression, sourceFile: ts.SourceFile): string => {
  if (ts.isObjectLiteralExpression(row)) {
    const labelled = row.properties.find(
      (property) =>
        ts.isPropertyAssignment(property) &&
        ts.isIdentifier(property.name) &&
        property.name.text === "label",
    );
    const candidate =
      labelled ??
      row.properties.find(
        (property) =>
          ts.isPropertyAssignment(property) &&
          (ts.isStringLiteral(property.initializer) ||
            ts.isNoSubstitutionTemplateLiteral(property.initializer)),
      );
    if (candidate !== undefined && ts.isPropertyAssignment(candidate)) {
      return literalText(candidate.initializer, sourceFile);
    }
    return row.getText(sourceFile);
  }
  if (ts.isArrayLiteralExpression(row)) {
    const first = row.elements[0];
    return first === undefined ? row.getText(sourceFile) : literalText(first, sourceFile);
  }
  return literalText(row, sourceFile);
};

const tableRows = (table: ts.Expression | undefined, sourceFile: ts.SourceFile): string[] => {
  if (table === undefined) return [];
  const unwrapped =
    ts.isAsExpression(table) || ts.isSatisfiesExpression(table) ? table.expression : table;
  if (!ts.isArrayLiteralExpression(unwrapped)) return [unwrapped.getText(sourceFile)];
  return unwrapped.elements.map((row) => rowLabel(row, sourceFile));
};

/**
 * The decisive example surface, in source order: every `describe`, `it`,
 * `test` title (through any modifier chain such as `it.effect`, `it.live`,
 * `it.skip`, `it.effect.prop`) plus the row labels of every `each` table.
 * Titles are what a reviewer reads as the examples that adjudicate the rule;
 * asserted literals inside a body are deliberately not part of this surface.
 */
export const extractExampleSurface = (sourceText: string): readonly string[] => {
  const sourceFile = ts.createSourceFile(
    "specification.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
  );
  const surface: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isCallExpression(callee)) {
        // `it.each(table)(title, body)`: rows first, then the parameterized title.
        const chain = calleeChain(callee.expression);
        const head = chain?.[0];
        if (
          chain !== undefined &&
          head !== undefined &&
          TEST_CALLEES.has(head) &&
          chain.at(-1) === "each"
        ) {
          const name = chain.join(".");
          for (const row of tableRows(callee.arguments[0], sourceFile))
            surface.push(`${name}[row]:${row}`);
          const title = node.arguments[0];
          if (title !== undefined) surface.push(`${name}:${literalText(title, sourceFile)}`);
        }
      } else {
        const chain = calleeChain(callee);
        const head = chain?.[0];
        if (
          chain !== undefined &&
          head !== undefined &&
          TEST_CALLEES.has(head) &&
          chain.at(-1) !== "each"
        ) {
          const title = node.arguments[0];
          if (title !== undefined)
            surface.push(`${chain.join(".")}:${literalText(title, sourceFile)}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return surface;
};

const bodyPrinter = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });

const MODULE_PLACEHOLDER = "<module>";

/** Import module specifiers become a placeholder; the imported bindings stay. */
const neutralizeImportSpecifiers: ts.TransformerFactory<ts.SourceFile> = (context) => {
  const visit = (node: ts.Node): ts.Node => {
    if (ts.isImportDeclaration(node)) {
      return ts.factory.updateImportDeclaration(
        node,
        node.modifiers,
        node.importClause,
        ts.factory.createStringLiteral(MODULE_PLACEHOLDER),
        node.attributes,
      );
    }
    return ts.visitEachChild(node, visit, context);
  };
  return (sourceFile) => ts.visitEachChild(sourceFile, visit, context);
};

/**
 * The source printed from its AST without comments, with every import's
 * module specifier neutralized, then collapsed to one space between tokens
 * and none around punctuation. Comments, line breaks, indentation, and the
 * path a binding is imported from never masquerade as revision: a move
 * rewrites import paths mechanically, while a change in which bindings a
 * specification imports, or how it uses them, still changes the body. The
 * printer keeps a block's single- or multi-line shape from the original,
 * which is why the printed text is collapsed rather than compared directly.
 */
export const normalizedBody = (sourceText: string): string => {
  const sourceFile = ts.createSourceFile(
    "specification.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    false,
  );
  const transformed = ts.transform(sourceFile, [neutralizeImportSpecifiers]);
  const [neutralized] = transformed.transformed;
  const printed = bodyPrinter.printFile(neutralized ?? sourceFile);
  transformed.dispose();
  return printed
    .replace(/\s+/gu, " ")
    .replace(/\s*([{}()[\];,])\s*/gu, "$1")
    .trim();
};

/** Whether the file declares an exported `specification` constant (statically). */
export const exportsSpecification = (sourceText: string): boolean => {
  const sourceFile = ts.createSourceFile("file.ts", sourceText, ts.ScriptTarget.Latest, false);
  return sourceFile.statements.some(
    (statement) =>
      ts.isVariableStatement(statement) &&
      isExported(statement) &&
      statement.declarationList.declarations.some(
        (declaration) =>
          ts.isIdentifier(declaration.name) && declaration.name.text === "specification",
      ),
  );
};

export const digestSpecificationSource = (
  specification: CatalogSpecification,
  content: string,
): SpecificationSource => ({
  specification,
  contentDigest: digestContent(content),
  examplesDigest: digestContent(JSON.stringify(extractExampleSurface(content))),
  bodyDigest: digestContent(normalizedBody(content)),
});

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
  /** Every discovered specification, each with its owner project. */
  readonly specifications: readonly CatalogSpecification[];
  /** Every discovered execution binding. */
  readonly executionBindings?: readonly CatalogExecutionBinding[];
  /** Discovery issues (ownership, placement, parse failures) to carry into the catalog. */
  readonly issues?: readonly CatalogIssue[];
}

/**
 * Validates the discovered corpus against the shared contract and the local
 * product-goal registry. Discovery happens before this call and never
 * executes a specification; neither does this.
 */
export const collectCatalog = (options: CollectCatalogOptions): SpecificationCatalog => {
  const { repoRoot, specifications, executionBindings = [] } = options;
  const issues: CatalogIssue[] = [...(options.issues ?? [])];

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

  return {
    specifications: [...specifications].sort((left, right) =>
      left.metadata.requirement.localeCompare(right.metadata.requirement),
    ),
    productGoals: [
      ...toCatalogGoals(sharedProductGoals, "shared"),
      ...toCatalogGoals(localGoals, "local"),
    ],
    executionBindings,
    issues,
  };
};

const CLASS_LABELS: Readonly<Record<SpecificationMetadata["class"], string>> = {
  functional: "Functional",
  quality: "Quality",
  constraint: "Constraints",
  "external-conformance": "External conformance",
  "human-factors": "Human factors",
  process: "Process",
};

type SpecificationClass = SpecificationMetadata["class"];

const CLASS_ORDER: readonly SpecificationClass[] = [
  "functional",
  "quality",
  "constraint",
  "external-conformance",
  "human-factors",
  "process",
];

const renderStatedOrUnknown = (value: readonly string[] | "unknown"): string | undefined => {
  if (value === "unknown") {
    return "unknown (not yet assessed)";
  }
  if (value.length === 0) {
    return undefined;
  }
  return value.join("; ");
};

/**
 * Renders the committed, product-shaped catalog document: role, then the
 * primary product goal, then review class. Nothing about the layout of the
 * repository shapes the headings; each entry names its owner and links its
 * canonical source.
 */
export const renderCatalogMarkdown = (catalog: SpecificationCatalog): string => {
  const lines: string[] = [
    "# AXM specification catalog",
    "",
    "Generated from specification metadata discovered across every authored",
    "project by `scripts/specification-catalog.ts`. Do not edit by hand: run",
    "`pnpm run generate` after a specification change. This catalog lists every",
    "requirement specification whether or not its implementation currently",
    "passes; execution evidence lives in test results, never here. Every",
    "specification in this catalog is normative: a specification on `main` is",
    "accepted authority, and merging the change that adds, revises, or removes",
    "one is the acceptance decision. Requirements are organized by meaning, not",
    "by location: by their role in the product contract (product behavior,",
    "programmatic interfaces, supporting system behavior), then by the first",
    "product goal each names as its primary goal, then by review class. Each",
    "entry names the project that owns its canonical source file and links it;",
    "the requirement identity is stable and independent of that path.",
    "",
    "Start from a command or an operating context with these structural maps:",
    "",
    "- [Command and parameter inventory](../apps/cli/src/test-support/command-behavior-allocation.json) — command routes, flags and arguments with their applicable owners or unresolved scope.",
    "- [Context inventory](../apps/cli/src/test-support/context-allocation.json) — extension types, sources, scopes and other declared contexts with their applicable owners or named interface authority.",
    "",
    "These maps support navigation and structural checks. They do not establish",
    "semantic completeness, correct applicability, or passing behavior.",
    "",
  ];

  const goalOutcomes = new Map(catalog.productGoals.map((goal) => [goal.id, goal.outcome]));
  type ByClass = Map<SpecificationClass, CatalogSpecification[]>;
  const byRole = new Map<string, Map<string, ByClass>>();
  for (const specification of catalog.specifications) {
    const { role, goals } = specification.metadata;
    const primaryGoal = goals[0];
    const byGoal = byRole.get(role) ?? new Map<string, ByClass>();
    const byClass: ByClass = byGoal.get(primaryGoal) ?? new Map();
    const entries = byClass.get(specification.metadata.class) ?? [];
    entries.push(specification);
    byClass.set(specification.metadata.class, entries);
    byGoal.set(primaryGoal, byClass);
    byRole.set(role, byGoal);
  }

  const bindingsByRequirement = new Map<string, CatalogExecutionBinding[]>();
  for (const binding of catalog.executionBindings) {
    for (const requirement of binding.requirements) {
      const entries = bindingsByRequirement.get(requirement) ?? [];
      entries.push(binding);
      bindingsByRequirement.set(requirement, entries);
    }
  }

  const renderSpecification = (entry: CatalogSpecification): void => {
    const { metadata } = entry;
    lines.push(`##### ${metadata.title}`, "");
    lines.push(`- Requirement: \`${metadata.requirement}\``);
    lines.push(`- Owner: \`${entry.owner}\``);
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
    for (const binding of bindingsByRequirement.get(metadata.requirement) ?? []) {
      lines.push(
        `- Additional evidence: ${binding.boundary} via [\`${binding.source}\`](../${binding.source}) — ${binding.rationale}`,
      );
    }
    lines.push(`- Source: [\`${entry.source}\`](../${entry.source})`);
    lines.push("");
  };

  for (const role of REQUIREMENT_ROLE_ORDER) {
    const byGoal = byRole.get(role);
    if (byGoal === undefined) {
      continue;
    }
    lines.push(`## ${REQUIREMENT_ROLE_LABELS[role]}`, "");
    for (const [goal, byClass] of [...byGoal.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`### Goal: ${goal}`, "");
      const outcome = goalOutcomes.get(goal);
      if (outcome !== undefined) {
        lines.push(outcome, "");
      }
      for (const [specificationClass, entries] of [...byClass.entries()].sort(
        ([a], [b]) => CLASS_ORDER.indexOf(a) - CLASS_ORDER.indexOf(b),
      )) {
        lines.push(`#### ${CLASS_LABELS[specificationClass]}`, "");
        for (const entry of [...entries].sort((a, b) =>
          a.metadata.requirement.localeCompare(b.metadata.requirement),
        )) {
          renderSpecification(entry);
        }
      }
    }
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
