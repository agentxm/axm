/**
 * Static extraction and validation for the specification catalog.
 *
 * Reads `specifications/` source with the TypeScript compiler API without
 * executing any test file, so the catalog renders even when an
 * implementation fails its specification. Metadata must be literal-only:
 * computed metadata is rejected so every requirement-contract change is an
 * explicit source diff.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import ts from "typescript";

export interface CatalogSpecification {
  readonly requirement: string;
  readonly title: string;
  readonly requirementClass: string;
  readonly requirementRole: string;
  readonly goals: readonly string[];
  readonly boundary: string;
  readonly selection: string;
  readonly methods: readonly string[];
  /** Repository-relative source path. */
  readonly source: string;
}

export interface CatalogExecutionBinding {
  readonly requirements: readonly string[];
  readonly boundary: string;
  readonly rationale: string;
  /** Repository-relative source path. */
  readonly source: string;
}

export interface CatalogProductGoal {
  readonly id: string;
  readonly outcome: string;
  readonly status: "active" | "retired";
}

export interface CatalogIssue {
  readonly severity: "error" | "warning";
  readonly source: string;
  readonly message: string;
}

export interface SpecificationCatalog {
  readonly specifications: readonly CatalogSpecification[];
  readonly productGoals: readonly CatalogProductGoal[];
  readonly executionBindings: readonly CatalogExecutionBinding[];
  readonly issues: readonly CatalogIssue[];
}

const REQUIREMENT_CLASSES = new Set([
  "functional",
  "installability",
  "compatibility",
  "performance",
  "security",
  "usability",
  "architecture",
  "process",
  "external-conformance",
]);

const REQUIREMENT_ROLE_ORDER = ["experience", "interface", "supporting"] as const;
const REQUIREMENT_ROLES: ReadonlySet<string> = new Set(REQUIREMENT_ROLE_ORDER);

const REQUIREMENT_ROLE_LABELS: Readonly<Record<(typeof REQUIREMENT_ROLE_ORDER)[number], string>> = {
  experience: "Product behavior",
  interface: "Programmatic interfaces",
  supporting: "Supporting system behavior",
};

const EXECUTION_BOUNDARIES = new Set([
  "memory",
  "process",
  "binary",
  "packed-artifact",
  "installed",
  "platform",
  "published-artifact",
  "deployed",
  "repository",
]);

const EXECUTION_SELECTIONS = new Set([
  "per-change",
  "platform-matrix",
  "scheduled",
  "release-candidate",
  "post-deployment",
]);

const IDENTITY_SEGMENT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Words that identify implementation vocabulary leaking into product titles. */
const TITLE_IMPLEMENTATION_WORDS = new Set([
  "layer",
  "handler",
  "mock",
  "stub",
  "middleware",
  "refactor",
]);

const CAMEL_CASE_TOKEN = /\b[a-z]+[A-Z][A-Za-z]*\b/;

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

const isStringValue = (value: LiteralValue | undefined): value is string =>
  typeof value === "string";

const isStringArray = (value: LiteralValue | undefined): value is readonly string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

const isRecordValue = (
  value: LiteralValue | undefined,
): value is { readonly [key: string]: LiteralValue } =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isValidIdentity = (value: string): boolean => {
  const segments = value.split("/");
  return segments.length >= 2 && segments.every((segment) => IDENTITY_SEGMENT.test(segment));
};

