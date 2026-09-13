import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  applySync,
  expectResolved,
  makeFileRegistry,
  makeSyncFixture,
  previewSync,
  type SyncFixture,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/sync/removes-leftover-installed-packages",
  title: "Sync removes installed packages that desired state no longer includes",
  statement:
    "When an installed package in the install root is reached by no desired route, sync shall plan one removal unit for it naming its identity, canonical path, and that it is not desired, and shall remove that package directory, any accepted record for it, and the agent projections AXM owns for it without following symbolic links out of the install root, leaving desired packages and unrecognized install-root entries untouched, and shall report convergence only when no such package remains.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: ["cli/sync/realizes-desired-state", "cli/sync/preserves-unowned-agent-content"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const BASE = { owner: "@acme", agents: ["claude-code"] };
const STALE = "agent_extensions/agentxm/@acme/skills/stale";

/** A well-formed installed skill package directory, as acquisition writes one. */
const writeInstalledSkill = (base: string, relativeDir: string, name: string): void => {
  const directory = nodePath.join(base, relativeDir);
  fs.mkdirSync(nodePath.join(directory, "src"), { recursive: true });
  fs.writeFileSync(
    nodePath.join(directory, "skill.json"),
    `${JSON.stringify({ owner: "@acme", type: "skill", name, version: "1.0.0", description: `The ${name} skill.` })}\n`,
  );
  fs.writeFileSync(
    nodePath.join(directory, "src", "SKILL.md"),
    `---\nname: "${name}"\ndescription: "The ${name} skill."\n---\n\n# ${name}\n`,
  );
};

const unitIds = (resolution: ReturnType<typeof expectResolved>) =>
  resolution.units.map(({ id }) => id);

