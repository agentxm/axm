import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  makeLifecycleFixture,
  makeLifecycleRegistry,
  writeLocalSkillPackage,
  type LifecycleFixture,
  type LifecycleRegistry,
} from "../testing.js";
import { applyInstall, installRequest, readSettings } from "../install/test-helpers.js";
import {
  applyUpdate,
  expectResolved,
  previewUpdate,
  targetedUpdateRequest,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/update/refuses-undesired-extensions",
  title: "Update is blocked for an extension the workspace does not desire",
  statement:
    "When an update names an extension the workspace does not desire, the update shall be blocked as an unmet precondition before any change and shall leave configuration, lock state, and acquired content untouched.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["cli/update/advances-resolution-within-intent"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const TOOLKIT = "@acme/packs/toolkit";
const MEMBER = "pack-member";
const NEIGHBOR = "unrelated";
const PACK_RELEASE = "agent_extensions/agentxm/@acme/packs/toolkit/release.txt";
const MEMBER_PROJECTION = `.claude/skills/${MEMBER}/SKILL.md`;

/** Every file under a directory, so "nothing was acquired from it" is provable. */
const snapshotDirectory = (base: string): ReadonlyArray<readonly [string, string]> => {
  const entries: Array<readonly [string, string]> = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = nodePath.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
        continue;
      }
      entries.push([nodePath.relative(base, absolute), fs.readFileSync(absolute, "base64")]);
    }
  };
  walk(base);
  return entries.sort((left, right) => left[0].localeCompare(right[0]));
};

describe("Update an extension the workspace does not desire", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const world = (): { workspace: LifecycleFixture; registry: LifecycleRegistry } => {
    const registry = makeLifecycleRegistry();
    cleanups.push(registry.cleanup);
    const workspace = makeLifecycleFixture({
      sources: "live",
      settings: { owner: "@acme", agents: ["claude-code"], sources: [registry.source] },
    });
    cleanups.push(workspace.cleanup);
    return { workspace, registry };
  };

  it.effect("is blocked as an unmet precondition and changes nothing", () => {
    const { workspace } = world();
    return workspace
      .provide(
        Effect.gen(function* () {
          const settingsBefore = JSON.stringify(readSettings(workspace));
          const lockfileBefore = workspace.readFile("axm-lock.yaml");

          const resolution = expectResolved(
            yield* applyUpdate(targetedUpdateRequest({ source: "@acme/skills/absent" })),
          );

          expect(deriveOperationOutcome(resolution)).toBe("blocked");
          expect(resolution.blocking).toMatchObject({ class: "precondition-unmet" });
          expect(resolution.units).toEqual([]);
          expect(JSON.stringify(readSettings(workspace))).toBe(settingsBefore);
          expect(workspace.readFile("axm-lock.yaml")).toBe(lockfileBefore);
          expect(workspace.exists("agent_extensions")).toBe(false);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  /**
   * A Registry publishing a Pack the workspace has never asked for, beside one
   * installed local skill whose state the refusal must not disturb.
   */
  const packAndInstalledNeighbor = (workspace: LifecycleFixture, registry: LifecycleRegistry) =>
    Effect.gen(function* () {
      registry.writeSkill(MEMBER, [{ version: "1.0.0", body: "Required Pack member." }]);
      registry.writePack("toolkit", [
        {
          version: "1.0.0",
          dependencies: { [`@acme/skills/${MEMBER}`]: "^1.0.0" },
          files: { "release.txt": "First Pack release.\n" },
        },
      ]);
      const neighbor = writeLocalSkillPackage(workspace.root, { name: NEIGHBOR });
      yield* applyInstall(installRequest({ subject: { kind: "source", source: neighbor } }));
      expect(readSettings(workspace)).toMatchObject({
        skills: { [NEIGHBOR]: expect.anything() },
      });
      const canonical = workspace.readFile(
        `agent_extensions/local/vendor/${NEIGHBOR}/src/SKILL.md`,
      );
      expect(workspace.readFile(`.claude/skills/${NEIGHBOR}/SKILL.md`)).toBe(canonical);
      expect(workspace.readFile(`.agents/skills/${NEIGHBOR}/SKILL.md`)).toBe(canonical);
    });

  it.effect.each([{ mode: "preview" }, { mode: "apply" }] as const)(
    "refuses an available but undesired Pack in $mode without acquiring its closure",
    ({ mode }) => {
      const { workspace, registry } = world();
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* packAndInstalledNeighbor(workspace, registry);
            const before = workspace.snapshot();
            const registryBefore = snapshotDirectory(registry.root);

            const resolution = expectResolved(
              yield* (mode === "preview" ? previewUpdate : applyUpdate)(
                targetedUpdateRequest({ source: TOOLKIT }),
              ),
            );

            expect(deriveOperationOutcome(resolution)).toBe("blocked");
            expect(resolution.blocking).toMatchObject({
              class: "precondition-unmet",
              subject: TOOLKIT,
            });
            expect(resolution.units).toEqual([]);
            // Nothing of the closure was acquired: neither the Pack's own
            // content nor the member it would have brought with it.
            expect(workspace.exists(PACK_RELEASE)).toBe(false);
            expect(workspace.exists(MEMBER_PROJECTION)).toBe(false);
            expect(workspace.exists("agent_extensions/agentxm/@acme/packs/toolkit")).toBe(false);
            expect(workspace.exists(`agent_extensions/agentxm/@acme/skills/${MEMBER}`)).toBe(false);
            expect(workspace.exists(`.agents/skills/${MEMBER}`)).toBe(false);
            expect(workspace.snapshot()).toEqual(before);
            expect(snapshotDirectory(registry.root)).toEqual(registryBefore);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  // An admission control: real Pack update must still run once this workspace
  // desires the Pack. Advancement policy remains owned by
  // cli/update/advances-resolution-within-intent.
  it.effect("allows the root update of an already-desired Pack", () => {
    const { workspace, registry } = world();
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* packAndInstalledNeighbor(workspace, registry);
          yield* applyInstall(
            installRequest({ type: "pack", subject: { kind: "source", source: TOOLKIT } }),
          );
          expect(workspace.readFile(PACK_RELEASE)).toBe("First Pack release.\n");
          expect(workspace.readFile(MEMBER_PROJECTION)).toContain("Required Pack member.");
          const neighborBefore = workspace
            .snapshot()
            .filter(([relative]) => relative.includes(NEIGHBOR));
          registry.writePack("toolkit", [
            {
              version: "1.0.0",
              dependencies: { [`@acme/skills/${MEMBER}`]: "^1.0.0" },
              files: { "release.txt": "First Pack release.\n" },
            },
            {
              version: "2.0.0",
              dependencies: { [`@acme/skills/${MEMBER}`]: "^1.0.0" },
              files: { "release.txt": "Second Pack release.\n" },
            },
          ]);

          const resolution = expectResolved(
            yield* applyUpdate(targetedUpdateRequest({ source: TOOLKIT })),
          );

          expect(deriveOperationOutcome(resolution)).toBe("applied");
          expect(workspace.readFile(PACK_RELEASE)).toBe("Second Pack release.\n");
          expect(workspace.snapshot().filter(([relative]) => relative.includes(NEIGHBOR))).toEqual(
            neighborBefore,
          );
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
