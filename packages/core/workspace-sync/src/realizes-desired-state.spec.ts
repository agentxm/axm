import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { countUnitStates, deriveOperationOutcome } from "@agentxm/workspace-operations";
import * as Option from "effect/Option";

import { WorkspaceMutations } from "@agentxm/workspace-state";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  applySync,
  expectResolved,
  makeSyncFixture,
  writeLocalSkillPackage,
  type SyncFixture,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/sync/realizes-desired-state",
  title: "Sync realizes desired additions and removes what desired state no longer includes",
  statement:
    "Sync shall realize each desired extension AXM owns, recording a first accepted resolution for one that has none and restoring missing agent projections from canonical content and missing canonical content from the exact accepted identity, shall remove owned outputs that desired state no longer includes, and shall report a no-op once managed state agrees with desired state.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "agent-interoperability"],
  methods: ["example"],
  derivedFrom: ["cli/sync/preserves-configuration-and-resolutions"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const SKILL = "code-review";
const CANONICAL = `agent_extensions/local/vendor/${SKILL}/src/SKILL.md`;
const CLAUDE_PROJECTION = `.claude/skills/${SKILL}`;
const UNIVERSAL_PROJECTION = `.agents/skills/${SKILL}`;

describe("Sync realizes desired workspace state", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  /** A workspace declaring one local skill it has not yet accepted. */
  const desiredWorkspace = (): SyncFixture => {
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        skills: { [SKILL]: `./vendor/${SKILL}` },
      },
    });
    cleanups.push(workspace.cleanup);
    writeLocalSkillPackage(workspace.root, { name: SKILL });
    return workspace;
  };

  /** The same workspace, already reconciled once. */
  const realizedWorkspace = () =>
    Effect.gen(function* () {
      yield* applySync();
    });

  it.effect(
    "records a first accepted resolution for a desired extension that has none and realizes it",
    () => {
      const workspace = desiredWorkspace();
      return workspace
        .provide(
          Effect.gen(function* () {
            const ws = yield* WorkspaceMutations;
            const settingsBefore = JSON.stringify(workspace.readSettings());
            expect(Option.isNone(yield* ws.getLockedSkill(SKILL))).toBe(true);

            yield* applySync();

            const accepted = yield* ws.getLockedSkill(SKILL);
            expect(Option.getOrUndefined(accepted)).toMatchObject({ type: "local" });
            expect(JSON.stringify(workspace.readSettings())).toBe(settingsBefore);
            expect(workspace.exists(CANONICAL)).toBe(true);
            expect(workspace.exists(CLAUDE_PROJECTION)).toBe(true);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("restores a deleted agent projection from canonical content", () => {
    const workspace = desiredWorkspace();
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* realizedWorkspace();
          const canonicalContent = workspace.readFile(CANONICAL);
          workspace.remove(CLAUDE_PROJECTION);

          const resolution = expectResolved(yield* applySync());

          expect(workspace.readFile(`${CLAUDE_PROJECTION}/SKILL.md`)).toBe(canonicalContent);
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

  it.effect("restores deleted canonical content from the exact accepted identity", () => {
    const workspace = desiredWorkspace();
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* realizedWorkspace();
          const ws = yield* WorkspaceMutations;
          const sourceContent = workspace.readFile(`vendor/${SKILL}/src/SKILL.md`);
          const acceptedBefore = yield* ws.getLockedSkill(SKILL);
          expect(Option.isSome(acceptedBefore)).toBe(true);
          workspace.remove("agent_extensions");

          yield* applySync();

          expect(workspace.readFile(CANONICAL)).toBe(sourceContent);
          expect(workspace.exists(CLAUDE_PROJECTION)).toBe(true);
          expect(yield* ws.getLockedSkill(SKILL)).toEqual(acceptedBefore);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("reports an up-to-date workspace once managed state agrees with desired state", () => {
    const workspace = desiredWorkspace();
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* realizedWorkspace();
          workspace.remove(CLAUDE_PROJECTION);
          yield* applySync();

          const outcome = yield* applySync();

          expect(outcome._tag).toBe("AlreadyReconciled");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "removes owned projections that desired state no longer includes and then reports a no-op",
    () => {
      const workspace = desiredWorkspace();
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* realizedWorkspace();
            expect(workspace.exists(UNIVERSAL_PROJECTION)).toBe(true);

            workspace.writeSettings({ owner: "@acme", agents: ["claude-code"], skills: {} });
            yield* applySync();

            expect(workspace.exists(UNIVERSAL_PROJECTION)).toBe(false);
            expect((yield* applySync())._tag).toBe("AlreadyReconciled");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
