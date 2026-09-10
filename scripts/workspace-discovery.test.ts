import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { withoutLocalGitEnvironment } from "@agentxm/client-e2e-utils";

import {
  discoverExecutionBindings,
  discoverSpecifications,
  gitRefWorkspace,
  isSanctionedSpecificationOwner,
  makeWorkspace,
  productionProjects,
  readWorkspace,
  runtimeOutputs,
  workspaceFromProjectFiles,
} from "./workspace-discovery.js";

const roots: string[] = [];

const fixture = (files: Readonly<Record<string, string>>): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-discovery-"));
  roots.push(root);
  for (const [relative, content] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, content);
  }
  return root;
};

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const project = (name: string, tags: readonly string[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ name, tags, ...extra });

const specification = (requirement: string, body = 'describe("x", () => {});'): string => `
export const specification = defineSpecification({
  requirement: "${requirement}",
  title: "Title",
  statement: "AXM shall do the thing.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});
${body}
`;

describe("ownership from project files", () => {
  it("owns each file by the nearest project root and infers domain from placement", () => {
    const root = fixture({
      "project.json": project("axm", ["role:tooling"], { sourceRoot: "scripts" }),
      "scripts/tool.ts": "",
      "packages/core/model/project.json": project("model", ["role:contract"]),
      "packages/core/model/src/index.ts": "",
      "packages/supporting/client/project.json": project("client", ["role:integration"]),
      "packages/supporting/client/src/index.ts": "",
      "apps/cli/project.json": project("cli", ["role:application"]),
      "apps/cli/src/main.ts": "",
      "apps/cli-e2e/project.json": project("cli-e2e", ["role:e2e"]),
      "apps/cli-e2e/src/install.e2e.test.ts": "",
      "tools/support/project.json": project("support", ["role:tooling"]),
      "tools/support/src/index.ts": "",
      "docs/index.md": "",
    });
    const workspace = workspaceFromProjectFiles(root);
    expect(workspace.projects.map((entry) => entry.name)).toEqual([
      "axm",
      "cli",
      "cli-e2e",
      "model",
      "client",
      "support",
    ]);
    expect(workspace.ownerOf("packages/core/model/src/index.ts")?.name).toBe("model");
    expect(workspace.ownerOf("docs/index.md")?.name).toBe("axm");
    expect(workspace.ownerOf("packages/core/model/project.json")?.name).toBe("model");
    expect(workspace.filesOf("model")).toEqual([
      "packages/core/model/project.json",
      "packages/core/model/src/index.ts",
    ]);
    expect(workspace.projects.find((entry) => entry.name === "model")?.tags).toEqual([
      "role:contract",
      "domain:core",
    ]);
    expect(workspace.projects.find((entry) => entry.name === "client")?.tags).toContain(
      "domain:supporting",
    );
    expect(workspace.projects.find((entry) => entry.name === "cli")?.tags).toEqual([
      "role:application",
    ]);
    expect(workspace.projects.find((entry) => entry.name === "axm")?.sourceRoot).toBe("scripts");
    expect(workspace.projects.find((entry) => entry.name === "model")?.sourceRoot).toBe(
      "packages/core/model/src",
    );
    expect(productionProjects(workspace).map((entry) => entry.name)).toEqual([
      "cli",
      "model",
      "client",
    ]);
    expect(() => workspace.filesOf("missing")).toThrow(/Unknown project missing/u);
  });
});

