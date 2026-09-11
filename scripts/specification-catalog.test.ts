import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  collectCatalog,
  extractExampleSurface,
  normalizedBody,
  parseExecutionBindingFile,
  parseProductGoalRegistry,
  parseSpecificationFile,
  renderCatalogMarkdown,
  type CatalogSpecification,
} from "./specification-catalog-lib.js";
import { discoverSpecifications, workspaceFromProjectFiles } from "./workspace-discovery.js";

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
import { defineSpecification } from "@agentxm/specification-metadata";

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
      "apps/cli-e2e/src/example.e2e.test.ts",
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
      "apps/cli-e2e/src/root-install.e2e.test.ts",
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
      "apps/cli-e2e/src/root-install.e2e.test.ts",
    );
    expect(parsed.issues.some((issue) => issue.message.includes("rationale"))).toBe(true);
  });
});

describe("extractExampleSurface", () => {
  it("lists titles through modifier chains and each rows in source order", () => {
    const surface = extractExampleSurface(`
      describe("Install", () => {
        it("installs", () => {});
        it.effect("installs in effect", () => {});
        it.live("installs live", () => {});
        it.effect.prop("holds for every input", { a: arb }, () => {});
        it.each([{ label: "row one", value: 1 }, { value: 2, kind: "row two" }, ["row three", 3], "row four"])(
          "accepts $label",
          () => {},
        );
        it.effect.each([{ value: "x" }] as const)("refuses $value", () => {});
        test(\`template \${name}\`, () => {});
      });
    `);
    expect(surface).toEqual([
      "describe:Install",
      "it:installs",
      "it.effect:installs in effect",
      "it.live:installs live",
      "it.effect.prop:holds for every input",
      "it.each[row]:row one",
      "it.each[row]:row two",
      "it.each[row]:row three",
      "it.each[row]:row four",
      "it.each:accepts $label",
      "it.effect.each[row]:x",
      "it.effect.each:refuses $value",
      "test:`template ${name}`",
    ]);
  });

  it("ignores assertions, helpers, and non-test calls", () => {
    expect(
      extractExampleSurface(`const helper = build("thing"); expect(helper).toBe("thing");`),
    ).toEqual([]);
  });
});

describe("normalizedBody", () => {
  it("is stable across comments and formatting but not across code", () => {
    const formatted = normalizedBody(
      `// leading comment\nconst   a = 1;   /* c */ it("x", () => {\n  expect(a).toBe(1);\n});\n`,
    );
    const compact = normalizedBody(`const a=1;it("x",()=>{expect(a).toBe(1)})`);
    expect(formatted).toBe(compact);
    expect(formatted).toBe('const a = 1;it("x",()=>{expect(a).toBe(1);});');
    expect(normalizedBody(`const a=2;it("x",()=>{expect(a).toBe(1)})`)).not.toBe(compact);
  });

  it("ignores import paths but not imported bindings", () => {
    const relative = normalizedBody(
      `import { decode } from "./version-constraints.js";\nimport { defineSpecification } from "@agentxm/specification-metadata";\nit("x", () => decode());`,
    );
    const packaged = normalizedBody(
      `import { decode } from "@agentxm/extension-model/unstable/version-constraints";\nimport { defineSpecification } from "@agentxm/extension-model/unstable/specifications";\nit("x", () => decode());`,
    );
    expect(relative).toBe(packaged);
    expect(relative).toContain('from "<module>"');
    expect(
      normalizedBody(
        `import { decodeStrict } from "./version-constraints.js";\nimport { defineSpecification } from "@agentxm/specification-metadata";\nit("x", () => decode());`,
      ),
    ).not.toBe(relative);
  });
});

