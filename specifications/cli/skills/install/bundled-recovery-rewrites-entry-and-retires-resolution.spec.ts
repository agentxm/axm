import { afterEach } from "vitest";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { handleInstall } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  installBundledAxmSkill,
  makeLintSpecWorkspace,
  runProjectLint,
} from "../../../support/lint-harness.js";
import { makeSpecRegistry } from "../../../support/registry-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/skills/install/bundled-recovery-rewrites-entry-and-retires-resolution",
  title:
    "Bundled official-skill recovery rewrites the settings entry to bundled ownership and retires the Registry resolution",
  statement:
    "When the workspace desires the official AXM skill from the Registry, installing the bundled official AXM skill shall rewrite that skill's axm.json entry to bundled workspace-owned content and retire its accepted Registry resolution, shall leave every other accepted resolution intact and the workspace lint-clean, and shall change nothing when repeated.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["cli/skills/install/bundled-recovery-converges"],
  supersedes: ["cli/skills/install/bundled-recovery-converges"],
  assumptions: [],
  openQuestions: [],
});

const CANONICAL_SKILL = "agent_extensions/agentxm/@agentxm/skills/axm/src/SKILL.md";
const PROJECTED_SKILL = ".claude/skills/axm/SKILL.md";

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
      const registry = makeSpecRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill("review-helper", [{ version: "1.0.0", body: "Review guidance." }]);
      const workspace = makeLintSpecWorkspace({
        machine: true,
        flags: { json: true },
        settings: {
          sources: [registry.source],
          skills: { axm: "agentxm:@agentxm/skills/axm" },
          lockfileSkills: {
            axm: {
              type: "registry",
              owner: "@agentxm",
              name: "axm",
              resolvedVersion: "0.28.3",
              integrity: `sha512-${Buffer.alloc(64).toString("base64")}`,
              sourceName: "agentxm",
              publisherBindingId: "hbnd_agentxm",
            },
          },
        },
      });
      cleanups.push(workspace.cleanup);
      yield* handleInstall({
        source: Option.some("@acme/skills/review-helper"),
        yes: true,
        force: false,
        preview: false,
      }).pipe(Effect.provide(workspace.layer));
      const lockBefore = workspace.readLockfileText();
      expect(lockBefore).toContain("axm:");
      expect(lockBefore).toContain("review-helper:");
      return workspace;
    });

  it.effect(
    "rewrites the entry to bundled ownership, retires the Registry resolution, and leaves the workspace lint-clean",
    () =>
      Effect.gen(function* () {
        const workspace = yield* registryResolvedWorkspace();

        yield* installBundledAxmSkill.pipe(Effect.provide(workspace.layer));

        expect(workspace.readSettings()).toMatchObject({
          skills: { axm: { source: "workspace", origin: "bundled" } },
        });
        const lockAfter = workspace.readLockfileText();
        expect(lockAfter).not.toContain("axm:");
        expect(lockAfter).toContain("review-helper:");
        expect(workspace.exists(CANONICAL_SKILL)).toBe(true);
        expect(workspace.exists(PROJECTED_SKILL)).toBe(true);

        const lint = yield* runProjectLint(workspace, false);
        expect(lint.result.findings).toEqual([]);
        expect(lint.ok).toBe(true);
      }),
  );

  it.effect("changes nothing when the recovery is repeated", () =>
    Effect.gen(function* () {
      const workspace = yield* registryResolvedWorkspace();
      yield* installBundledAxmSkill.pipe(Effect.provide(workspace.layer));
      const after = {
        settings: workspace.readSettings(),
        lock: workspace.readLockfileText(),
        canonical: workspace.readFile(CANONICAL_SKILL),
        projection: workspace.readFile(PROJECTED_SKILL),
      };

      yield* installBundledAxmSkill.pipe(Effect.provide(workspace.layer));

      expect(workspace.readSettings()).toEqual(after.settings);
      expect(workspace.readLockfileText()).toBe(after.lock);
      expect(workspace.readFile(CANONICAL_SKILL)).toBe(after.canonical);
      expect(workspace.readFile(PROJECTED_SKILL)).toBe(after.projection);
    }),
  );
});
