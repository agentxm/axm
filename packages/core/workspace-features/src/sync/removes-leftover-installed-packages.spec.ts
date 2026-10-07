import { fileRegistryPackagePath } from "../testing/install-world.js";
import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import { defineSpecification } from "@agentxm/specification-metadata";
import { LockfileReader } from "@agentxm/workspace-kernel/workspace-state";

import {
  applySync,
  expectResolved,
  makeFileRegistry,
  makeSyncFixture,
  previewSync,
  type SyncFixture,
} from "../testing/sync-fixture.js";

export const specification = defineSpecification({
  requirement: "cli/sync/removes-leftover-installed-packages",
  title: "Sync removes installed packages that desired state no longer includes",
  statement:
    "When a package proven by accepted metadata in the install root is reached by no desired route, sync shall preview its canonical path for removal as unreachable acquired content, and shall remove that package directory, any accepted record for it, and the agent projections AXM owns for it without following symbolic links out of the install root, leaving desired packages and unproven install-root content untouched even after total accepted metadata loss, and shall report convergence only when no such package remains.",
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
const STALE = "agent_extensions/registry.agentxm.ai/@acme/skills/stale";

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

  it.effect("preserves a package-shaped tree after accepted metadata is lost", () => {
    const workspace = fixture();
    writeInstalledSkill(workspace.root, STALE, "stale");
    return workspace
      .provide(
        Effect.gen(function* () {
          const before = workspace.readFile(`${STALE}/src/SKILL.md`);
          yield* applySync();
          expect(workspace.readFile(`${STALE}/src/SKILL.md`)).toBe(before);
          expect((yield* applySync())._tag).toBe("AlreadyReconciled");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect.each([false, true])(
    "retires stale content after first accepting shared Packs (accepted stale row: %s)",
    (accepted) => {
      const registry = makeFileRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill("stale", [{ version: "1.0.0", body: "Stale." }]);
      registry.writeSkill("member", [{ version: "1.0.0", body: "Member." }]);
      for (const name of ["first", "second"]) {
        registry.writePack(name, [
          { version: "1.0.0", dependencies: { "@acme/skills/member": "^1.0.0" } },
        ]);
      }
      const settings = { ...BASE, sources: [registry.source] };
      const workspace = fixture({
        ...settings,
        ...(accepted ? { skills: { stale: "test:@acme/skills/stale@^1.0.0" } } : {}),
      });
      return workspace
        .provide(
          Effect.gen(function* () {
            if (accepted) yield* applySync();
            else writeInstalledSkill(workspace.root, STALE, "stale");
            workspace.writeSettings({
              ...settings,
              packs: {
                first: "test:@acme/packs/first@^1.0.0",
                second: "test:@acme/packs/second@^1.0.0",
              },
            });
            const before = workspace.snapshot();
            expect(deriveOperationOutcome(expectResolved(yield* previewSync()))).toBe("previewed");
            expect(workspace.snapshot()).toEqual(before);

            const resolution = expectResolved(yield* applySync());
            expect(deriveOperationOutcome(resolution)).toBe("applied");
            expect(
              workspace.exists(
                accepted ? fileRegistryPackagePath(registry, "skills", "stale") : STALE,
              ),
            ).toBe(!accepted);
            expect(Option.isNone(yield* (yield* LockfileReader).entry("skill", "stale"))).toBe(
              true,
            );
            expect(workspace.exists(fileRegistryPackagePath(registry, "skills", "member"))).toBe(
              true,
            );
            for (const name of ["first", "second"]) {
              expect(workspace.exists(fileRegistryPackagePath(registry, "packs", name))).toBe(true);
            }
            expect((yield* applySync())._tag).toBe("AlreadyReconciled");
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("plans one removal per accepted package and preserves unknown siblings", () => {
    const registry = makeFileRegistry();
    cleanups.push(registry.cleanup);
    for (const name of ["stale", "old"])
      registry.writeSkill(name, [{ version: "1.0.0", body: name }]);
    const settings = { ...BASE, sources: [registry.source] };
    const workspace = fixture({
      ...settings,
      skills: {
        stale: "test:@acme/skills/stale@^1.0.0",
        old: "test:@acme/skills/old@^1.0.0",
      },
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();
          workspace.writeFile("agent_extensions/registry.agentxm.ai/notes.txt", "Keep");
          workspace.writeSettings(settings);
          const before = workspace.snapshot();
          const preview = expectResolved(yield* previewSync());
          expect(
            preview.units
              .flatMap((unit) => unit.artifact?.targets ?? [])
              .filter(
                (target) =>
                  target.change === "removed" && target.path.startsWith("agent_extensions/"),
              )
              .map((target) => target.path)
              .sort(),
          ).toEqual([
            fileRegistryPackagePath(registry, "skills", "old"),
            fileRegistryPackagePath(registry, "skills", "stale"),
          ]);
          expect(workspace.snapshot()).toEqual(before);
          const applied = expectResolved(yield* applySync());
          expect(deriveOperationOutcome(applied)).toBe("applied");
          expect(workspace.exists(fileRegistryPackagePath(registry, "skills", "stale"))).toBe(
            false,
          );
          for (const name of ["old", "stale"]) {
            expect(workspace.exists(`.claude/skills/${name}`)).toBe(false);
            expect(workspace.exists(`.agents/skills/${name}`)).toBe(false);
          }
          expect(workspace.exists(fileRegistryPackagePath(registry, "skills", "old"))).toBe(false);
          expect(workspace.readFile("agent_extensions/registry.agentxm.ai/notes.txt")).toBe("Keep");
          expect(Option.isNone(yield* (yield* LockfileReader).entry("skill", "stale"))).toBe(true);
          expect((yield* applySync())._tag).toBe("AlreadyReconciled");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("preserves locally modified bytes without accepted ownership", () => {
    const workspace = fixture();
    writeInstalledSkill(workspace.root, STALE, "stale");
    workspace.writeFile(`${STALE}/src/SKILL.md`, "# Edited locally\n");
    workspace.writeFile(`${STALE}/notes.txt`, "Local notes.\n");
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();
          expect(workspace.readFile(`${STALE}/src/SKILL.md`)).toBe("# Edited locally\n");
          expect(workspace.readFile(`${STALE}/notes.txt`)).toBe("Local notes.\n");
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
          ? { packs: { toolkit: "test:@acme/packs/toolkit@^1.0.0" } }
          : {
              skills: {
                member: {
                  source: "test:@acme/skills/member@^1.0.0",
                  enabled: route === "directly",
                },
              },
            }),
      };
      const workspace = fixture(settings);
      const member = fileRegistryPackagePath(registry, "skills", "member");
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

  it.effect("same identity in an unproven source directory: preserves both trees", () => {
    const registry = makeFileRegistry();
    cleanups.push(registry.cleanup);
    registry.writeSkill("review", [{ version: "1.0.0", body: "Review." }]);
    const workspace = fixture({
      ...BASE,
      sources: [registry.source],
      skills: { review: "test:@acme/skills/review@^1.0.0" },
    });
    const desired = fileRegistryPackagePath(registry, "skills", "review");
    const copy = "agent_extensions/elsewhere/@acme/skills/review";
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();
          writeInstalledSkill(workspace.root, copy, "review");
          yield* applySync();
          expect(workspace.exists(copy)).toBe(true);
          expect(workspace.exists(desired)).toBe(true);
          expect((yield* applySync())._tag).toBe("AlreadyReconciled");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "lock-row-only: an accepted record without content is retired with no package removal unit",
    () => {
      const registry = makeFileRegistry();
      cleanups.push(registry.cleanup);
      registry.writeSkill("review", [{ version: "1.0.0", body: "Review." }]);
      const settings = { ...BASE, sources: [registry.source] };
      const workspace = fixture({
        ...settings,
        skills: { review: "test:@acme/skills/review@^1.0.0" },
      });
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();
            workspace.remove(fileRegistryPackagePath(registry, "skills", "review"));
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
    workspace.writeFile("agent_extensions/registry.agentxm.ai/notes.txt", "Hand-written.\n");
    workspace.writeFile("agent_extensions/registry.agentxm.ai/loose/SKILL.md", "# Loose\n");
    fs.symlinkSync(
      nodePath.join(outside, "linked"),
      nodePath.join(workspace.root, "agent_extensions/registry.agentxm.ai/@acme/skills/linked"),
    );
    // An unproven tree and its contained link are preserved, never followed.
    fs.symlinkSync(
      nodePath.join(outside, "linked"),
      nodePath.join(workspace.root, STALE, "escape"),
    );
    const outsideBefore = fs.readdirSync(nodePath.join(outside, "linked"), { recursive: true });
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();
          expect(workspace.exists(STALE)).toBe(true);
          expect(workspace.readFile("agent_extensions/registry.agentxm.ai/notes.txt")).toBe(
            "Hand-written.\n",
          );
          expect(workspace.readFile("agent_extensions/registry.agentxm.ai/loose/SKILL.md")).toBe(
            "# Loose\n",
          );
          expect(
            fs
              .lstatSync(
                nodePath.join(
                  workspace.root,
                  "agent_extensions/registry.agentxm.ai/@acme/skills/linked",
                ),
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

  it.effect("user scope: preserves unproven packages in the user install root", () => {
    const workspace = makeSyncFixture({ scope: "user", settings: { agents: [] } });
    cleanups.push(workspace.cleanup);
    const stale = nodePath.join(workspace.workspaceRoot, STALE);
    writeInstalledSkill(workspace.workspaceRoot, STALE, "stale");
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();
          expect(fs.existsSync(stale)).toBe(true);
          expect((yield* applySync())._tag).toBe("AlreadyReconciled");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