describe("collectCatalog", () => {
  let repoRoot: string;

  const project = (name: string, tags: readonly string[]): string => JSON.stringify({ name, tags });

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "axm-spec-catalog-"));
    fs.mkdirSync(path.join(repoRoot, "specifications"), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, "packages", "core", "extension-lifecycle", "src"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(repoRoot, "packages", "core", "extension-lifecycle", "project.json"),
      project("extension-lifecycle", ["role:feature"]),
    );
    fs.mkdirSync(path.join(repoRoot, "packages", "core", "extension-model", "src"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(repoRoot, "packages", "core", "extension-model", "project.json"),
      project("extension-model", ["role:contract"]),
    );
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
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      `export const specification = defineSpecification(${metadataLiteral(
        `requirement: "${requirement}", goals: ["${goal}"], ${extra}`,
      )});`,
    );
  };

  const lifecycle = (name: string): string =>
    `packages/core/extension-lifecycle/src/install/${name}.spec.ts`;
  const model = (name: string): string => `packages/core/extension-model/src/${name}.spec.ts`;

  const collect = () => {
    const discovered = discoverSpecifications(workspaceFromProjectFiles(repoRoot));
    return collectCatalog({
      repoRoot,
      specifications: discovered.specifications.map((entry) => entry.specification),
      issues: discovered.issues,
    });
  };

  it("attributes each specification to its discovered owner", () => {
    writeSpec(lifecycle("a"), "cli/install/a", "extension-adoption");
    writeSpec(model("b"), "extension-identity/b", "extension-adoption");
    const catalog = collect();
    expect(catalog.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(
      catalog.specifications.map((entry) => [entry.metadata.requirement, entry.owner]),
    ).toEqual([
      ["cli/install/a", "extension-lifecycle"],
      ["extension-identity/b", "extension-model"],
    ]);
  });

  it("flags duplicate requirement identities across owners once", () => {
    writeSpec(lifecycle("a"), "cli/install/same", "extension-adoption");
    writeSpec(model("b"), "cli/install/same", "extension-adoption");
    const catalog = collect();
    expect(
      catalog.issues.filter(
        (issue) => issue.severity === "error" && issue.message.includes("duplicate requirement"),
      ),
    ).toHaveLength(1);
  });

  it("does not tie identity to the file's directory", () => {
    writeSpec(lifecycle("a"), "cli/uninstall/a", "extension-adoption");
    writeSpec(model("deep/nested/b"), "workspace/records/b", "extension-adoption");
    const catalog = collect();
    expect(catalog.issues.filter((issue) => issue.severity !== "warning")).toEqual([]);
    expect(catalog.issues.map((issue) => issue.message)).not.toContainEqual(
      expect.stringContaining("directory"),
    );
  });

  it("resolves shared goals from the contract and local goals from the registry", () => {
    writeSpec(lifecycle("a"), "cli/install/a", "extension-adoption");
    writeSpec(lifecycle("b"), "cli/install/b", "safe-repetition");
    const catalog = collect();
    expect(catalog.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(catalog.productGoals).toContainEqual(
      expect.objectContaining({ id: "extension-adoption", scope: "shared" }),
    );
    expect(catalog.productGoals).toContainEqual(
      expect.objectContaining({ id: "safe-repetition", scope: "local" }),
    );
  });

  it("flags unregistered and retired product goals, and unreferenced active goals", () => {
    writeSpec(lifecycle("a"), "cli/install/a", "missing-goal");
    writeSpec(lifecycle("b"), "cli/install/b", "retired-outcome");
    const catalog = collect();
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
    writeSpec(lifecycle("a"), "cli/install/a", "extension-adoption");
    const catalog = collect();
    expect(catalog.issues.some((issue) => issue.message.includes("shared goal"))).toBe(true);
  });

  it("rejects a successor whose superseded predecessor is still present", () => {
    writeSpec(lifecycle("a"), "cli/install/a", "extension-adoption");
    writeSpec(
      lifecycle("b"),
      "cli/install/b",
      "extension-adoption",
      `supersedes: ["cli/install/a"],`,
    );
    const catalog = collect();
    expect(
      catalog.issues.some((issue) => issue.message.includes("still present in the corpus")),
    ).toBe(true);
  });

  it("renders a product-shaped catalog listing every specification with its owner and statement", () => {
    writeSpec(
      lifecycle("a"),
      "cli/install/a",
      "extension-adoption",
      `derivedFrom: ["AXM-REQ-0001"], assumptions: "unknown", limitations: [{ limitation: "Does not observe the real registry.", retirementCondition: "A registry boundary execution binds evidence to this identity." }],`,
    );
    const catalog = collect();
    const markdown = renderCatalogMarkdown(catalog);
    expect(markdown).toContain("## Product behavior");
    expect(markdown).toContain("### Goal: extension-adoption");
    expect(markdown).toContain("#### Functional");
    expect(markdown).toContain("`cli/install/a`");
    expect(markdown).toContain("- Owner: `extension-lifecycle`");
    expect(markdown).not.toContain("- Status:");
    expect(markdown).toContain("- Statement: When a person installs an extension directly");
    expect(markdown).toContain("- Derived from: `AXM-REQ-0001`");
    expect(markdown).toContain("- Assumptions: unknown (not yet assessed)");
    expect(markdown).toContain("- Limitation: Does not observe the real registry.");
    expect(markdown).toContain(`- Source: [\`${lifecycle("a")}\`](../${lifecycle("a")})`);
    expect(markdown).toContain("### Shared across AgentXM repositories");
    expect(markdown).toContain("### Local to AXM");
    expect(markdown).not.toContain("directory headings");
  });

  it("organizes by role, primary goal, and class rather than by location", () => {
    writeSpec(
      lifecycle("a"),
      "cli/install/a",
      "extension-adoption",
      `title: "Install realizes intent",`,
    );
    writeSpec(
      model("b"),
      "extension-identity/b",
      "extension-adoption",
      `title: "Identities retain their type", class: "constraint",`,
    );
    writeSpec(
      lifecycle("c"),
      "cli/install/c",
      "safe-repetition",
      `title: "Reinstall is idempotent",`,
    );
    writeSpec(
      model("d"),
      "extension-identity/d",
      "extension-adoption",
      `title: "Machine output identifies the result", role: "interface",`,
    );
    const catalog = collect();
    const markdown = renderCatalogMarkdown(catalog);
    const headings = markdown.split("\n").filter((line) => /^#{2,6} /u.test(line));
    expect(headings).toEqual([
      "## Product behavior",
      "### Goal: extension-adoption",
      "#### Functional",
      "##### Install realizes intent",
      "#### Constraints",
      "##### Identities retain their type",
      "### Goal: safe-repetition",
      "#### Functional",
      "##### Reinstall is idempotent",
      "## Programmatic interfaces",
      "### Goal: extension-adoption",
      "#### Functional",
      "##### Machine output identifies the result",
      "## Product goals",
      "### Shared across AgentXM repositories",
      "### Local to AXM",
    ]);
    expect(markdown).toContain("### Goal: safe-repetition\n\nReruns are no-ops.\n");
    for (const entry of catalog.specifications) {
      expect(markdown.split(`- Requirement: \`${entry.metadata.requirement}\``)).toHaveLength(2);
      expect(markdown).toContain(`- Source: [\`${entry.source}\`](../${entry.source})`);
    }
  });

  it("keeps goal references and additional evidence attached to their owners", () => {
    writeSpec(lifecycle("a"), "cli/install/a", "extension-adoption");
    writeSpec(
      model("machine-result"),
      "cli/machine-result",
      "extension-adoption",
      `title: "Machine output identifies the result", role: "interface",`,
    );
    writeSpec(
      model("repetition"),
      "system/process/repetition",
      "safe-repetition",
      `title: "Repository changes keep repeatable checks", role: "supporting",`,
    );
    const catalog = collect();
    const markdown = renderCatalogMarkdown({
      ...catalog,
      executionBindings: [
        {
          requirements: ["cli/machine-result"],
          boundary: "process",
          source: "apps/cli-e2e/src/machine.e2e.test.ts",
          rationale: "Observes the emitted process result.",
        },
      ],
    });
    expect(markdown).toMatch(
      /## Programmatic interfaces\n\n### Goal: extension-adoption\n\n[^\n]+\n\n#### Functional\n\n##### Machine output identifies the result/u,
    );
    expect(markdown).toContain(
      "## Supporting system behavior\n\n### Goal: safe-repetition\n\nReruns are no-ops.\n\n#### Functional\n\n##### Repository changes keep repeatable checks",
    );
    expect(markdown).toContain("- Product goals: `extension-adoption`");
    expect(markdown).toContain("- Product goals: `safe-repetition`");
    expect(markdown).toContain("- `safe-repetition` — Reruns are no-ops.");
    expect(markdown).toContain(
      "- Additional evidence: process via [`apps/cli-e2e/src/machine.e2e.test.ts`](../apps/cli-e2e/src/machine.e2e.test.ts) — Observes the emitted process result.",
    );
    expect(markdown.indexOf("- Requirement: `cli/machine-result`")).toBeLessThan(
      markdown.indexOf("- Additional evidence: process"),
    );
    expect(markdown.indexOf("- Additional evidence: process")).toBeLessThan(
      markdown.indexOf("## Supporting system behavior"),
    );
  });

  it("links the structural inventories without presenting them as behavioral evidence", () => {
    writeSpec(lifecycle("a"), "cli/install/a", "extension-adoption");
    const markdown = renderCatalogMarkdown(collect());
    expect(markdown).toContain(
      "[Command and parameter inventory](support/command-behavior-allocation.json)",
    );
    expect(markdown).toContain("[Context inventory](support/context-allocation.json)");
    expect(markdown).toContain(
      "These maps support navigation and structural checks. They do not establish\nsemantic completeness, correct applicability, or passing behavior.",
    );
  });

  it("renders bound evidence beside its owning requirement", () => {
    const target = path.join(repoRoot, lifecycle("a"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      `export const specification = defineSpecification(${metadataLiteral(
        `requirement: "cli/install/a",`,
      )});
export const boundEvidence = defineBoundEvidence([
  { gate: "lint: example-gate", verifies: "Rejects the violation on every change." },
]);`,
    );
    const markdown = renderCatalogMarkdown(collect());
    expect(markdown).toContain(
      "- Bound evidence: `lint: example-gate` — Rejects the violation on every change.",
    );
  });

  it("renders without discovering when handed an already-owned corpus", () => {
    const specification: CatalogSpecification = {
      metadata: {
        requirement: "cli/install/a",
        title: "Install realizes intent",
        statement: "When a person installs, AXM shall realize the intent.",
        class: "functional",
        role: "experience",
        goals: ["extension-adoption"],
        methods: ["example"],
        derivedFrom: [],
        supersedes: [],
        assumptions: [],
        openQuestions: [],
      },
      boundEvidence: [],
      owner: "extension-lifecycle",
      source: lifecycle("a"),
    };
    const catalog = collectCatalog({ repoRoot, specifications: [specification] });
    expect(catalog.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(renderCatalogMarkdown(catalog)).toContain("- Owner: `extension-lifecycle`");
  });
});

/**
 * Source hygiene that survives the retirement of
 * `system/architecture/specification-folders-mirror-command-tree`
 * (see `specifications/disposition-ledger.json`): identity is no longer tied
 * to path and specifications colocate beside their owners, but discovery
 * still walks the working tree, so a symbolic link must not be able to hide a
 * specification from it or present one twice.
 */
describe("specification discovery hygiene", () => {
  const workspaceRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

  it("no tracked symbolic link stands in for authored source", () => {
    const symbolicLinks = execFileSync("git", ["ls-files", "-s"], {
      cwd: workspaceRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
      .split("\n")
      .filter((line) => line.startsWith("120000 "))
      .map((line) => line.split("\t")[1] ?? "")
      .filter(
        (file) =>
          file.startsWith("apps/") ||
          file.startsWith("packages/") ||
          file.startsWith("tools/") ||
          file.startsWith("scripts/") ||
          file.startsWith("specifications/"),
      );
    expect(symbolicLinks).toEqual([]);
  });
});
