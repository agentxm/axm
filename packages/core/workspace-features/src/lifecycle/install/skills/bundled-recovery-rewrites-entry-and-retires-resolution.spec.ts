import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import YAML from "yaml";

import { defineSpecification } from "@agentxm/specification-metadata";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions";
import { acceptedCanonicalObservation } from "@agentxm/workspace-kernel/workspace-state";
import {
  storedLockfileFixture,
  makeRegistrySkillLockEntry,
} from "@agentxm/workspace-kernel/workspace-state/testing";
import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";

import { readSettings } from "../test-helpers.js";
import { BundledAxmSkillAsset } from "@agentxm/extension-kinds/skills";
import { bundledAxmSkillAsset } from "../../testing.js";
import { applyInstall, installRequest, makeInstallWorld } from "../../../testing/install-world.js";

export const specification = defineSpecification({
  requirement: "cli/skills/install/bundled-recovery-rewrites-entry-and-retires-resolution",
  title:
    "Bundled official-skill recovery rewrites the settings entry to bundled ownership and retires the Registry resolution",
  statement:
    "When the workspace desires the official AXM skill from the Registry, installing the bundled official AXM skill shall rewrite that skill's axm.json entry to bundled workspace-owned content, retire its accepted Registry resolution, materialize the canonical content and the agent projection, leave every other accepted resolution and every other copy of the skill intact, and change nothing when repeated. The installation shall succeed only when the package the rewritten state selects is the bundled release, read back from its installed manifest and entry document, and compatible with the running AXM CLI; otherwise it shall fail and restore the configuration, lock state, and canonical content it found.",
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

const CANONICAL_SKILL = "agent_extensions/registry.agentxm.ai/@agentxm/skills/axm/src/SKILL.md";
/** An older copy of the official skill outside the selected canonical location. */
const STALE_COPY = "agent_extensions/agentxm/@agentxm/skills/axm/skill.json";
const STALE_MANIFEST = JSON.stringify({
  owner: "@agentxm",
  type: "skill",
  name: "axm",
  version: "0.0.1",
});
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

/**
 * The generated asset with what the executable claims about it changed, so
 * the claim and the bytes it installs disagree.
 */
const assetClaiming = (
  claim: Partial<typeof BundledAxmSkillAsset.Service>,
  base: Layer.Layer<BundledAxmSkillAsset> = bundledAxmSkillAsset(),
): Layer.Layer<BundledAxmSkillAsset> =>
  Layer.effect(
    BundledAxmSkillAsset,
    Effect.gen(function* () {
      const asset = yield* BundledAxmSkillAsset;
      return { ...asset, ...claim };
    }),
  ).pipe(Layer.provide(base));

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
        settings: { skills: { axm: "test:@agentxm/skills/axm" } },
      });
      cleanups.push(world.cleanup);
      world.registry.writeSkill("review-helper", [{ version: "1.0.0", body: "Review guidance." }]);
      world.workspace.writeFile(
        "axm-lock.yaml",
        JSON.stringify(
          storedLockfileFixture({
            lockfileVersion: 11,
            skills: {
              axm: makeRegistrySkillLockEntry({
                owner: decodeHandleSync("@agentxm"),
                name: "axm",
                sourceName: "agentxm",
                publisherBindingId: "hbnd_agentxm",
              }),
            },
          }),
        ),
      );

      yield* world.workspace
        .provide(
          applyInstall(
            installRequest({ subject: { kind: "source", source: "@acme/skills/review-helper" } }),
          ),
        )
        .pipe(Effect.provide(NodeServices.layer));

      world.workspace.writeFile(STALE_COPY, STALE_MANIFEST);
      const lockBefore: unknown = YAML.parse(world.workspace.readFile("axm-lock.yaml"));
      expect(lockBefore).toHaveProperty("skills.axm");
      expect(lockBefore).toHaveProperty("skills.review-helper");
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
        const lockAfter: unknown = YAML.parse(world.workspace.readFile("axm-lock.yaml"));
        expect(lockAfter).not.toHaveProperty("skills.axm");
        expect(lockAfter).toHaveProperty("skills.review-helper");
        expect(world.workspace.exists(CANONICAL_SKILL)).toBe(true);
        expect(world.workspace.exists(PROJECTED_SKILL)).toBe(true);
        expect(world.workspace.readFile(STALE_COPY)).toBe(STALE_MANIFEST);
      }),
  );

  it.effect.each([
    {
      installed: "an entry document without compatibility metadata",
      asset: bundledAxmSkillAsset({
        body: "---\nname: axm\ndescription: The official AXM skill.\n---\n\n# axm\n",
      }),
    },
    {
      // The executable claims 1.0.0 but carries compatible 1.0.1 bytes.
      installed: "a compatible release other than the bundled one",
      asset: assetClaiming({ version: "1.0.0" }, bundledAxmSkillAsset({ version: "1.0.1" })),
    },
    {
      // The executable claims a range that admits it, but the entry document
      // it carries declares one that does not.
      installed: "an entry document whose range excludes the running CLI",
      asset: assetClaiming(
        { cliVersionRange: ">=1.0.0 <2.0.0" },
        bundledAxmSkillAsset({ version: "1.0.0", cliVersionRange: ">=2.0.0 <3.0.0" }),
      ),
    },
    {
      installed: "a manifest without a valid version",
      asset: assetClaiming({
        manifestJson: `${JSON.stringify({ owner: "@agentxm", type: "skill", name: "axm", version: "next" })}\n`,
      }),
    },
    { installed: "a manifest that is not JSON", asset: assetClaiming({ manifestJson: "{" }) },
    { installed: "no entry document at all", asset: assetClaiming({ sourceFiles: [] }) },
  ])("fails and restores the workspace when the installed bytes are $installed", ({ asset }) =>
    Effect.gen(function* () {
      const world = yield* registryResolvedWorkspace();
      const before = world.workspace.snapshot();

      const resolution = yield* world.workspace
        .provide(bundledRecovery.pipe(Effect.provide(asset)))
        .pipe(Effect.provide(NodeServices.layer));

      expect(deriveOperationOutcome(resolution)).not.toBe("applied");
      expect(world.workspace.snapshot()).toEqual(before);
    }),
  );

  it.effect("judges the installed package even after the previous state was observed", () =>
    Effect.gen(function* () {
      const world = yield* registryResolvedWorkspace();

      yield* world.workspace
        .provide(
          Effect.gen(function* () {
            // Observing the Registry-desired package first must not leave a
            // stale observation for the readback to accept.
            const primed = yield* acceptedCanonicalObservation({ type: "skill", name: "axm" });
            expect(Option.map(primed, ({ desired }) => desired.identity.authority)).toEqual(
              Option.some("registry"),
            );
            yield* bundledRecovery;
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));

      expect(readSettings(world.workspace)).toMatchObject({
        skills: { axm: { source: "workspace", origin: "bundled" } },
      });
      const lockAfter: unknown = YAML.parse(world.workspace.readFile("axm-lock.yaml"));
      expect(lockAfter).not.toHaveProperty("skills.axm");
      expect(world.workspace.exists(CANONICAL_SKILL)).toBe(true);
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
