import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  collectCatalog,
  lintSpecificationTitle,
  parseExecutionBindingFile,
  parseProductGoalRegistry,
  parseSpecificationFile,
  renderCatalogMarkdown,
} from "./specification-catalog-lib.js";

const validSpecificationSource = `
import { defineSpecification } from "../../support/contract.js";

export const specification = defineSpecification({
  requirement: "cli/install/realizes-direct-intent",
  title: "Install realizes directly desired extensions",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption"],
  methods: ["example"],
});

describe("Install", () => {});
`;

describe("parseSpecificationFile", () => {
  it("extracts literal metadata from a defineSpecification export", () => {
    const parsed = parseSpecificationFile(
      validSpecificationSource,
      "specifications/cli/install/realizes-direct-intent.spec.ts",
    );
    expect(parsed.issues).toEqual([]);
    expect(parsed.specification).toMatchObject({
      requirement: "cli/install/realizes-direct-intent",
      title: "Install realizes directly desired extensions",
      requirementClass: "functional",
      requirementRole: "experience",
      goals: ["extension-adoption"],
      boundary: "memory",
      selection: "per-change",
      methods: ["example"],
    });
  });

  it("rejects a file without a specification export", () => {
    const parsed = parseSpecificationFile(
      "export const other = 1;",
      "specifications/cli/x.spec.ts",
    );
    expect(parsed.specification).toBeUndefined();
    expect(parsed.issues.some((issue) => issue.severity === "error")).toBe(true);
  });

  it("rejects computed metadata", () => {
    const parsed = parseSpecificationFile(
      `export const specification = defineSpecification({ requirement: "cli/install/" + name, title: "t", class: "functional", role: "experience", goals: ["a"] });`,
      "specifications/cli/install/computed.spec.ts",
    );
    expect(parsed.specification).toBeUndefined();
    expect(parsed.issues[0]?.message).toContain("literal-only");
  });

  it("rejects a malformed requirement identity", () => {
    const parsed = parseSpecificationFile(
      `export const specification = defineSpecification({ requirement: "Install", title: "t", class: "functional", role: "experience", goals: ["a"] });`,
      "specifications/cli/install/bad-identity.spec.ts",
    );
    expect(parsed.specification).toBeUndefined();
    expect(parsed.issues[0]?.message).toContain("requirement");
  });

  it("rejects an unknown requirement role", () => {
    const parsed = parseSpecificationFile(
      `export const specification = defineSpecification({ requirement: "cli/install/a", title: "t", class: "functional", role: "technical", goals: ["a"] });`,
      "specifications/cli/install/a.spec.ts",
    );
    expect(parsed.specification).toBeUndefined();
    expect(parsed.issues[0]?.message).toContain("role");
  });

  it("rejects duplicated case metadata", () => {
    const parsed = parseSpecificationFile(
      `export const specification = defineSpecification({ requirement: "cli/install/a", title: "t", class: "functional", role: "experience", goals: ["a"], cases: { duplicate: "native test name" } });`,
      "specifications/cli/install/a.spec.ts",
    );
    expect(parsed.specification).toBeUndefined();
    expect(parsed.issues[0]?.message).toContain("native test names");
  });

  it("rejects implementation vocabulary in titles", () => {
    expect(lintSpecificationTitle("Install runs the installHandler")).toContain("camelCase");
    expect(lintSpecificationTitle("Install provides the workspace layer")).toContain("layer");
    expect(lintSpecificationTitle("Install realizes directly desired extensions")).toBeUndefined();
  });

  it("extracts bound evidence declared beside the specification", () => {
    const parsed = parseSpecificationFile(
      `${validSpecificationSource}
export const boundEvidence = defineBoundEvidence([
  { gate: "lint: example-gate", verifies: "Rejects the violation on every change." },
]);`,
      "specifications/cli/install/realizes-direct-intent.spec.ts",
    );
    expect(parsed.issues).toEqual([]);
    expect(parsed.specification?.boundEvidence).toEqual([
      { gate: "lint: example-gate", verifies: "Rejects the violation on every change." },
    ]);
  });

  it("defaults bound evidence to empty when the export is absent", () => {
    const parsed = parseSpecificationFile(
      validSpecificationSource,
      "specifications/cli/install/realizes-direct-intent.spec.ts",
    );
    expect(parsed.specification?.boundEvidence).toEqual([]);
  });

  it("rejects bound evidence without a gate or verification statement", () => {
    const parsed = parseSpecificationFile(
      `${validSpecificationSource}
export const boundEvidence = defineBoundEvidence([{ gate: "", verifies: "" }]);`,
      "specifications/cli/install/realizes-direct-intent.spec.ts",
    );
    expect(parsed.specification).toBeUndefined();
    expect(parsed.issues.some((issue) => issue.message.includes("boundEvidence"))).toBe(true);
  });

  it("rejects computed bound evidence", () => {
    const parsed = parseSpecificationFile(
      `${validSpecificationSource}
export const boundEvidence = defineBoundEvidence([{ gate: gateName, verifies: "x" }]);`,
      "specifications/cli/install/realizes-direct-intent.spec.ts",
    );
    expect(parsed.specification).toBeUndefined();
    expect(parsed.issues.some((issue) => issue.message.includes("literal-only"))).toBe(true);
  });
});