describe("Sync removes leftover installed packages", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const fixture = (settings: Readonly<Record<string, unknown>> = BASE): SyncFixture => {
    const workspace = makeSyncFixture({ settings });
    cleanups.push(workspace.cleanup);
    return workspace;
  };

  it.effect(
    "leftover: removes the lockless package and its owned projection in one unit, then converges",
    () => {
      const workspace = fixture();
      writeInstalledSkill(workspace.root, STALE, "stale");
      fs.mkdirSync(nodePath.join(workspace.root, ".claude/skills"), { recursive: true });
      fs.symlinkSync(
        nodePath.join(workspace.root, STALE),
        nodePath.join(workspace.root, ".claude/skills/stale"),
      );
      return workspace
        .provide(
          Effect.gen(function* () {
            const resolution = expectResolved(yield* applySync());
            expect(deriveOperationOutcome(resolution)).toBe("applied");
            const unit = resolution.units.find(({ id }) => id === `leftover:${STALE}`);
            expect(unit?.label).toContain("skill @acme/skills/stale");
            expect(unit?.label).toContain("not desired");
            expect(unit?.artifact?.targets).toEqual([
              expect.objectContaining({ path: STALE, change: "removed" }),
            ]);
            expect(unitIds(resolution).filter((id) => id.startsWith("leftover:"))).toEqual([
              `leftover:${STALE}`,
            ]);
            expect(workspace.exists(STALE)).toBe(false);
            expect(fs.existsSync(nodePath.join(workspace.root, ".claude/skills/stale"))).toBe(
              false,
            );
            expect((yield* applySync())._tag).toBe("AlreadyReconciled");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("plans one removal unit per leftover", () => {
    const workspace = fixture();
    writeInstalledSkill(workspace.root, STALE, "stale");
    writeInstalledSkill(workspace.root, "agent_extensions/agentxm/@acme/subagents/old", "old");
    return workspace
      .provide(
        Effect.gen(function* () {
          const resolution = expectResolved(yield* applySync());
          expect(
            unitIds(resolution)
              .filter((id) => id.startsWith("leftover:"))
              .sort(),
          ).toEqual([
            "leftover:agent_extensions/agentxm/@acme/skills/stale",
            "leftover:agent_extensions/agentxm/@acme/subagents/old",
          ]);
          expect(workspace.exists("agent_extensions/agentxm/@acme/subagents/old")).toBe(false);
          expect(workspace.exists(STALE)).toBe(false);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("modified bytes: local drift in a lockless leftover does not block removal", () => {
    const workspace = fixture();
    writeInstalledSkill(workspace.root, STALE, "stale");
    workspace.writeFile(`${STALE}/src/SKILL.md`, "# Edited locally\n");
    workspace.writeFile(`${STALE}/notes.txt`, "Local notes.\n");
    return workspace
      .provide(
        Effect.gen(function* () {
          const resolution = expectResolved(yield* applySync());
          expect(deriveOperationOutcome(resolution)).toBe("applied");
          expect(workspace.exists(STALE)).toBe(false);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  for (const route of ["directly", "disabled", "through a Pack"] as const) {
    it.effect(`reached ${route}: keeps the installed package and plans no removal`, () => {
      const registry = makeFileRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill("member", [{ version: "1.0.0", body: "Member." }]);
      registry.writePack("toolkit", [
        { version: "1.0.0", dependencies: { "@acme/skills/member": "^1.0.0" } },
      ]);
      const settings = {
        ...BASE,
        sources: [registry.source],
        ...(route === "through a Pack"
          ? { packs: { toolkit: "agentxm:@acme/packs/toolkit@^1.0.0" } }
          : {
              skills: {
                member: {
                  source: "agentxm:@acme/skills/member@^1.0.0",
                  enabled: route === "directly",
                },
              },
            }),
      };
      const workspace = fixture(settings);
      const member = "agent_extensions/agentxm/@acme/skills/member";
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();
            expect(workspace.exists(member)).toBe(true);
            const again = yield* applySync();
            expect(again._tag).toBe("AlreadyReconciled");
            expect(workspace.exists(member)).toBe(true);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    });
  }

  it.effect(
    "same identity in an undesired source directory: removes the copy and keeps the desired package",
    () => {
      const registry = makeFileRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill("review", [{ version: "1.0.0", body: "Review." }]);
      const workspace = fixture({
        ...BASE,
        sources: [registry.source],
        skills: { review: "agentxm:@acme/skills/review@^1.0.0" },
      });
      const desired = "agent_extensions/agentxm/@acme/skills/review";
      const copy = "agent_extensions/elsewhere/@acme/skills/review";
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();
            writeInstalledSkill(workspace.root, copy, "review");
            const resolution = expectResolved(yield* applySync());
            expect(unitIds(resolution)).toContain(`leftover:${copy}`);
            expect(workspace.exists(copy)).toBe(false);
            expect(workspace.exists(desired)).toBe(true);
            expect((yield* applySync())._tag).toBe("AlreadyReconciled");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect(
    "lock-row-only: an accepted record without content is retired with no package removal unit",
    () => {
      const registry = makeFileRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill("review", [{ version: "1.0.0", body: "Review." }]);
      const settings = { ...BASE, sources: [registry.source] };
      const workspace = fixture({
        ...settings,
        skills: { review: "agentxm:@acme/skills/review@^1.0.0" },
      });
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();
            workspace.remove("agent_extensions/agentxm/@acme/skills/review");
            workspace.writeSettings(settings);
            const resolution = expectResolved(yield* applySync());
            expect(unitIds(resolution).some((id) => id.startsWith("leftover:"))).toBe(false);
            expect(workspace.readFile("axm-lock.yaml")).not.toContain("workspaceName: review");
            expect((yield* applySync())._tag).toBe("AlreadyReconciled");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("unrecognized install-root entries are neither removed nor block convergence", () => {
    const workspace = fixture();
    const outside = fs.mkdtempSync(nodePath.join(nodePath.dirname(workspace.root), "axm-outside-"));
    cleanups.push(() => fs.rmSync(outside, { recursive: true, force: true }));
    writeInstalledSkill(outside, "linked", "linked");
    writeInstalledSkill(workspace.root, STALE, "stale");
    workspace.writeFile("agent_extensions/agentxm/notes.txt", "Hand-written.\n");
    workspace.writeFile("agent_extensions/agentxm/loose/SKILL.md", "# Loose\n");
    fs.symlinkSync(
      nodePath.join(outside, "linked"),
      nodePath.join(workspace.root, "agent_extensions/agentxm/@acme/skills/linked"),
    );
    // A link inside a leftover is removed with it, never followed.
    fs.symlinkSync(
      nodePath.join(outside, "linked"),
      nodePath.join(workspace.root, STALE, "escape"),
    );
    const outsideBefore = fs.readdirSync(nodePath.join(outside, "linked"), { recursive: true });
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();
          expect(workspace.exists(STALE)).toBe(false);
          expect(workspace.readFile("agent_extensions/agentxm/notes.txt")).toBe("Hand-written.\n");
          expect(workspace.readFile("agent_extensions/agentxm/loose/SKILL.md")).toBe("# Loose\n");
          expect(
            fs
              .lstatSync(
                nodePath.join(workspace.root, "agent_extensions/agentxm/@acme/skills/linked"),
              )
              .isSymbolicLink(),
          ).toBe(true);
          expect(fs.readdirSync(nodePath.join(outside, "linked"), { recursive: true })).toEqual(
            outsideBefore,
          );
          expect((yield* applySync())._tag).toBe("AlreadyReconciled");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("preview lists the removal units and changes nothing", () => {
    const workspace = fixture();
    writeInstalledSkill(workspace.root, STALE, "stale");
    const before = workspace.snapshot();
    return workspace
      .provide(
        Effect.gen(function* () {
          const resolution = expectResolved(yield* previewSync());
          expect(deriveOperationOutcome(resolution)).toBe("previewed");
          expect(unitIds(resolution)).toContain(`leftover:${STALE}`);
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("user scope: removes a leftover from the user install root", () => {
    const workspace = makeSyncFixture({ scope: "user", settings: { agents: [] } });
    cleanups.push(workspace.cleanup);
    const stale = nodePath.join(workspace.workspaceRoot, STALE);
    writeInstalledSkill(workspace.workspaceRoot, STALE, "stale");
    return workspace
      .provide(
        Effect.gen(function* () {
          const resolution = expectResolved(yield* applySync());
          expect(deriveOperationOutcome(resolution)).toBe("applied");
          expect(fs.existsSync(stale)).toBe(false);
          expect((yield* applySync())._tag).toBe("AlreadyReconciled");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
