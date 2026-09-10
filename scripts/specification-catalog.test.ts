import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  collectCatalog,
  parseExecutionBindingFile,
  parseProductGoalRegistry,
  parseSpecificationFile,
  renderCatalogMarkdown,
} from "./specification-catalog-lib.js";

const metadataLiteral = (overrides = ""): string => `{
  requirement: "cli/install/realizes-direct-intent",
  title: "Install realizes directly desired extensions",
  statement: "When a person installs an extension directly, the workspace shall record that intent and realize it for every configured agent.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
  ${overrides}
}`;

const validSpecificationSource = `
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";

export const specification = defineSpecification(${metadataLiteral()});

describe("Install", () => {});
`;

describe("parseSpecificationFile", () => {
  it("extracts literal metadata from a defineSpecification export", () => {
    const parsed = parseSpecificationFile(
      validSpecificationSource,
      "specifications/cli/install/realizes-direct-intent.spec.ts",
    );
    expect(parsed.issues).toEqual([]);
    expect(parsed.specification?.metadata).toMatchObject({
      requirement: "cli/install/realizes-direct-intent",
      title: "Install realizes directly desired extensions",
      class: "functional",
      role: "experience",
      goals: ["extension-adoption"],
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
      `export const specification = defineSpecification({ requirement: "cli/install/" + name, title: "t" });`,
      "specifications/cli/install/computed.spec.ts",
    );
    expect(parsed.specification).toBeUndefined();
    expect(parsed.issues[0]?.message).toContain("literal-only");
  });

  it("rejects metadata that does not satisfy the shared contract", () => {
    for (const [label, overrides] of [
      ["identity", `requirement: "Install",`],
      ["role", `role: "technical",`],
      ["class", `class: "usability",`],
      ["boundary rationale", `boundary: "repository",`],
    ] as const) {
      const parsed = parseSpecificationFile(
        `export const specification = defineSpecification(${metadataLiteral(overrides)});`,
        "specifications/cli/install/a.spec.ts",
      );
      expect(parsed.specification, label).toBeUndefined();
      expect(parsed.issues[0]?.message, label).toContain("specification:");
    }
  });

  it("rejects an omitted lineage field instead of defaulting it", () => {
    const parsed = parseSpecificationFile(
      `export const specification = defineSpecification({ requirement: "cli/install/a", title: "t", statement: "s", class: "functional", role: "experience", goals: ["a"], methods: ["example"] });`,
      "specifications/cli/install/a.spec.ts",
    );
    expect(parsed.specification).toBeUndefined();
  });

  it("rejects duplicated case metadata", () => {
    const parsed = parseSpecificationFile(
      `export const specification = defineSpecification(${metadataLiteral(`cases: { duplicate: "native test name" },`)});`,
      "specifications/cli/install/a.spec.ts",
    );
    expect(parsed.specification).toBeUndefined();
    expect(parsed.issues[0]?.message).toContain("native test names");
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
  it("extracts the local registry", () => {
    const parsed = parseProductGoalRegistry(
      `export const productGoals = defineProductGoals({ "safe-repetition": { outcome: "Reruns are no-ops." } });`,
      "specifications/product-goals.ts",
    );
    expect(parsed.issues).toEqual([]);
    expect(parsed.registry).toEqual({ "safe-repetition": { outcome: "Reruns are no-ops." } });
  });

  it("rejects a product goal without an outcome", () => {
    const parsed = parseProductGoalRegistry(
      `export const productGoals = defineProductGoals({ "safe-repetition": { status: "active" } });`,
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
        "safe-repetition": { outcome: "Reruns are no-ops." },
        "retired-outcome": { outcome: "No longer wanted.", status: "retired" },
        "unreferenced-outcome": { outcome: "Nothing references this." },
      });`,
    );
  });

  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  const writeSpec = (relativePath: string, requirement: string, goal: string, extra = ""): void => {
    const target = path.join(repoRoot, "specifications", relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      `export const specification = defineSpecification(${metadataLiteral(
        `requirement: "${requirement}", goals: ["${goal}"], ${extra}`,
      )});`,
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

  it("resolves shared goals from the contract and local goals from the registry", () => {
    writeSpec("cli/install/a.spec.ts", "cli/install/a", "extension-adoption");
    writeSpec("cli/install/b.spec.ts", "cli/install/b", "safe-repetition");
    const catalog = collectCatalog({ repoRoot, executionBindingRoots: [] });
    expect(catalog.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(catalog.productGoals).toContainEqual(
      expect.objectContaining({ id: "extension-adoption", scope: "shared" }),
    );
    expect(catalog.productGoals).toContainEqual(
      expect.objectContaining({ id: "safe-repetition", scope: "local" }),
    );
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

  it("rejects a local registry that redefines a shared goal", () => {
    fs.writeFileSync(
      path.join(repoRoot, "specifications", "product-goals.ts"),
      `export const productGoals = defineProductGoals({ "extension-adoption": { outcome: "Redefined locally." } });`,
    );
    writeSpec("cli/install/a.spec.ts", "cli/install/a", "extension-adoption");
    const catalog = collectCatalog({ repoRoot, executionBindingRoots: [] });
    expect(catalog.issues.some((issue) => issue.message.includes("shared goal"))).toBe(true);
  });

  it("rejects a successor whose superseded predecessor is still present", () => {
    writeSpec("cli/install/a.spec.ts", "cli/install/a", "extension-adoption");
    writeSpec(
      "cli/install/b.spec.ts",
      "cli/install/b",
      "extension-adoption",
      `supersedes: ["cli/install/a"],`,
    );
    const catalog = collectCatalog({ repoRoot, executionBindingRoots: [] });
    expect(
      catalog.issues.some((issue) => issue.message.includes("still present in the corpus")),
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

  it("renders a product-shaped catalog listing every specification with its statement", () => {
    writeSpec(
      "cli/install/a.spec.ts",
      "cli/install/a",
      "extension-adoption",
      `derivedFrom: ["AXM-REQ-0001"], assumptions: "unknown", limitations: [{ limitation: "Does not observe the real registry.", retirementCondition: "A registry boundary execution binds evidence to this identity." }],`,
    );
    const catalog = collectCatalog({ repoRoot, executionBindingRoots: [] });
    const markdown = renderCatalogMarkdown(catalog);
    expect(markdown).toContain("## Product behavior");
    expect(markdown).toContain("### CLI");
    expect(markdown).toContain("#### Install");
    expect(markdown).toContain("`cli/install/a`");
    expect(markdown).not.toContain("- Status:");
    expect(markdown).toContain("- Statement: When a person installs an extension directly");
    expect(markdown).toContain("- Derived from: `AXM-REQ-0001`");
    expect(markdown).toContain("- Assumptions: unknown (not yet assessed)");
    expect(markdown).toContain("- Limitation: Does not observe the real registry.");
    expect(markdown).toContain("### Shared across AgentXM repositories");
    expect(markdown).toContain("### Local to AXM");
  });

  it("uses directory ancestry without turning specification filenames into groups", () => {
    writeSpec(
      "cli/preserves-unrelated-state.spec.ts",
      "cli/preserves-unrelated-state",
      "extension-adoption",
      `title: "Workspace changes preserve unrelated files",`,
    );
    writeSpec(
      "cli/skills/retains-intent.spec.ts",
      "cli/skills/retains-intent",
      "extension-adoption",
      `title: "Skill commands retain declared intent",`,
    );
    writeSpec(
      "cli/skills/install/realizes-content.spec.ts",
      "cli/skills/install/realizes-content",
      "extension-adoption",
      `title: "Skill installation realizes selected content",`,
    );
    writeSpec(
      "cli/skills/uninstall/removes-content.spec.ts",
      "cli/skills/uninstall/removes-content",
      "extension-adoption",
      `title: "Skill removal clears its acquired content",`,
    );
    writeSpec(
      "cli/knowledge/concepts/get/returns-content.spec.ts",
      "cli/knowledge/concepts/get/returns-content",
      "extension-adoption",
      `title: "Concept reads return canonical text",`,
    );
    writeSpec(
      "extension-identity/retains-type.spec.ts",
      "extension-identity/retains-type",
      "extension-adoption",
      `title: "Extension identities retain their type",`,
    );
    const catalog = collectCatalog({ repoRoot, executionBindingRoots: [] });
    const markdown = renderCatalogMarkdown(catalog);
    const headings = markdown.split("\n").filter((line) => /^#{2,6} /u.test(line));
    expect(headings).toEqual([
      "## Product behavior",
      "### CLI",
      "#### Workspace changes preserve unrelated files",
      "#### Knowledge",
      "##### Concepts",
      "###### Get",
      "#### Skills",
      "##### Skill commands retain declared intent",
      "##### Install",
      "###### Skill installation realizes selected content",
      "##### Uninstall",
      "###### Skill removal clears its acquired content",
      "### Extension identity",
      "#### Extension identities retain their type",
      "## Product goals",
      "### Shared across AgentXM repositories",
      "### Local to AXM",
    ]);
    expect(markdown).toContain(
      "**Concept reads return canonical text**\n\n- Requirement: `cli/knowledge/concepts/get/returns-content`",
    );
    expect(markdown).not.toMatch(/^#{7,} /mu);
    for (const entry of catalog.specifications) {
      expect(markdown.split(`- Requirement: \`${entry.metadata.requirement}\``)).toHaveLength(2);
      expect(markdown).toContain(`- Source: [\`${entry.source}\`](../${entry.source})`);
    }
  });

  it("keeps role sections, goal references and additional evidence attached to their owners", () => {
    writeSpec("cli/install/a.spec.ts", "cli/install/a", "extension-adoption");
    writeSpec(
      "cli/machine-result.spec.ts",
      "cli/machine-result",
      "extension-adoption",
      `title: "Machine output identifies the result", role: "interface",`,
    );
    writeSpec(
      "system/process/repetition.spec.ts",
      "system/process/repetition",
      "safe-repetition",
      `title: "Repository changes keep repeatable checks", role: "supporting",`,
    );
    const catalog = collectCatalog({ repoRoot, executionBindingRoots: [] });
    const markdown = renderCatalogMarkdown({
      ...catalog,
      executionBindings: [
        {
          requirements: ["cli/machine-result"],
          boundary: "process",
          source: "packages/cli-e2e/src/machine.e2e.test.ts",
          rationale: "Observes the emitted process result.",
        },
      ],
    });
    expect(markdown).toContain(
      "## Programmatic interfaces\n\n### CLI\n\n#### Machine output identifies the result",
    );
    expect(markdown).toContain(
      "## Supporting system behavior\n\n### System\n\n#### Process\n\n##### Repository changes keep repeatable checks",
    );
    expect(markdown).toContain("- Product goals: `extension-adoption`");
    expect(markdown).toContain("- Product goals: `safe-repetition`");
    expect(markdown).toContain("- `safe-repetition` — Reruns are no-ops.");
    expect(markdown).toContain(
      "- Additional evidence: process via [`packages/cli-e2e/src/machine.e2e.test.ts`](../packages/cli-e2e/src/machine.e2e.test.ts) — Observes the emitted process result.",
    );
    expect(markdown.indexOf("- Requirement: `cli/machine-result`")).toBeLessThan(
      markdown.indexOf("- Additional evidence: process"),
    );
    expect(markdown.indexOf("- Additional evidence: process")).toBeLessThan(
      markdown.indexOf("## Supporting system behavior"),
    );
  });

  it("links the structural inventories without presenting them as behavioral evidence", () => {
    writeSpec("cli/install/a.spec.ts", "cli/install/a", "extension-adoption");
    const catalog = collectCatalog({ repoRoot, executionBindingRoots: [] });
    const markdown = renderCatalogMarkdown(catalog);
    expect(markdown).toContain(
      "[Command and parameter inventory](support/command-behavior-allocation.json)",
    );
    expect(markdown).toContain("[Context inventory](support/context-allocation.json)");
    expect(markdown).toContain(
      "These maps support navigation and structural checks. They do not establish\nsemantic completeness, correct applicability, or passing behavior.",
    );
  });

  it("renders bound evidence beside its owning requirement", () => {
    const target = path.join(repoRoot, "specifications", "cli", "install", "a.spec.ts");
    fs.writeFileSync(
      target,
      `export const specification = defineSpecification(${metadataLiteral(
        `requirement: "cli/install/a",`,
      )});
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
