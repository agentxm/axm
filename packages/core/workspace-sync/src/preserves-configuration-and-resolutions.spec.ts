import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import YAML from "yaml";

import { deriveOperationOutcome } from "@agentxm/workspace-operations";
import { defineSpecification } from "@agentxm/specification-metadata";

import {
  applySync,
  expectResolved,
  makeFileRegistry,
  makeSyncFixture,
  writeLocalSkillPackage,
  type FileRegistry,
  type SyncFixture,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/sync/preserves-configuration-and-resolutions",
  title: "Sync never changes configuration and never advances a satisfying resolution",
  statement:
    "Sync shall preserve axm.json and authored manifests byte for byte, preserve satisfying accepted resolutions of still-desired extensions, and restore missing acquired content only from the accepted identity even when newer content exists; an incompatible accepted identity shall block until an explicit resolution transition is authorized, and retiring an unreachable accepted record shall not count as advancing a resolution.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const SKILL = "code-review";
const CLAUDE_PROJECTION = `.claude/skills/${SKILL}`;
const CANONICAL = `agent_extensions/local/vendor/${SKILL}`;

describe("Sync preserves configuration and accepted resolutions", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const fixture = (settings: Readonly<Record<string, unknown>>): SyncFixture => {
    const workspace = makeSyncFixture({ settings: { owner: "@acme", ...settings } });
    cleanups.push(workspace.cleanup);
    return workspace;
  };

  const registry = (): FileRegistry => {
    const created = makeFileRegistry();
    cleanups.push(created.cleanup);
    return created;
  };

  it.effect("blocks incompatible accepted authority without advancing it", () => {
    const published = registry();
    published.writeSkill(SKILL, [
      { version: "1.0.0", body: "Accepted." },
      { version: "2.0.0", body: "New." },
    ]);
    const workspace = fixture({
      agents: ["claude-code"],
      sources: [published.source],
      skills: { [SKILL]: `@acme/skills/${SKILL}@^1.0.0` },
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();
          workspace.writeSettings({
            ...workspace.readSettings(),
            skills: { [SKILL]: `@acme/skills/${SKILL}@^2.0.0` },
          });
          const before = workspace.snapshot();
          const failure = yield* applySync().pipe(Effect.flip);
          expect(failure._tag).toBe("WorkspaceSyncFailed");
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("preserves the requested Pack range during first acquisition", () => {
    const published = registry();
    published.writePack("toolkit", [{ version: "1.0.0", dependencies: {} }]);
    const workspace = fixture({
      agents: ["claude-code"],
      sources: [published.source],
      packs: { toolkit: "agentxm:@acme/packs/toolkit@^1.0.0" },
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const before = workspace.readFile("axm.json");
          expect(deriveOperationOutcome(expectResolved(yield* applySync()))).toBe("applied");
          expect(workspace.readFile("axm.json")).toBe(before);
          expect((yield* applySync())._tag).toBe("AlreadyReconciled");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("preserves equivalent repository serialization and reports no work", () => {
    const workspace = fixture({
      agents: ["claude-code"],
      skills: { [SKILL]: `./vendor/${SKILL}` },
    });
    writeLocalSkillPackage(workspace.root, { name: SKILL });
    return workspace
      .provide(
        Effect.gen(function* () {
          yield* applySync();

          // The repository re-serializes both documents equivalently: four
          // spaces, and a comment the owner added to the lockfile.
          const settingsBefore = `${JSON.stringify(workspace.readSettings(), null, 4)}\n`;
          workspace.writeFile("axm.json", settingsBefore);
          const decodedLockfile: unknown = YAML.parse(workspace.readFile("axm-lock.yaml"));
          const lockfileBefore = `# Repository-owned YAML serialization\n${YAML.stringify(
            decodedLockfile,
            { indent: 4 },
          )}`;
          workspace.writeFile("axm-lock.yaml", lockfileBefore);

          const outcome = yield* applySync();

          expect(workspace.readFile("axm.json")).toBe(settingsBefore);
          expect(workspace.readFile("axm-lock.yaml")).toBe(lockfileBefore);
          expect(outcome._tag).toBe("AlreadyReconciled");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect(
    "restores realized state from the accepted resolution instead of an available newer version",
    () => {
      const published = registry();
      published.writeSkill(SKILL, [{ version: "1.0.0", body: "First guidance." }]);
      const workspace = fixture({
        agents: ["claude-code"],
        sources: [published.source],
        skills: { [SKILL]: `@acme/skills/${SKILL}` },
      });
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();
            expect(workspace.readFile(`${CLAUDE_PROJECTION}/SKILL.md`)).toContain(
              "First guidance.",
            );

            published.writeSkill(SKILL, [
              { version: "2.0.0", body: "Second guidance." },
              { version: "1.0.0", body: "First guidance." },
            ]);
            const settingsBefore = JSON.stringify(workspace.readSettings());
            const lockfileBefore = workspace.readFile("axm-lock.yaml");
            workspace.remove(CLAUDE_PROJECTION);

            yield* applySync();

            expect(workspace.readFile(`${CLAUDE_PROJECTION}/SKILL.md`)).toContain(
              "First guidance.",
            );
            expect(workspace.readFile("axm-lock.yaml")).toBe(lockfileBefore);
            expect(JSON.stringify(workspace.readSettings())).toBe(settingsBefore);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  // The two decisive rows are the canonical states a restoration can face —
  // edited in place, and gone entirely. Which source file changed underneath
  // is supporting coverage that settles no further ambiguity.
  const rows = [
    { canonicalState: "modified", changedSourceFile: "notes.txt" },
    { canonicalState: "modified", changedSourceFile: "src/SKILL.md" },
    { canonicalState: "missing", changedSourceFile: "notes.txt" },
    { canonicalState: "missing", changedSourceFile: "src/SKILL.md" },
  ] as const;

  it.effect.each(rows)(
    "preserves accepted state when $canonicalState content cannot be restored after source $changedSourceFile changes",
    ({ canonicalState, changedSourceFile }) => {
      const workspace = fixture({
        agents: ["claude-code"],
        skills: { [SKILL]: `./vendor/${SKILL}` },
      });
      const source = writeLocalSkillPackage(workspace.root, { name: SKILL });
      fs.writeFileSync(nodePath.join(source, "notes.txt"), "Accepted companion content.\n");
      return workspace
        .provide(
          Effect.gen(function* () {
            yield* applySync();

            if (canonicalState === "missing") {
              workspace.remove(CANONICAL);
            } else {
              workspace.writeFile(`${CANONICAL}/notes.txt`, "Local edits to preserve.\n");
            }
            fs.appendFileSync(
              nodePath.join(source, changedSourceFile),
              "Source content changed after acceptance.\n",
            );
            const before = workspace.snapshot();

            const resolution = expectResolved(yield* applySync());

            // One typed outcome, not a hedge: the reconciliation settles, the
            // restoration unit fails with a conflict, and the closure restores
            // everything it touched.
            expect(deriveOperationOutcome(resolution)).toBe("failed");
            expect(resolution.failure?.category).toBe("conflict");
            expect(resolution.units).toEqual([
              expect.objectContaining({
                id: `skill:${SKILL}`,
                state: "failed",
                disposition: "restored",
              }),
            ]);
            expect(resolution.atomicity).toEqual({
              declared: "closure-atomic",
              applied: "closure-atomic",
            });
            expect(workspace.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );
});
