import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { classifyCiChanges, selectCodeVerificationPaths } from "./classify-ci-changes.js";

const repoRoot = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

/**
 * Project roots by placement convention: the workspace root plus `apps/<name>`,
 * `packages/<domain>/<name>` and `tools/<name>`. Paths are workspace-relative,
 * matching what `git diff --name-only` reports to the classifier.
 */
const projectRoots = (): readonly string[] => {
  const children = (parent: string) =>
    fs.existsSync(path.join(repoRoot, parent))
      ? fs
          .readdirSync(path.join(repoRoot, parent), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => `${parent}/${entry.name}`)
      : [];

  const tiers = children("packages");
  return ["", ...children("apps"), ...children("tools"), ...tiers.flatMap(children)].filter(
    (projectRoot) => fs.existsSync(path.join(repoRoot, projectRoot, "project.json")),
  );
};

/** Every `generate*` target input and output declared by one project manifest. */
const declaredGenerationPaths = (projectRoot: string): readonly string[] => {
  const manifest: unknown = JSON.parse(
    fs.readFileSync(path.join(repoRoot, projectRoot, "project.json"), "utf8"),
  );
  if (typeof manifest !== "object" || manifest === null || !("targets" in manifest)) return [];
  const { targets } = manifest;
  if (typeof targets !== "object" || targets === null) return [];

  return Object.entries(targets)
    .filter(([name]) => name.startsWith("generate"))
    .flatMap(([, target]) => {
      if (typeof target !== "object" || target === null) return [];
      return ["inputs" in target ? target.inputs : [], "outputs" in target ? target.outputs : []]
        .flatMap((entry) => (Array.isArray(entry) ? entry : []))
        .filter((entry): entry is string => typeof entry === "string");
    })
    .map((entry) =>
      entry
        .replace("{workspaceRoot}/", "")
        .replace("{projectRoot}/", projectRoot === "" ? "" : `${projectRoot}/`)
        .replace("**/*", "SKILL.md")
        .replace("*.md", "sample.md"),
    );
};

describe("classifyCiChanges", () => {
  it("always requires formatting", () => {
    expect(classifyCiChanges([]).formatRequired).toBe(true);
  });

  it("classifies documentation without code work", () => {
    expect(classifyCiChanges(["contributing/guides/setup.md", "CONTRIBUTING.md"])).toMatchObject({
      code: false,
      documentation: true,
      workflow: false,
    });
  });

  it.each([
    ["packages/core/workspace-state/src/index.ts"],
    ["packages/core/extension-lifecycle/src/update/selector.spec.ts"],
    ["packages/core/cli-update/src/index.ts"],
    ["packages/supporting/registry-auth/src/selected-registry.ts"],
    ["tools/specification-metadata/src/contract.ts"],
    ["apps/cli-e2e/src/install.e2e.test.ts"],
    ["specifications/product-goals.ts"],
    ["specifications/disposition-ledger.json"],
  ])("requires code verification for %s", (changed) => {
    expect(classifyCiChanges([changed])).toMatchObject({ code: true });
  });

  it("treats markdown a project claims as build input as code", () => {
    // `pnpm run generate:check` runs only in the affected-verification lane, so
    // a generated document reaching the markdown-only lane would let a stale
    // `__generated__` artifact merge unnoticed.
    expect(classifyCiChanges(["skills/axm/src/SKILL.md"])).toMatchObject({
      code: true,
      documentation: true,
    });
    expect(classifyCiChanges(["packages/core/workspace-state/README.md"])).toMatchObject({
      code: true,
    });
  });

  it("treats every markdown a project declares for generation as code", () => {
    // Derived from the manifests rather than restated, so a new markdown
    // generation input outside the classifier's source prefixes fails here
    // instead of silently routing to the markdown-only lane.
    const declared = projectRoots().flatMap((projectRoot) =>
      declaredGenerationPaths(projectRoot).filter((entry) => entry.endsWith(".md")),
    );

    expect(declared).toContain("skills/axm/src/SKILL.md");
    expect(declared).toContain("README.md");
    expect(declared).toContain("specifications/catalog.md");
    for (const entry of declared) {
      expect({ entry, ...classifyCiChanges([entry]) }).toMatchObject({ entry, code: true });
    }
  });

  it("classifies workflow-only changes without compiling code", () => {
    expect(classifyCiChanges([".github/workflows/ci.yml"])).toMatchObject({
      code: false,
      workflow: true,
    });
  });

  it("uses changed code paths as the verification signal", () => {
    expect(classifyCiChanges(["apps/cli/src/main.ts"])).toMatchObject({
      code: true,
    });
  });

  it("runs code verification for release and infrastructure inputs", () => {
    expect(
      classifyCiChanges(["scripts/reconcile-github-release.ts", "infra/example.ts"]),
    ).toMatchObject({
      code: true,
      releaseInfrastructure: true,
    });
  });

  it("selects only paths that require code verification", () => {
    expect(
      selectCodeVerificationPaths([
        "contributing/guides/setup.md",
        ".github/workflows/ci.yml",
        "apps/cli/src/main.ts",
      ]),
    ).toEqual(["apps/cli/src/main.ts"]);
  });
});