export const lintSpecificationTitle = (title: string): string | undefined => {
  if (CAMEL_CASE_TOKEN.test(title)) {
    return `title contains an implementation-style camelCase token: "${title}"`;
  }
  for (const word of title.toLowerCase().split(/[^a-z]+/)) {
    if (TITLE_IMPLEMENTATION_WORDS.has(word)) {
      return `title contains implementation vocabulary ("${word}"): "${title}"`;
    }
  }
  return undefined;
};

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
  if (!isRecordValue(extraction.value)) {
    issues.push({
      severity: "error",
      source: relativePath,
      message: "`specification` must be an object literal",
    });
    return { issues };
  }
  const record = extraction.value;
  const requirement = record["requirement"];
  const title = record["title"];
  const requirementClass = record["class"];
  const requirementRole = record["role"];
  const goals = record["goals"];
  if (!isStringValue(requirement) || !isValidIdentity(requirement)) {
    issues.push({
      severity: "error",
      source: relativePath,
      message: "`requirement` must be two or more lowercase kebab segments joined by '/'",
    });
    return { issues };
  }
  if (!isStringValue(title) || title.length === 0) {
    issues.push({
      severity: "error",
      source: relativePath,
      message: "`title` must be a non-empty string",
    });
    return { issues };
  }
  if (!isStringValue(requirementClass) || !REQUIREMENT_CLASSES.has(requirementClass)) {
    issues.push({
      severity: "error",
      source: relativePath,
      message: "`class` must be a known requirement class",
    });
    return { issues };
  }
  if (!isStringValue(requirementRole) || !REQUIREMENT_ROLES.has(requirementRole)) {
    issues.push({
      severity: "error",
      source: relativePath,
      message: "`role` must be a known requirement role",
    });
    return { issues };
  }
  if (!isStringArray(goals) || goals.length === 0) {
    issues.push({
      severity: "error",
      source: relativePath,
      message: "`goals` must name at least one registered product goal",
    });
    return { issues };
  }
  const boundary = record["boundary"] ?? "memory";
  if (!isStringValue(boundary) || !EXECUTION_BOUNDARIES.has(boundary)) {
    issues.push({
      severity: "error",
      source: relativePath,
      message: "`boundary` must be a known execution boundary",
    });
    return { issues };
  }
  const selection = record["selection"] ?? "per-change";
  if (!isStringValue(selection) || !EXECUTION_SELECTIONS.has(selection)) {
    issues.push({
      severity: "error",
      source: relativePath,
      message: "`selection` must be a known selection policy",
    });
    return { issues };
  }
  const methods = record["methods"] ?? [];
  if (!isStringArray(methods)) {
    issues.push({
      severity: "error",
      source: relativePath,
      message: "`methods` must be an array of strings",
    });
    return { issues };
  }
  if (record["cases"] !== undefined) {
    issues.push({
      severity: "error",
      source: relativePath,
      message: "`cases` duplicates native test names; use native tests as reportable scenarios",
    });
    return { issues };
  }
  const titleFinding = lintSpecificationTitle(title);
  if (titleFinding !== undefined) {
    issues.push({ severity: "error", source: relativePath, message: titleFinding });
  }
  return {
    specification: {
      requirement,
      title,
      requirementClass,
      requirementRole,
      goals,
      boundary,
      selection,
      methods,
      source: relativePath,
    },
    issues,
  };
};

