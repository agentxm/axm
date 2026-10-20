import { describe, expect, it } from "vitest";
import type { ProjectGraph, ProjectGraphProjectNode } from "@nx/devkit";
import { resolveEvidenceRuntimeOutputs } from "./specification-evidence-task.js";

const project = (
  name: string,
  targets: NonNullable<ProjectGraphProjectNode["data"]["targets"]>,
): ProjectGraphProjectNode => ({
  name,
  type: "lib",
  data: { root: `packages/${name}`, targets },
});

const graph: ProjectGraph = {
  nodes: {
    policy: project("policy", {
      test: {
        executor: "nx:noop",
        dependsOn: ["^build", "reporter:build"],
        outputs: ["{workspaceRoot}/test-results/policy"],
        configurations: { production: {} },
      },
    }),
    model: project("model", {
      build: {
        executor: "nx:noop",
        outputs: ["{options.outputPath}"],
        options: { outputPath: "packages/model/dist" },
        configurations: { production: { outputPath: "packages/model/dist-production" } },
      },
    }),
    reporter: project("reporter", {
      build: { executor: "nx:noop", outputs: ["{projectRoot}/dist"] },
    }),
    cli: project("cli", {
      build: { executor: "nx:noop", dependsOn: ["^build"], outputs: ["{projectRoot}/dist/src"] },
      "compile-host": {
        executor: "nx:noop",
        dependsOn: ["build"],
        outputs: ["{projectRoot}/dist/host-bin"],
      },
      compile: { executor: "nx:noop", dependsOn: ["build"], outputs: ["{projectRoot}/dist/bin"] },
    }),
    process: project("process", {
      e2e: {
        executor: "nx:noop",
        dependsOn: ["cli:compile-host"],
        outputs: ["{workspaceRoot}/test-results/process"],
      },
      binary: { executor: "nx:noop", dependsOn: ["cli:compile"] },
      artifact: { executor: "nx:noop" },
    }),
  },
  dependencies: {
    policy: [{ source: "policy", target: "model", type: "static" }],
    cli: [{ source: "cli", target: "model", type: "static" }],
    model: [],
    reporter: [],
    process: [],
  },
};

describe("Nx execution runtime inputs", () => {
  it("uses resolved dependency outputs and excludes unrelated builds and its own receipts", () => {
    expect(resolveEvidenceRuntimeOutputs(graph, { project: "policy", target: "test" })).toEqual([
      "packages/model/dist",
      "packages/reporter/dist",
    ]);
  });

  it("distinguishes the host binary target from distribution compilation", () => {
    expect(resolveEvidenceRuntimeOutputs(graph, { project: "process", target: "e2e" })).toEqual([
      "packages/cli/dist/host-bin",
      "packages/cli/dist/src",
      "packages/model/dist",
    ]);
    expect(resolveEvidenceRuntimeOutputs(graph, { project: "process", target: "binary" })).toEqual([
      "packages/cli/dist/bin",
      "packages/cli/dist/src",
      "packages/model/dist",
    ]);
  });

  it("lets Nx resolve the requested configuration through prerequisites", () => {
    expect(
      resolveEvidenceRuntimeOutputs(graph, {
        project: "policy",
        target: "test",
        configuration: "production",
      }),
    ).toEqual(["packages/model/dist-production", "packages/reporter/dist"]);
  });

  it("distinguishes a target with no producers from an unknown execution", () => {
    expect(
      resolveEvidenceRuntimeOutputs(graph, { project: "process", target: "artifact" }),
    ).toEqual([]);
    expect(
      resolveEvidenceRuntimeOutputs(graph, { project: "missing", target: "test" }),
    ).toBeUndefined();
    expect(
      resolveEvidenceRuntimeOutputs(graph, { project: "policy", target: "missing" }),
    ).toBeUndefined();
    expect(
      resolveEvidenceRuntimeOutputs(graph, {
        project: "policy",
        target: "test",
        configuration: "missing",
      }),
    ).toBeUndefined();
  });
});
