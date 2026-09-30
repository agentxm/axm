import { describe, expect, it } from "vitest";
import { HashPlanner, transferProjectGraph } from "nx/src/native";
import type { ProjectGraph, TaskGraph } from "nx/src/native";

// Exercise the pinned native planner rather than maintaining a custom lockfile hasher.
describe("native dependency inputs", () => {
  it("includes imported and transitive packages without invalidating on unrelated dependencies", () => {
    const graph: ProjectGraph = {
      nodes: {
        probe: {
          root: "probe",
          targets: {
            build: {
              executor: "nx:run-commands",
              inputs: ["production", "^production", { externalDependencies: ["compiler"] }],
            },
          },
        },
      },
      dependencies: {
        probe: ["npm:imported"],
        "npm:imported": ["npm:transitive"],
        "npm:transitive": [],
        "npm:compiler": [],
        "npm:unrelated": [],
      },
      externalNodes: {
        "npm:imported": { packageName: "imported", version: "1.0.0" },
        "npm:transitive": { packageName: "transitive", version: "1.0.0" },
        "npm:compiler": { packageName: "compiler", version: "1.0.0" },
        "npm:unrelated": { packageName: "unrelated", version: "1.0.0" },
      },
    };
    const tasks: TaskGraph = {
      roots: ["probe:build"],
      tasks: {
        "probe:build": {
          id: "probe:build",
          target: { project: "probe", target: "build" },
          overrides: {},
          outputs: [],
          cache: true,
        },
      },
      dependencies: { "probe:build": [] },
      continuousDependencies: { "probe:build": [] },
    };
    const planner = new HashPlanner(
      { namedInputs: { production: ["{projectRoot}/**/*"] } },
      transferProjectGraph(graph),
    );
    const plan = planner.getPlans(["probe:build"], tasks)["probe:build"];
    expect(plan).toContain("npm:imported");
    expect(plan).toContain("npm:transitive");
    expect(plan).toContain("npm:compiler");
    expect(plan).not.toContain("npm:unrelated");
    expect(plan).not.toContain("AllExternalDependencies");
  });
});
