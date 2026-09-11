import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { countUnitStates, deriveOperationOutcome } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  makeLifecycleFixture,
  makeLifecycleRegistry,
  writeLocalSkillPackage,
  type LifecycleFixture,
  type LifecycleRegistry,
  type RegistrySkillVersion,
} from "../testing.js";
import { applyInstall, installRequest, readSettings } from "../install/test-helpers.js";
import { applyUpdate, expectResolved, targetedUpdateRequest } from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/update/advances-resolution-within-intent",
  title: "Update advances the accepted resolution within durable intent",
  statement:
    "Update of a desired Registry extension shall advance its accepted resolution and realized content to the newest version within the durable constraint without changing axm.json or any other extension, and shall be a no-op when already current.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const REVIEW = "code-review";
const FQN = `@acme/skills/${REVIEW}`;
const UNRELATED = "release-notes";

const firstVersion: RegistrySkillVersion = { version: "1.0.0", body: "First guidance." };

describe("Update a desired Registry extension", () => {
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

  /**
   * A workspace holding the accepted first version of a Registry skill,
   * declared through the given locator, and one unrelated local skill, after
   * which the Registry publishes the later versions.
   */
  const acceptedThenPublished = (
    registry: LifecycleRegistry,
    workspace: LifecycleFixture,
    options?: {
      readonly locator?: string;
      readonly later?: ReadonlyArray<RegistrySkillVersion>;
    },
  ) =>
    Effect.gen(function* () {
      registry.writeSkill(REVIEW, [firstVersion]);
      yield* applyInstall(
        installRequest({ subject: { kind: "source", source: options?.locator ?? FQN } }),
      );
      const unrelated = writeLocalSkillPackage(workspace.root, { name: UNRELATED });
      yield* applyInstall(installRequest({ subject: { kind: "source", source: unrelated } }));
      registry.writeSkill(REVIEW, [
        firstVersion,
        ...(options?.later ?? [{ version: "2.0.0", body: "Second guidance." }]),
      ]);
    });

  const update = () => applyUpdate(targetedUpdateRequest({ source: FQN }));

  it.effect(
    "advances the accepted resolution and realized content to a later published version",
    () => {
      const { workspace, registry } = world();
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* acceptedThenPublished(registry, workspace);
            expect(workspace.readFile("axm-lock.yaml")).toContain("resolvedVersion: 1.0.0");

            const resolution = expectResolved(yield* update());

            expect(workspace.readFile("axm-lock.yaml")).toContain("resolvedVersion: 2.0.0");
            expect(workspace.readFile(`.claude/skills/${REVIEW}/SKILL.md`)).toContain(
              "Second guidance.",
            );
            expect(deriveOperationOutcome(resolution)).toBe("applied");
            expect(countUnitStates(resolution.units)).toMatchObject({
              committed: 1,
              failed: 0,
              blocked: 0,
            });
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("advances only to the newest version the recorded constraint allows", () => {
    const { workspace, registry } = world();
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* acceptedThenPublished(registry, workspace, {
            locator: `${FQN}@^1.0.0`,
            later: [
              { version: "1.1.0", body: "Compatible guidance." },
              { version: "2.0.0", body: "Second guidance." },
            ],
          });

          const resolution = expectResolved(yield* update());

          expect(workspace.readFile("axm-lock.yaml")).toContain("resolvedVersion: 1.1.0");
          expect(workspace.readFile(`.claude/skills/${REVIEW}/SKILL.md`)).toContain(
            "Compatible guidance.",
          );
          expect(deriveOperationOutcome(resolution)).toBe("applied");
          expect(countUnitStates(resolution.units)).toMatchObject({
            committed: 1,
            failed: 0,
            blocked: 0,
          });
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("changes no workspace configuration and no unrelated extension", () => {
    const { workspace, registry } = world();
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* acceptedThenPublished(registry, workspace);
          const settingsBefore = JSON.stringify(readSettings(workspace));
          const unrelatedProjection = workspace.readFile(`.claude/skills/${UNRELATED}/SKILL.md`);
          const unrelatedIdentity = new RegExp(
            `${UNRELATED}:[\\s\\S]*?contentIdentity: ([0-9a-f]{64})`,
          ).exec(workspace.readFile("axm-lock.yaml"))?.[1];
          expect(unrelatedIdentity).toBeDefined();

          yield* update();

          expect(JSON.stringify(readSettings(workspace))).toBe(settingsBefore);
          expect(workspace.readFile(`.claude/skills/${UNRELATED}/SKILL.md`)).toBe(
            unrelatedProjection,
          );
          expect(workspace.readFile("axm-lock.yaml")).toContain(unrelatedIdentity ?? "");
          expect(
            workspace.readFile(`agent_extensions/local/vendor/${UNRELATED}/src/SKILL.md`),
          ).toContain(UNRELATED);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("repeating an update at the advanced resolution reports a no-op", () => {
    const { workspace, registry } = world();
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* acceptedThenPublished(registry, workspace);
          yield* update();
          const lockfileAfterFirst = workspace.readFile("axm-lock.yaml");

          const resolution = expectResolved(yield* update());

          expect(deriveOperationOutcome(resolution)).toBe("no-op");
          expect(workspace.readFile("axm-lock.yaml")).toBe(lockfileAfterFirst);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
