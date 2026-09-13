import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { defineSpecification } from "@agentxm/specification-metadata";

import { ListExtensions } from "./list-extensions.js";
import { makeInspectionFixture } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/list/classifies-unexplained-content",
  title: "List classifies content desired state does not explain",
  statement:
    "When listing extensions, AXM shall classify each detected extension that desired state does not explain as leftover when it is an installed package in the install root that is not configured, undeclared when it is an authored package in its standard authoring folder that is not declared, or unmanaged when it is native agent content, and update and deprecation assessments shall report leftover and undeclared extensions as not applicable.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "cli/list/reports-the-cross-type-inventory",
    "packages/core/workspace-inspection/src/extension-list/list-extensions.ts",
    "packages/core/workspace-state/src/workspace/read-model/extensions/inventory.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const skillManifest = (name: string): string =>
  JSON.stringify({ owner: "@acme", type: "skill", name, version: "1.0.0" }, null, 2);

const skillMd = (name: string): string =>
  `---\nname: ${name}\ndescription: ${name} guidance\n---\n# ${name}\n`;

describe("Unexplained content classification", () => {
  it.effect("tells leftover, undeclared, and unmanaged content apart in a project", () => {
    const fixture = makeInspectionFixture({
      settings: { owner: "@acme" },
      files: {
        "agent_extensions/agentxm/@acme/skills/stale/skill.json": skillManifest("stale"),
        "agent_extensions/agentxm/@acme/skills/stale/src/SKILL.md": skillMd("stale"),
        "skills/drafted/skill.json": skillManifest("drafted"),
        "skills/drafted/src/SKILL.md": skillMd("drafted"),
        ".agents/skills/native/SKILL.md": skillMd("native"),
      },
    });
    return fixture
      .provide(
        Effect.gen(function* () {
          const all = yield* ListExtensions.query({ filter: "all" });
          const management = Object.fromEntries(
            all.document.items.map((item) => [item.name, item.management]),
          );
          expect(management).toEqual({
            stale: "leftover",
            drafted: "undeclared",
            native: "unmanaged",
          });
          const states = Object.fromEntries(
            all.document.items.map((item) => [item.name, item.assessment.state]),
          );
          expect(states).toEqual({
            stale: "not-applicable",
            drafted: "not-applicable",
            native: "unknown",
          });

          for (const filter of ["outdated", "deprecated"] as const) {
            const assessed = yield* ListExtensions.query({ filter });
            // Only the native content remains unassessable; leftover and
            // undeclared packages are not applicable rather than unknown.
            expect(assessed.document.coverage, filter).toEqual({
              eligible: 3,
              checked: 0,
              unknown: 1,
              notApplicable: 2,
            });
          }
          expect(fixture.requests).toEqual([]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });

  it.effect("classifies an installed package the user workspace does not configure", () => {
    const fixture = makeInspectionFixture({ scope: "user", settings: {} });
    const write = (relativePath: string, contents: string) => {
      const file = nodePath.join(fixture.workspaceRoot, relativePath);
      fs.mkdirSync(nodePath.dirname(file), { recursive: true });
      fs.writeFileSync(file, contents);
    };
    write("agent_extensions/agentxm/@acme/skills/stale/skill.json", skillManifest("stale"));
    write("agent_extensions/agentxm/@acme/skills/stale/src/SKILL.md", skillMd("stale"));
    return fixture
      .provide(
        Effect.gen(function* () {
          const all = yield* ListExtensions.query({ type: "skill", filter: "all" });
          expect(all.document.items).toEqual([
            expect.objectContaining({ name: "stale", management: "leftover" }),
          ]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });
});
