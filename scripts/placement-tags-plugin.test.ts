import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { AggregateCreateNodesError } from "nx/src/devkit-exports";
import type { CreateNodesContextV2 } from "nx/src/devkit-exports";
import { afterEach, describe, expect, it } from "vitest";

import { createNodesV2, inferDomainTag, placementTags } from "./placement-tags-plugin.js";

const tempRoots: string[] = [];

const workspaceFixture = (projects: Readonly<Record<string, ReadonlyArray<string>>>): string => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "axm-placement-"));
  tempRoots.push(workspaceRoot);
  for (const [projectRoot, tags] of Object.entries(projects)) {
    const projectFile = path.join(workspaceRoot, projectRoot, "project.json");
    fs.mkdirSync(path.dirname(projectFile), { recursive: true });
    fs.writeFileSync(
      projectFile,
      JSON.stringify({ name: path.basename(projectRoot), tags }, undefined, 2),
    );
  }
  return workspaceRoot;
};

const createNodes = (workspaceRoot: string, configFiles: ReadonlyArray<string>) => {
  const context: CreateNodesContextV2 = { nxJsonConfiguration: {}, workspaceRoot };
  return Promise.resolve(createNodesV2[1]([...configFiles], undefined, context));
};

afterEach(() => {
  for (const tempRoot of tempRoots.splice(0)) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

describe("placement inference", () => {
  it("infers the domain from the tier directory and nothing for apps and tools", () => {
    expect(inferDomainTag("packages/core/extension-model")).toBe("domain:core");
    expect(inferDomainTag("packages/supporting/registry-client")).toBe("domain:supporting");
    expect(inferDomainTag("packages/generic/text-utils")).toBe("domain:generic");
    expect(inferDomainTag("apps/cli")).toBeUndefined();
    expect(inferDomainTag("tools/test-support")).toBeUndefined();
  });

  it("rejects a packages/* project outside a tier and nested placements", () => {
    expect(() => inferDomainTag("packages/extension-model")).toThrow(/Unclassified placement/u);
    expect(() => inferDomainTag("packages/core")).toThrow(/Unclassified placement/u);
    expect(() => inferDomainTag("packages/core/a/b")).toThrow(/Unclassified placement/u);
    expect(() => inferDomainTag("apps/cli/nested")).toThrow(/Unclassified placement/u);
    expect(() => inferDomainTag("libs/anything")).toThrow(/Unclassified placement/u);
  });

  it("rejects an authored domain tag, conflicting or not", () => {
    expect(placementTags("packages/core/extension-model", ["type:lib", "role:contract"])).toEqual([
      "domain:core",
    ]);
    expect(() =>
      placementTags("packages/core/extension-model", ["type:lib", "domain:supporting"]),
    ).toThrow(/authors domain:supporting; domain:\* is inferred from placement \(domain:core\)/u);
    expect(() => placementTags("apps/cli", ["type:app", "domain:core"])).toThrow(
      /authors domain:core; domain:\* is inferred from placement and must not be authored/u,
    );
  });
});

describe("placement tags plugin", () => {
  it("contributes domain tags for tiered packages only", async () => {
    const workspaceRoot = workspaceFixture({
      "apps/cli": ["type:app", "role:application"],
      "packages/core/extension-model": ["type:lib", "role:contract"],
      "packages/supporting/registry-client": ["type:lib", "role:integration"],
      "tools/test-support": ["type:lib", "role:tooling"],
    });
    const results = await createNodes(workspaceRoot, [
      "apps/cli/project.json",
      "packages/core/extension-model/project.json",
      "packages/supporting/registry-client/project.json",
      "tools/test-support/project.json",
    ]);
    expect(results).toEqual([
      ["apps/cli/project.json", { projects: { "apps/cli": { tags: [] } } }],
      [
        "packages/core/extension-model/project.json",
        { projects: { "packages/core/extension-model": { tags: ["domain:core"] } } },
      ],
      [
        "packages/supporting/registry-client/project.json",
        { projects: { "packages/supporting/registry-client": { tags: ["domain:supporting"] } } },
      ],
      ["tools/test-support/project.json", { projects: { "tools/test-support": { tags: [] } } }],
    ]);
  });

  it("fails graph construction for a packages/* project outside a tier", async () => {
    const workspaceRoot = workspaceFixture({
      "packages/core/extension-model": ["type:lib", "role:contract"],
      "packages/misplaced": ["type:lib", "role:feature"],
    });
    const failure = await createNodes(workspaceRoot, [
      "packages/core/extension-model/project.json",
      "packages/misplaced/project.json",
    ]).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(AggregateCreateNodesError);
    if (!(failure instanceof AggregateCreateNodesError)) throw new Error("unreachable");
    expect(failure.errors.map(([file, error]) => [file, error.message])).toEqual([
      [
        "packages/misplaced/project.json",
        "Unclassified placement: packages/misplaced must live under packages/{core,supporting,generic}/<name>.",
      ],
    ]);
    expect(failure.partialResults.map(([file]) => file)).toEqual([
      "packages/core/extension-model/project.json",
    ]);
  });

  it("fails graph construction for an authored domain tag that conflicts with placement", async () => {
    const workspaceRoot = workspaceFixture({
      "packages/core/extension-model": ["type:lib", "role:contract", "domain:supporting"],
    });
    const failure = await createNodes(workspaceRoot, [
      "packages/core/extension-model/project.json",
    ]).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(AggregateCreateNodesError);
    if (!(failure instanceof AggregateCreateNodesError)) throw new Error("unreachable");
    expect(failure.errors.map(([file, error]) => [file, error.message])).toEqual([
      [
        "packages/core/extension-model/project.json",
        "packages/core/extension-model/project.json authors domain:supporting; domain:* is inferred from placement (domain:core) and must not be authored.",
      ],
    ]);
  });
});
