import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions";
import { makeRegistrySkillLockEntry } from "@agentxm/workspace-state/testing";

import {
  applyInstall,
  installRequest,
  makeInstallWorld,
  readSettings,
} from "../../install/test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/skills/install/bundled-recovery-rewrites-entry-and-retires-resolution",
  title:
    "Bundled official-skill recovery rewrites the settings entry to bundled ownership and retires the Registry resolution",
  statement:
    "When the workspace desires the official AXM skill from the Registry, installing the bundled official AXM skill shall rewrite that skill's axm.json entry to bundled workspace-owned content, retire its accepted Registry resolution, materialize the canonical content and the agent projection, leave every other accepted resolution intact, and change nothing when repeated.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [
    "cli/skills/install/bundled-recovery-converges",
    "cli/lint/declared-official-skill-must-be-compatible",
    "cli/lint/compatibility-result-names-reason-and-recovery",
    // Process evidence for the same recovery stays in the built-CLI example.
    "apps/cli-e2e/src/cli-commands/skills/install/command.e2e.ts",
  ],
  supersedes: ["cli/skills/install/bundled-recovery-converges"],
  assumptions: [],
  openQuestions: [],
});

const CANONICAL_SKILL = "agent_extensions/agentxm/@agentxm/skills/axm/src/SKILL.md";
const PROJECTED_SKILL = ".claude/skills/axm/SKILL.md";

/** The request `axm skills install --bundled` builds. */
const bundledRecovery = applyInstall(
  installRequest({
    type: "skill",
    subject: { kind: "bundled" },
    all: false,
    planName: "Install bundled AXM skill",
  }),
);

describe("Bundled official-skill recovery", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /**
   * A workspace that desires the official AXM skill from the Registry with an
   * accepted resolution, plus one unrelated Registry skill whose resolution
   * must survive recovery.
   */
  const registryResolvedWorkspace = () =>
    Effect.gen(function* () {
      const world = makeInstallWorld({
        settings: { skills: { axm: "agentxm:@agentxm/skills/axm" } },
      });
      cleanups.push(world.cleanup);
      world.registry.writeSkill("review-helper", [{ version: "1.0.0", body: "Review guidance." }]);
      world.workspace.writeFile(
        "axm-lock.yaml",
        JSON.stringify({
          lockfileVersion: 7,
          skills: {
            axm: makeRegistrySkillLockEntry({
              owner: decodeHandleSync("@agentxm"),
              name: "axm",
              sourceName: "agentxm",
              publisherBindingId: "hbnd_agentxm",
            }),
          },
        }),
      );

      yield* world.workspace
        .provide(
          applyInstall(
            installRequest({ subject: { kind: "source", source: "@acme/skills/review-helper" } }),
          ),
        )
        .pipe(Effect.provide(NodeServices.layer));

      const lockBefore = world.workspace.readFile("axm-lock.yaml");
      expect(lockBefore).toContain("axm:");
      expect(lockBefore).toContain("review-helper:");
      return world;
    });

  it.effect(
    "rewrites the entry to bundled ownership, retires the Registry resolution, and keeps every other resolution",
    () =>
      Effect.gen(function* () {
        const world = yield* registryResolvedWorkspace();

        yield* world.workspace.provide(bundledRecovery).pipe(Effect.provide(NodeServices.layer));

        expect(readSettings(world.workspace)).toMatchObject({
          skills: { axm: { source: "workspace", origin: "bundled" } },
        });
        const lockAfter = world.workspace.readFile("axm-lock.yaml");
        expect(lockAfter).not.toContain("axm:");
        expect(lockAfter).toContain("review-helper:");
        expect(world.workspace.exists(CANONICAL_SKILL)).toBe(true);
        expect(world.workspace.exists(PROJECTED_SKILL)).toBe(true);
      }),
  );

  it.effect("changes nothing when the recovery is repeated", () =>
    Effect.gen(function* () {
      const world = yield* registryResolvedWorkspace();
      yield* world.workspace.provide(bundledRecovery).pipe(Effect.provide(NodeServices.layer));
      const after = world.workspace.snapshot();

      yield* world.workspace.provide(bundledRecovery).pipe(Effect.provide(NodeServices.layer));

      expect(world.workspace.snapshot()).toEqual(after);
    }),
  );
});