describe("parseProductGoalRegistry", () => {
  it("extracts product goals with default active status", () => {
    const parsed = parseProductGoalRegistry(
      `export const productGoals = defineProductGoals({ "extension-adoption": { outcome: "Extensions install." } });`,
      "specifications/product-goals.ts",
    );
    expect(parsed.issues).toEqual([]);
    expect(parsed.productGoals).toEqual([
      { id: "extension-adoption", outcome: "Extensions install.", status: "active" },
    ]);
  });

  it("rejects a product goal without an outcome", () => {
    const parsed = parseProductGoalRegistry(
      `export const productGoals = defineProductGoals({ "extension-adoption": { status: "active" } });`,
      "specifications/product-goals.ts",
    );
    expect(parsed.issues.some((issue) => issue.severity === "error")).toBe(true);
  });
});

describe("parseExecutionBindingFile", () => {
  it("returns no binding and no issues when the export is absent", () => {
    const parsed = parseExecutionBindingFile(
      `describe("plain e2e file", () => {});`,
      "packages/cli-e2e/src/example.e2e.test.ts",
    );
    expect(parsed.binding).toBeUndefined();
    expect(parsed.issues).toEqual([]);
  });

  it("extracts a complete binding", () => {
    const parsed = parseExecutionBindingFile(
      `export const executionBinding = defineExecutionBinding({
        requirements: ["cli/install/realizes-direct-intent"],
        boundary: "process",
        rationale: "Exercises the real CLI process, filesystem, and exit codes.",
      });`,
      "packages/cli-e2e/src/root-install.e2e.test.ts",
    );
    expect(parsed.issues).toEqual([]);
    expect(parsed.binding).toMatchObject({ boundary: "process" });
  });

  it("requires a boundary-specific rationale", () => {
    const parsed = parseExecutionBindingFile(
      `export const executionBinding = defineExecutionBinding({
        requirements: ["cli/install/realizes-direct-intent"],
        boundary: "process",
        rationale: "",
      });`,
      "packages/cli-e2e/src/root-install.e2e.test.ts",
    );
    expect(parsed.issues.some((issue) => issue.message.includes("rationale"))).toBe(true);
  });
});

describe("collectCatalog", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "axm-spec-catalog-"));
    fs.mkdirSync(path.join(repoRoot, "specifications", "cli", "install"), { recursive: true });
    fs.writeFileSync(
      path.join(repoRoot, "specifications", "product-goals.ts"),
      `export const productGoals = defineProductGoals({
        "extension-adoption": { outcome: "Extensions install." },
        "retired-outcome": { outcome: "No longer wanted.", status: "retired" },
        "unreferenced-outcome": { outcome: "Nothing references this." },
      });`,
    );
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  const writeSpec = (relativePath: string, requirement: string, goal: string): void => {
    const target = path.join(repoRoot, "specifications", relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      `export const specification = defineSpecification({
        requirement: "${requirement}",
        title: "Install realizes directly desired extensions",
        class: "functional",
        role: "experience",
        goals: ["${goal}"],
      });`,
    );
  };

  it("flags duplicate requirement identities", () => {
    writeSpec("cli/install/a.spec.ts", "cli/install/same", "extension-adoption");
    writeSpec("cli/install/b.spec.ts", "cli/install/same", "extension-adoption");
    const catalog = collectCatalog({ repoRoot, executionBindingRoots: [] });
    expect(
      catalog.issues.some(
        (issue) => issue.severity === "error" && issue.message.includes("duplicate requirement"),
      ),
    ).toBe(true);
  });

  it("flags unregistered and retired product goals, and unreferenced active goals", () => {
    writeSpec("cli/install/a.spec.ts", "cli/install/a", "missing-goal");
    writeSpec("cli/install/b.spec.ts", "cli/install/b", "retired-outcome");
    const catalog = collectCatalog({ repoRoot, executionBindingRoots: [] });
    expect(
      catalog.issues.some((issue) => issue.message.includes("unregistered product goal")),
    ).toBe(true);
    expect(catalog.issues.some((issue) => issue.message.includes("retired product goal"))).toBe(
      true,
    );
    expect(
      catalog.issues.some((issue) => issue.message.includes("no referencing specification")),
    ).toBe(true);
  });

  it("warns when a requirement identity does not match its directory", () => {
    writeSpec("cli/install/a.spec.ts", "cli/uninstall/a", "extension-adoption");
    const catalog = collectCatalog({ repoRoot, executionBindingRoots: [] });
    expect(
      catalog.issues.some(
        (issue) => issue.severity === "warning" && issue.message.includes("does not match"),
      ),
    ).toBe(true);
  });

  it("renders a product-shaped catalog listing every specification", () => {
    writeSpec("cli/install/a.spec.ts", "cli/install/a", "extension-adoption");
    const catalog = collectCatalog({ repoRoot, executionBindingRoots: [] });
    const markdown = renderCatalogMarkdown(catalog);
    expect(markdown).toContain("## Product behavior");
    expect(markdown).toContain("### CLI");
    expect(markdown).toContain("#### Install");
    expect(markdown).toContain("`cli/install/a`");
    expect(markdown).toContain("## Product goals");
  });

  it("renders bound evidence beside its owning requirement", () => {
    const target = path.join(repoRoot, "specifications", "cli", "install", "a.spec.ts");
    fs.writeFileSync(
      target,
      `export const specification = defineSpecification({
        requirement: "cli/install/a",
        title: "Install realizes directly desired extensions",
        class: "functional",
        role: "experience",
        goals: ["extension-adoption"],
      });
export const boundEvidence = defineBoundEvidence([
  { gate: "lint: example-gate", verifies: "Rejects the violation on every change." },
]);`,
    );
    const catalog = collectCatalog({ repoRoot, executionBindingRoots: [] });
    const markdown = renderCatalogMarkdown(catalog);
    expect(markdown).toContain(
      "- Bound evidence: `lint: example-gate` — Rejects the violation on every change.",
    );
  });
});
