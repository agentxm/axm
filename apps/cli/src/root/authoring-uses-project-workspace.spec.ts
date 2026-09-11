import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { collectHelpFiles } from "../test-support/command-tree-test-helpers.js";
import { defineSpecification } from "@agentxm/specification-metadata";

export const specification = defineSpecification({
  requirement: "cli/authoring-uses-project-workspace",
  title: "Authoring commands use the project workspace",
  statement:
    "Commands that create or change authored packages shall operate in the selected project workspace and reject a user-scope selector without changing either workspace.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  boundary: "memory",
  boundaryRationale:
    "The registered command tree is where an authoring route declares its project-workspace boundary and declines a scope selector, and it is reachable in process; the built-CLI refusals and the authored content they leave behind are bound evidence at apps/cli-e2e/src/authoring-uses-project-workspace.e2e.test.ts.",
  methods: ["contract", "example"],
  derivedFrom: [
    "apps/cli/src/root/scope-contract.ts",
    "apps/cli/src/app.test.ts",
    "apps/cli-e2e/src/authoring-uses-project-workspace.e2e.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const authoringRoutes = [
  "adopt",
  "demote",
  "version",
  "publish",
  "fork",
  "skills import",
  "subagents import",
  "packs add",
  "packs remove",
  ...["skills", "mcps", "subagents", "rules", "hooks", "knowledge", "packs"].flatMap((type) => [
    `${type} new`,
    `${type} publish`,
  ]),
];

describe("Authoring commands use the project workspace", () => {
  it.effect("describes the project boundary for every authoring command", () =>
    Effect.gen(function* () {
      const help = yield* collectHelpFiles();
      for (const route of authoringRoutes) {
        const document = help.get(`axm ${route}`);
        expect(document, route).toBeDefined();
        expect(
          document?.flags.map((flag) => flag.name),
          route,
        ).not.toContain("scope");
        expect(document?.description.toLowerCase(), route).toContain("project-workspace");
      }
    }),
  );

  // The three built-CLI rows — `skills new --scope user` refused before any
  // write, and the MCP package import refusing user scope in preview and in
  // apply — need a real process with a populated user workspace. They run in
  // `apps/cli-e2e/src/authoring-uses-project-workspace.e2e.test.ts`, bound to
  // this requirement through that file's `executionBinding`.
});
