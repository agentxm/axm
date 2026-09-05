import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as YAML from "yaml";
import { handleInstall, LockfileSchema } from "axm.sh/specification-harness";
import { makeSpecRegistry } from "../../support/registry-fixture.js";
import { expectAuthoringRefusal } from "../../support/authoring-outcomes.js";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { handleAdopt, expectAppliedPlanResult } from "axm.sh/specification-harness";
import { makeSpecWorkspace } from "../../support/install-harness.js";
import {
  authoringTypes,
  writeAuthoringPackage,
  writePackageFile,
} from "../../support/authoring-fixtures.js";
import { snapshotWorkspaceContent } from "../../support/workspace-fixtures.js";
import * as path from "node:path";

export const specification = defineSpecification({
  requirement: "cli/adopt/moves-package-into-workspace-authorship",
  title: "Adopt moves an existing package into workspace authorship",
  statement:
    "When a person adopts an existing AXM package into an unoccupied authoring location, AXM shall preserve its content in the workspace authoring directory, retain its declared activation (enabling a previously undeclared package), and remove the acquired copy and its external resolution.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "packages/cli/src/root/adopt/command.internal.test.ts",
    "packages/cli/src/root/adopt/command.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Adopting existing packages", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });
  const workspace = (settings: Parameters<typeof makeSpecWorkspace>[0] = {}) => {
    const created = makeSpecWorkspace({ machine: true, ...settings });
    cleanups.push(created.cleanup);
    return created;
  };

  for (const row of authoringTypes)
    for (const activation of ["undeclared", "enabled", "disabled"] as const)
      it.effect(
        `adopts a ${row.type} with ${activation} activation without losing package content`,
        () =>
          Effect.gen(function* () {
            const enabled = activation !== "disabled";
            const created = workspace({
              settings: {
                agents: [],
                ...(activation === "undeclared"
                  ? {}
                  : {
                      [row.inputKey]: {
                        review: { source: `@acme/${row.plural}/review`, enabled },
                      },
                    }),
              },
            });
            const source = writeAuthoringPackage(created.root, row, "review", {
              parent: `agent_extensions/agentxm/@acme/${row.plural}`,
            });
            const before = snapshotWorkspaceContent(source);
            yield* handleAdopt({ fqn: `@acme/${row.plural}/review`, preview: false }).pipe(
              Effect.provide(created.layer),
            );
            expectAppliedPlanResult(created.rendererState.results.at(-1)?.data, {
              planName: "Adopt workspace extension",
            });
            expect(snapshotWorkspaceContent(path.join(created.root, row.plural, "review"))).toEqual(
              before,
            );
            expect(created.exists(`agent_extensions/agentxm/@acme/${row.plural}/review`)).toBe(
              false,
            );
            expect(created.readSettings()).toMatchObject({
              [row.settingsKey]: {
                review: enabled ? "workspace" : { source: "workspace", enabled: false },
              },
            });
            expect(created.readLockfileText()).not.toContain("review:");
          }),
      );
  for (const type of ["skill", "mcp-server"] as const)
    for (const enabled of [true, false])
      it.effect(
        `retires an accepted ${type} registry resolution while preserving enabled=${enabled}`,
        () =>
          Effect.gen(function* () {
            const registry = makeSpecRegistry();
            cleanups.push(registry.cleanup);
            if (type === "skill")
              registry.writeSkill("review", [
                { version: "1.2.3", body: "Preserve these accepted instructions." },
              ]);
            else registry.writeMcp("review", [{ version: "1.2.3" }]);
            registry.writeSkill("test-helper", [
              { version: "2.3.4", body: "Keep this unrelated package." },
            ]);
            const plural = type === "skill" ? "skills" : "mcps";
            const settingsKey = type === "skill" ? "skills" : "mcpServers";
            const created = workspace({ settings: { agents: [], sources: [registry.source] } });
            for (const source of [`@acme/${plural}/review`, "@acme/skills/test-helper"])
              yield* handleInstall({
                source: Option.some(source),
                force: false,
                preview: false,
              }).pipe(Effect.provide(created.layer));
            const beforeValue: unknown = YAML.parse(created.readLockfileText());
            const beforeLock = yield* Schema.decodeUnknownEffect(LockfileSchema)(beforeValue);
            expect(
              type === "skill"
                ? beforeLock.skills["review"]
                : Object.values(beforeLock.mcpServers ?? {}).find(
                    (entry) => entry.type === "registry" && entry.name === "review",
                  ),
            ).toBeDefined();
            created.writeSettings({
              owner: "@acme",
              agents: [],
              sources: [registry.source],
              skills: {
                "test-helper": "@acme/skills/test-helper",
                ...(type === "skill" ? { review: { source: "@acme/skills/review", enabled } } : {}),
              },
              ...(type === "mcp-server"
                ? { mcpServers: { review: { source: "@acme/mcps/review", enabled } } }
                : {}),
            });
            const before = snapshotWorkspaceContent(
              path.join(created.root, `agent_extensions/agentxm/@acme/${plural}/review`),
            );
            yield* handleAdopt({ fqn: `@acme/${plural}/review`, preview: false }).pipe(
              Effect.provide(created.layer),
            );
            expectAppliedPlanResult(created.rendererState.results.at(-1)?.data, {
              planName: "Adopt workspace extension",
            });
            expect(snapshotWorkspaceContent(path.join(created.root, plural, "review"))).toEqual(
              before,
            );
            const afterValue: unknown = YAML.parse(created.readLockfileText());
            const afterLock = yield* Schema.decodeUnknownEffect(LockfileSchema)(afterValue);
            expect(
              type === "skill"
                ? afterLock.skills["review"]
                : Object.values(afterLock.mcpServers ?? {}).find(
                    (entry) => entry.type === "registry" && entry.name === "review",
                  ),
            ).toBeUndefined();
            expect(afterLock.skills["test-helper"]).toEqual(beforeLock.skills["test-helper"]);
            expect(created.readSettings()).toMatchObject({
              [settingsKey]: {
                review: enabled ? "workspace" : { source: "workspace", enabled: false },
              },
            });
          }),
      );
  it.effect("refuses to overwrite an existing authored destination", () =>
    Effect.gen(function* () {
      const created = workspace({ settings: { agents: [] } });
      writeAuthoringPackage(created.root, authoringTypes[0], "review", {
        parent: "agent_extensions/agentxm/@acme/skills",
      });
      writePackageFile(created.root, "skills/review/notes.txt", "Authored work");
      const before = snapshotWorkspaceContent(created.root);
      const outcome = yield* handleAdopt({ fqn: "@acme/skills/review", preview: false }).pipe(
        Effect.result,
        Effect.provide(created.layer),
      );
      expectAuthoringRefusal(outcome, created.rendererState.results.at(-1)?.data, "conflict");
      expect(snapshotWorkspaceContent(created.root)).toEqual(before);
    }),
  );
});