describe("discoverSpecifications", () => {
  it("finds every owned specification and rejects unsanctioned owners, misplacement, and duplicates", () => {
    const root = fixture({
      "project.json": project("axm", ["role:tooling"], { sourceRoot: "scripts" }),
      "packages/core/model/project.json": project("model", ["role:contract"]),
      "packages/core/model/src/area/rule.spec.ts": specification("model/area/rule"),
      "packages/core/model/src/__fixtures__/sample.spec.ts": "not a specification",
      "packages/core/model/specifications/legacy.spec.ts": specification("model/legacy"),
      "packages/core/model/docs/misplaced.spec.ts": specification("model/misplaced"),
      "apps/cli-e2e/project.json": project("cli-e2e", ["role:e2e"]),
      "apps/cli-e2e/src/process.spec.ts": specification("cli/process/boundary"),
      "tools/support/project.json": project("support", ["role:tooling"]),
      "tools/support/src/tooling.spec.ts": specification("tooling/rule"),
      "specifications/project.json": project(
        "specifications",
        ["type:specification", "role:tooling"],
        { sourceRoot: "specifications" },
      ),
      "specifications/cli/central.spec.ts": specification("cli/central"),
      "specifications/cli/duplicate.spec.ts": specification("model/area/rule"),
      "scripts/root.spec.ts": specification("scripts/root"),
    });
    const workspace = workspaceFromProjectFiles(root);
    const discovered = discoverSpecifications(workspace);
    expect(
      discovered.specifications.map((entry) => [
        entry.specification.metadata.requirement,
        entry.specification.owner,
        entry.specification.source,
      ]),
    ).toEqual([
      ["cli/process/boundary", "cli-e2e", "apps/cli-e2e/src/process.spec.ts"],
      ["model/legacy", "model", "packages/core/model/specifications/legacy.spec.ts"],
      ["model/area/rule", "model", "packages/core/model/src/area/rule.spec.ts"],
      ["cli/central", "specifications", "specifications/cli/central.spec.ts"],
    ]);
    const messages = discovered.issues.map((issue) => `${issue.source}: ${issue.message}`);
    expect(messages).toEqual([
      expect.stringContaining(
        "packages/core/model/docs/misplaced.spec.ts: specification lives outside",
      ),
      expect.stringContaining(
        "scripts/root.spec.ts: owner project `axm` (role:tooling) may not own",
      ),
      expect.stringContaining(
        "specifications/cli/duplicate.spec.ts: duplicate requirement identity `model/area/rule` (also declared in packages/core/model/src/area/rule.spec.ts)",
      ),
      expect.stringContaining("tools/support/src/tooling.spec.ts: owner project `support`"),
    ]);
    expect(discovered.issues.every((issue) => issue.severity === "error")).toBe(true);
  });

  it("reports a specification that fails static parsing without dropping the rest", () => {
    const root = fixture({
      "packages/core/model/project.json": project("model", ["role:contract"]),
      "packages/core/model/src/good.spec.ts": specification("model/good"),
      "packages/core/model/src/bad.spec.ts": "export const other = 1;",
    });
    const discovered = discoverSpecifications(workspaceFromProjectFiles(root));
    expect(
      discovered.specifications.map((entry) => entry.specification.metadata.requirement),
    ).toEqual(["model/good"]);
    expect(discovered.issues).toEqual([
      expect.objectContaining({
        source: "packages/core/model/src/bad.spec.ts",
        message: "specification file must export a `specification` constant",
      }),
    ]);
  });

  it("derives digests for identity, examples, and body from the source", () => {
    const root = fixture({
      "packages/core/model/project.json": project("model", ["role:contract"]),
      "packages/core/model/src/rule.spec.ts": specification(
        "model/rule",
        'describe("Rule", () => { it("holds", () => {}); });',
      ),
    });
    const [entry] = discoverSpecifications(workspaceFromProjectFiles(root)).specifications;
    expect(entry?.contentDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(entry?.examplesDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(entry?.bodyDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect(new Set([entry?.contentDigest, entry?.examplesDigest, entry?.bodyDigest]).size).toBe(3);
  });

  it("sanctions production, application, end-to-end, and the central catalog project only", () => {
    const owner = (tags: readonly string[]) => ({
      name: "p",
      root: "x",
      sourceRoot: "x/src",
      tags,
      targets: {},
    });
    expect(isSanctionedSpecificationOwner(owner(["domain:core", "role:capability"]))).toBe(true);
    expect(isSanctionedSpecificationOwner(owner(["role:application"]))).toBe(true);
    expect(isSanctionedSpecificationOwner(owner(["role:e2e"]))).toBe(true);
    expect(isSanctionedSpecificationOwner(owner(["type:specification", "role:tooling"]))).toBe(
      true,
    );
    expect(isSanctionedSpecificationOwner(owner(["role:tooling"]))).toBe(false);
    expect(isSanctionedSpecificationOwner(owner([]))).toBe(false);
  });
});

describe("discoverExecutionBindings", () => {
  it("reads bindings only from end-to-end projects", () => {
    const binding = `export const executionBinding = defineExecutionBinding({
      requirements: ["cli/install/realizes-direct-intent"],
      boundary: "process",
      rationale: "Observes the real process.",
    });`;
    const root = fixture({
      "apps/cli-e2e/project.json": project("cli-e2e", ["role:e2e"]),
      "apps/cli-e2e/src/install.e2e.test.ts": binding,
      "apps/cli-e2e/src/plain.e2e.test.ts": "describe('plain', () => {});",
      "packages/core/model/project.json": project("model", ["role:contract"]),
      "packages/core/model/src/not-e2e.test.ts": binding,
    });
    const discovered = discoverExecutionBindings(workspaceFromProjectFiles(root));
    expect(discovered.issues).toEqual([]);
    expect(discovered.bindings.map((entry) => entry.source)).toEqual([
      "apps/cli-e2e/src/install.e2e.test.ts",
    ]);
  });
});

describe("runtimeOutputs", () => {
  it("resolves build and compile outputs exactly as Nx interpolates them", () => {
    const workspace = makeWorkspace({
      describe: "fixture",
      root: "/repo",
      files: [],
      read: () => "",
      projects: [
        {
          name: "cli",
          root: "apps/cli",
          sourceRoot: "apps/cli/src",
          tags: [],
          targets: {
            build: { outputs: ["{projectRoot}/dist"] },
            "compile-host": { outputs: ["{projectRoot}/dist/host-bin"] },
            generate: { outputs: ["{projectRoot}/README.md"] },
          },
        },
        {
          name: "model",
          root: "packages/core/model",
          sourceRoot: "packages/core/model/src",
          tags: [],
          targets: { build: { outputs: ["{workspaceRoot}/packages/core/model/dist"] } },
        },
        {
          name: "support",
          root: "tools/support",
          sourceRoot: "tools/support/src",
          tags: [],
          targets: {},
        },
      ],
    });
    expect(runtimeOutputs(workspace)).toEqual([
      "apps/cli/dist",
      "apps/cli/dist/host-bin",
      "packages/core/model/dist",
    ]);
  });
});

describe("gitRefWorkspace", () => {
  it("owns files by the nearest project.json in the committed tree", () => {
    const root = fixture({
      "project.json": project("axm", ["role:tooling"], { sourceRoot: "scripts" }),
      "specifications/project.json": project("specifications", ["type:specification"], {
        sourceRoot: "specifications",
      }),
      "specifications/cli/rule.spec.ts": specification("cli/rule"),
      "packages/core/model/project.json": project("model", ["role:contract"]),
      "packages/core/model/src/rule.spec.ts": specification("model/rule"),
    });
    const env = withoutLocalGitEnvironment(process.env);
    const git = (...args: string[]): string =>
      execFileSync("git", args, { cwd: root, env, encoding: "utf8" }).trim();
    git("init", "-q");
    git("add", ".");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-qm",
      "fixture",
    );
    const revision = git("rev-parse", "HEAD");
    fs.rmSync(path.join(root, "specifications"), { recursive: true });
    const workspace = gitRefWorkspace(revision, root);
    expect(workspace.describe).toBe(revision);
    expect(workspace.ownerOf("specifications/cli/rule.spec.ts")?.name).toBe("specifications");
    expect(workspace.projects.find((entry) => entry.name === "model")?.tags).toEqual([
      "role:contract",
      "domain:core",
    ]);
    expect(
      discoverSpecifications(workspace).specifications.map((entry) => [
        entry.specification.metadata.requirement,
        entry.specification.owner,
      ]),
    ).toEqual([
      ["model/rule", "model"],
      ["cli/rule", "specifications"],
    ]);
  });
});

describe("the live workspace", () => {
  it("owns every tracked specification through the project graph with no discovery issues", async () => {
    const workspace = await readWorkspace();
    expect(workspace.projects.find((entry) => entry.name === "axm")?.sourceRoot).toBe("scripts");
    const discovered = discoverSpecifications(workspace);
    expect(discovered.issues).toEqual([]);
    expect(discovered.specifications.length).toBeGreaterThan(0);
    for (const entry of discovered.specifications) {
      expect(workspace.ownerOf(entry.specification.source)?.name).toBe(entry.specification.owner);
    }
    expect(runtimeOutputs(workspace)).toContain("apps/cli/dist/src");
  });
});