export const parseProductGoalRegistry = (
  sourceText: string,
  relativePath: string,
): { readonly productGoals: readonly CatalogProductGoal[]; readonly issues: CatalogIssue[] } => {
  const issues: CatalogIssue[] = [];
  const extraction = extractDefinedLiteral(sourceText, relativePath, "productGoals", [
    "defineProductGoals",
  ]);
  issues.push(...extraction.issues);
  if (extraction.value === undefined || !isRecordValue(extraction.value)) {
    issues.push({
      severity: "error",
      source: relativePath,
      message: "product-goal registry must export a `productGoals` object literal",
    });
    return { productGoals: [], issues };
  }
  const productGoals: CatalogProductGoal[] = [];
  for (const [id, definition] of Object.entries(extraction.value)) {
    if (!IDENTITY_SEGMENT.test(id)) {
      issues.push({
        severity: "error",
        source: relativePath,
        message: `product-goal id \`${id}\` must be a lowercase kebab identifier`,
      });
      continue;
    }
    if (!isRecordValue(definition) || !isStringValue(definition["outcome"])) {
      issues.push({
        severity: "error",
        source: relativePath,
        message: `product goal \`${id}\` must declare a string outcome`,
      });
      continue;
    }
    const status = definition["status"] ?? "active";
    if (status !== "active" && status !== "retired") {
      issues.push({
        severity: "error",
        source: relativePath,
        message: `product goal \`${id}\` status must be "active" or "retired"`,
      });
      continue;
    }
    productGoals.push({ id, outcome: definition["outcome"], status });
  }
  return { productGoals, issues };
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
  if (!isRecordValue(extraction.value)) {
    issues.push({
      severity: "error",
      source: relativePath,
      message: "`executionBinding` must be an object literal",
    });
    return { issues };
  }
  const record = extraction.value;
  const requirements = record["requirements"];
  const boundary = record["boundary"];
  const rationale = record["rationale"];
  if (!isStringArray(requirements) || requirements.length === 0) {
    issues.push({
      severity: "error",
      source: relativePath,
      message: "`executionBinding.requirements` must list at least one requirement identity",
    });
    return { issues };
  }
  if (!isStringValue(boundary) || !EXECUTION_BOUNDARIES.has(boundary)) {
    issues.push({
      severity: "error",
      source: relativePath,
      message: "`executionBinding.boundary` must be a known execution boundary",
    });
    return { issues };
  }
  if (!isStringValue(rationale) || rationale.length === 0) {
    issues.push({
      severity: "error",
      source: relativePath,
      message:
        "`executionBinding.rationale` must state the boundary-specific reason this execution exists",
    });
    return { issues };
  }
  return { binding: { requirements, boundary, rationale, source: relativePath }, issues };
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

export interface CollectCatalogOptions {
  readonly repoRoot: string;
  /** Directories under the repository root that hold execution bindings. */
  readonly executionBindingRoots?: readonly string[];
}

export const collectCatalog = (options: CollectCatalogOptions): SpecificationCatalog => {
  const { repoRoot, executionBindingRoots = ["packages/cli-e2e/src"] } = options;
  const issues: CatalogIssue[] = [];
  const specifications: CatalogSpecification[] = [];

  const specificationsRoot = path.join(repoRoot, "specifications");
  const productGoalsPath = path.join(specificationsRoot, "product-goals.ts");
  let productGoals: readonly CatalogProductGoal[] = [];
  if (fs.existsSync(productGoalsPath)) {
    const parsed = parseProductGoalRegistry(
      fs.readFileSync(productGoalsPath, "utf8"),
      path.relative(repoRoot, productGoalsPath),
    );
    productGoals = parsed.productGoals;
    issues.push(...parsed.issues);
  } else {
    issues.push({
      severity: "error",
      source: "specifications/product-goals.ts",
      message: "product-goal registry file is missing",
    });
  }

  for (const area of ["cli", "client-core", "system"]) {
    for (const filePath of listFilesRecursively(path.join(specificationsRoot, area), ".spec.ts")) {
      const relativePath = path.relative(repoRoot, filePath);
      const parsed = parseSpecificationFile(fs.readFileSync(filePath, "utf8"), relativePath);
      issues.push(...parsed.issues);
      if (parsed.specification !== undefined) {
        specifications.push(parsed.specification);
      }
    }
  }

  const byRequirement = new Map<string, CatalogSpecification>();
  for (const specification of specifications) {
    const existing = byRequirement.get(specification.requirement);
    if (existing !== undefined) {
      issues.push({
        severity: "error",
        source: specification.source,
        message: `duplicate requirement identity \`${specification.requirement}\` (also declared in ${existing.source})`,
      });
      continue;
    }
    byRequirement.set(specification.requirement, specification);
  }

  const productGoalIds = new Map(productGoals.map((goal) => [goal.id, goal] as const));
  const referencedProductGoals = new Set<string>();
  for (const specification of specifications) {
    for (const goal of specification.goals) {
      referencedProductGoals.add(goal);
      const registered = productGoalIds.get(goal);
      if (registered === undefined) {
        issues.push({
          severity: "error",
          source: specification.source,
          message: `references unregistered product goal \`${goal}\``,
        });
      } else if (registered.status === "retired") {
        issues.push({
          severity: "error",
          source: specification.source,
          message: `references retired product goal \`${goal}\`; the specification is a retirement candidate`,
        });
      }
    }
    const directory = path.dirname(specification.source).replace(/^specifications\//, "");
    if (!specification.requirement.startsWith(`${directory}/`)) {
      issues.push({
        severity: "warning",
        source: specification.source,
        message: `requirement identity \`${specification.requirement}\` does not match its directory \`${directory}\``,
      });
    }
  }
  for (const goal of productGoals) {
    if (
      goal.status === "active" &&
      !referencedProductGoals.has(goal.id) &&
      specifications.length > 0
    ) {
      issues.push({
        severity: "warning",
        source: "specifications/product-goals.ts",
        message: `active product goal \`${goal.id}\` has no referencing specification (missing coverage or a dead goal)`,
      });
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
  for (const binding of executionBindings) {
    for (const requirement of binding.requirements) {
      if (!byRequirement.has(requirement)) {
        issues.push({
          severity: "error",
          source: binding.source,
          message: `execution binding references unknown requirement \`${requirement}\``,
        });
      }
    }
  }

  return { specifications, productGoals, executionBindings, issues };
};

const groupLabel = (segment: string): string => {
  if (segment === "cli") {
    return "CLI";
  }
  if (segment === "client-core") {
    return "Client core";
  }
  if (segment === "system") {
    return "System";
  }
  return segment
    .split("-")
    .map((word) => (word.length > 0 ? `${word.slice(0, 1).toUpperCase()}${word.slice(1)}` : word))
    .join(" ");
};

/** Renders the committed, product-shaped catalog document. */
export const renderCatalogMarkdown = (catalog: SpecificationCatalog): string => {
  const lines: string[] = [
    "# AXM specification catalog",
    "",
    "Generated from `specifications/` metadata by `scripts/specification-catalog.ts`.",
    "Do not edit by hand: run `pnpm run generate` after a specification change.",
    "This catalog lists every authoritative requirement whether or not its",
    "implementation currently passes; execution evidence lives in test results,",
    "never here. Requirements are organized by their role in the product contract:",
    "product behavior, programmatic interfaces, and supporting system behavior.",
    "",
  ];

  const byRole = new Map<string, Map<string, Map<string, CatalogSpecification[]>>>();
  for (const specification of catalog.specifications) {
    const segments = specification.requirement.split("/");
    const area = segments[0] ?? "system";
    const capability = segments[1] ?? "general";
    const areas =
      byRole.get(specification.requirementRole) ??
      new Map<string, Map<string, CatalogSpecification[]>>();
    const capabilities = areas.get(area) ?? new Map<string, CatalogSpecification[]>();
    const entries = capabilities.get(capability) ?? [];
    entries.push(specification);
    capabilities.set(capability, entries);
    areas.set(area, capabilities);
    byRole.set(specification.requirementRole, areas);
  }

  const bindingsByRequirement = new Map<string, CatalogExecutionBinding[]>();
  for (const binding of catalog.executionBindings) {
    for (const requirement of binding.requirements) {
      const entries = bindingsByRequirement.get(requirement) ?? [];
      entries.push(binding);
      bindingsByRequirement.set(requirement, entries);
    }
  }

  for (const role of REQUIREMENT_ROLE_ORDER) {
    const areas = byRole.get(role);
    if (areas === undefined) {
      continue;
    }
    lines.push(`## ${REQUIREMENT_ROLE_LABELS[role]}`, "");
    for (const area of [...areas.keys()].sort()) {
      lines.push(`### ${groupLabel(area)}`, "");
      const capabilities = areas.get(area);
      if (capabilities === undefined) {
        continue;
      }
      for (const capability of [...capabilities.keys()].sort()) {
        lines.push(`#### ${groupLabel(capability)}`, "");
        const entries = capabilities.get(capability) ?? [];
        for (const entry of [...entries].sort((a, b) =>
          a.requirement.localeCompare(b.requirement),
        )) {
          lines.push(`##### ${entry.title}`, "");
          lines.push(`- Requirement: \`${entry.requirement}\``);
          lines.push(`- Class: ${entry.requirementClass}`);
          lines.push(`- Role: ${entry.requirementRole}`);
          lines.push(`- Product goals: ${entry.goals.map((goal) => `\`${goal}\``).join(", ")}`);
          lines.push(`- Boundary: ${entry.boundary}; selection: ${entry.selection}`);
          if (entry.methods.length > 0) {
            lines.push(`- Methods: ${entry.methods.join(", ")}`);
          }
          const bindings = bindingsByRequirement.get(entry.requirement) ?? [];
          for (const binding of bindings) {
            lines.push(
              `- Additional evidence: ${binding.boundary} via [\`${binding.source}\`](../${binding.source}) — ${binding.rationale}`,
            );
          }
          lines.push(`- Source: [\`${entry.source}\`](../${entry.source})`);
          lines.push("");
        }
      }
    }
  }

  lines.push("## Product goals", "");
  for (const goal of [...catalog.productGoals].sort((a, b) => a.id.localeCompare(b.id))) {
    const suffix = goal.status === "retired" ? " (retired)" : "";
    lines.push(`- \`${goal.id}\`${suffix} — ${goal.outcome}`);
  }
  lines.push("");
  return lines.join("\n");
};

export const formatIssue = (issue: CatalogIssue): string =>
  `${issue.severity}: ${issue.source}: ${issue.message}`;
