import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { countUnitStates, deriveOperationOutcome } from "../../transitions/planning/index.js";
import * as Option from "effect/Option";

import { LockfileReader } from "../../desired-state/index.js";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  applySync,
  expectResolved,
  makeSyncFixture,
  makeFileRegistry,
  writeLocalSkillPackage,
  type SyncFixture,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/sync/realizes-desired-state",
  title: "Sync realizes desired additions and removes what desired state no longer includes",
  statement:
    "Sync shall realize desired installations and activation, accepting a first resolution when absent and restoring missing content only from its accepted identity, shall remove unreachable accepted records, verified acquired installations and obsolete owned outputs when reachability and ownership are established while preserving authored and unowned content, and shall report convergence only when every required postcondition in its scope is satisfied.",
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
const CANONICAL = `agent_extensions/path/@acme/skills/${SKILL}/src/SKILL.md`;
const CLAUDE_PROJECTION = `.claude/skills/${SKILL}`;
const UNIVERSAL_PROJECTION = `.agents/skills/${SKILL}`;

describe("Sync realizes desired workspace state", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  for (const type of [
    "skill",
    "subagent",
    "rule",
    "hook",
    "knowledge",
    "mcp-server",
    "pack",
  ] as const) {
    for (const enabled of [true, false]) {
      it.effect(
        `realizes ${enabled ? "enabled" : "disabled"} ${type} and retires its unreachable acquisition`,
        () => {
          const registry = makeFileRegistry();
          cleanups.push(registry.cleanup);
          const name = "review";
          const versions = [{ version: "1.0.0", body: "Review." }];
          switch (type) {
            case "skill":
              registry.writeSkill(name, versions);
              break;
            case "subagent":
              registry.writeSubagent(name, versions);
              break;
            case "rule":
              registry.writeRule(name, versions);
              break;
            case "hook":
              registry.writeHook(name, versions);
              break;
            case "knowledge":
              registry.writeKnowledge(name, versions);
              break;
            case "mcp-server":
              registry.writeMcp(name, versions);
              break;
            case "pack":
              registry.writePack(name, [{ version: "1.0.0", dependencies: {} }]);
              break;
          }
          const segment =
            type === "mcp-server" ? "mcps" : type === "knowledge" ? "knowledge" : `${type}s`;
          const settingsKey = type === "mcp-server" ? "mcpServers" : segment;
          const settings = { owner: "@acme", agents: ["claude-code"], sources: [registry.source] };
          const workspace = makeSyncFixture({
            settings: {
              ...settings,
              [settingsKey]: {
                [name]: { source: `agentxm:@acme/${segment}/${name}@^1.0.0`, enabled },
              },
            },
          });
          cleanups.push(workspace.cleanup);
          return workspace
            .provide(
              Effect.gen(function* () {
                const first = expectResolved(yield* applySync());
                expect(deriveOperationOutcome(first)).toBe("applied");
                const canonical = `agent_extensions/registry/@acme/${segment}/${name}`;
                expect(workspace.exists(canonical)).toBe(true);
                if (!enabled) expect(workspace.exists(`.claude/skills/${name}`)).toBe(false);
                workspace.writeSettings(settings);
                const retired = expectResolved(yield* applySync());
                expect(deriveOperationOutcome(retired)).toBe("applied");
                expect(workspace.exists(canonical)).toBe(false);
                expect(workspace.readFile("axm-lock.yaml")).not.toContain("workspaceName: review");
                expect((yield* applySync())._tag).toBe("AlreadyReconciled");
              }),
            )
            .pipe(Effect.provide(NodeServices.layer));
        },
      );
    }
  }

  it.effect(
    "commits an independent ready extension while a conflicting accepted extension stays blocked",
    () => {
      const registry = makeFileRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill("retained", [{ version: "1.0.0", body: "Retained." }]);
      registry.writeSkill("ready", [{ version: "1.0.0", body: "Ready." }]);
      const base = { owner: "@acme", agents: ["claude-code"], sources: [registry.source] };
      const workspace = makeSyncFixture({
        settings: {
          ...base,
          skills: {
            retained: "agentxm:@acme/skills/retained@^1.0.0",
          },
        },
      });
      cleanups.push(workspace.cleanup);
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();
            const retained = workspace.readFile(
              "agent_extensions/registry/@acme/skills/retained/src/SKILL.md",
            );
            workspace.writeSettings({
              ...base,
              skills: {
                retained: "agentxm:@acme/skills/retained@^2.0.0",
                ready: "agentxm:@acme/skills/ready@^1.0.0",
              },
            });
            const settings = workspace.readFile("axm.json");
            const result = expectResolved(yield* applySync());
            expect(deriveOperationOutcome(result)).not.toBe("applied");
            expect(JSON.stringify(result)).toContain("accepted-resolution-incompatible");
            expect(
              workspace.exists("agent_extensions/registry/@acme/skills/ready/src/SKILL.md"),
            ).toBe(true);
            expect(
              workspace.readFile("agent_extensions/registry/@acme/skills/retained/src/SKILL.md"),
            ).toBe(retained);
            expect(workspace.readFile("axm.json")).toBe(settings);
            expect((yield* applySync())._tag).not.toBe("AlreadyReconciled");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

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
            const lockfile = yield* LockfileReader;
            const settingsBefore = JSON.stringify(workspace.readSettings());
            expect(Option.isNone(yield* lockfile.entry("skill", SKILL))).toBe(true);

            yield* applySync();

            const accepted = yield* lockfile.entry("skill", SKILL);
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
          const lockfile = yield* LockfileReader;
          const sourceContent = workspace.readFile(`vendor/${SKILL}/src/SKILL.md`);
          const acceptedBefore = yield* lockfile.entry("skill", SKILL);
          expect(Option.isSome(acceptedBefore)).toBe(true);
          workspace.remove("agent_extensions");

          yield* applySync();

          expect(workspace.readFile(CANONICAL)).toBe(sourceContent);
          expect(workspace.exists(CLAUDE_PROJECTION)).toBe(true);
          expect(yield* lockfile.entry("skill", SKILL)).toEqual(acceptedBefore);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("repairs a package materialized under the former source-named layout", () => {
    const registry = makeFileRegistry();
    cleanups.push(registry.cleanup);
    registry.writeSkill(SKILL, [{ version: "1.0.0", body: "Review." }]);
    const workspace = makeSyncFixture({
      settings: {
        owner: "@acme",
        agents: ["claude-code"],
        sources: [registry.source],
        skills: { [SKILL]: `agentxm:@acme/skills/${SKILL}` },
      },
    });
    cleanups.push(workspace.cleanup);
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();
          const canonical = `agent_extensions/registry/@acme/skills/${SKILL}`;
          const former = `agent_extensions/agentxm/@acme/skills/${SKILL}`;
          fs.mkdirSync(path.dirname(path.join(workspace.root, former)), { recursive: true });
          fs.renameSync(path.join(workspace.root, canonical), path.join(workspace.root, former));

          const repaired = expectResolved(yield* applySync());

          expect(deriveOperationOutcome(repaired)).toBe("applied");
          expect(workspace.exists(canonical)).toBe(true);
          expect(workspace.exists(former)).toBe(false);
          expect((yield* applySync())._tag).toBe("AlreadyReconciled");
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
