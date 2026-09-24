import * as fs from "node:fs";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import * as net from "node:net";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import YAML from "yaml";

import { deriveOperationOutcome } from "../../transitions/planning/index.js";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  SHARED_MEMBER,
  SHARED_MEMBER_PACKS,
  SHARED_MEMBER_PIN,
  publishSharedMemberScenario,
  sharedMemberBody,
  sharedMemberOutsidePinFact,
  sharedMemberSettings,
} from "../../desired-state/workspace/test-helpers.js";

import {
  applySync,
  expectResolved,
  makeFileRegistry,
  makeSyncFixture,
  previewSync,
  writeLocalSkillPackage,
  type FileRegistry,
  type SyncFixture,
} from "./test-helpers.js";

export const specification = defineSpecification({
  requirement: "cli/sync/preserves-configuration-and-resolutions",
  title: "Sync never changes configuration and never advances a satisfying resolution",
  statement:
    "Sync shall preserve axm.json and authored manifests byte for byte, preserve satisfying accepted resolutions of still-desired extensions, restore missing acquired content only from the accepted identity even when newer content exists, and select every member of a configured Pack it recovers within that member's effective desired constraint so that a direct pin on a shared member holds; an incompatible accepted identity shall block until an explicit resolution transition is authorized, and retiring an unreachable accepted record shall not count as advancing a resolution.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "safe-repetition"],
  methods: ["example"],
  derivedFrom: ["workspace/desired-state/effective-constraint-has-one-owner"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const SKILL = "code-review";
const CLAUDE_PROJECTION = `.claude/skills/${SKILL}`;
const CANONICAL = `agent_extensions/path/@acme/skills/${SKILL}`;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const availablePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Expected an allocated TCP port"));
        return;
      }
      server.close((error) => (error === undefined ? resolve(address.port) : reject(error)));
    });
  });

const awaitGitDaemon = (process: ChildProcess): Promise<void> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Git fixture did not become ready")), 5_000);
    const ready = (chunk: Buffer) => {
      if (!chunk.toString().includes("Ready to rumble")) return;
      clearTimeout(timeout);
      resolve();
    };
    process.stderr?.on("data", ready);
    process.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Git fixture exited before readiness with status ${String(code)}`));
    });
  });

const gitRepository = () =>
  Effect.promise(async () => {
    const root = fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-sync-git-"));
    const source = nodePath.join(root, "source");
    const repository = nodePath.join(root, "review.git");
    fs.mkdirSync(source);
    writeLocalSkillPackage(source, { name: SKILL, description: "Accepted guidance." });
    const git = (args: ReadonlyArray<string>, cwd = source): string =>
      execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
    git(["init", "--quiet", "--initial-branch=main"]);
    git(["config", "user.email", "test@example.com"]);
    git(["config", "user.name", "Test"]);
    git(["add", "."]);
    git(["commit", "--quiet", "-m", "accepted"]);
    const acceptedCommit = git(["rev-parse", "HEAD"]);
    git(["clone", "--quiet", "--bare", source, repository], root);
    const port = await availablePort();
    const daemon = spawn(
      "git",
      [
        "daemon",
        "--verbose",
        "--reuseaddr",
        "--export-all",
        `--base-path=${root}`,
        "--listen=127.0.0.1",
        `--port=${String(port)}`,
        root,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    try {
      await awaitGitDaemon(daemon);
    } catch (error) {
      daemon.kill();
      fs.rmSync(root, { recursive: true, force: true });
      throw error;
    }
    return {
      url: `git://127.0.0.1:${String(port)}/review.git`,
      acceptedCommit,
      advance: () => {
        fs.appendFileSync(
          nodePath.join(source, "vendor", SKILL, "src", "SKILL.md"),
          "\nNew guidance.\n",
        );
        git(["add", "."]);
        git(["commit", "--quiet", "-m", "newer"]);
        git(["push", repository, "main"]);
      },
      replaceHistory: () => {
        git(["checkout", "--quiet", "--orphan", "replacement"]);
        fs.appendFileSync(
          nodePath.join(source, "vendor", SKILL, "src", "SKILL.md"),
          "\nUnrelated history.\n",
        );
        git(["add", "."]);
        git(["commit", "--quiet", "-m", "replacement"]);
        git(["push", "--force", repository, "HEAD:main"]);
        git(["reflog", "expire", "--expire=now", "--all"], repository);
        git(["gc", "--prune=now"], repository);
      },
      cleanup: () => {
        daemon.kill();
        fs.rmSync(root, { recursive: true, force: true });
      },
    };
  });

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

  it.effect(
    "blocks an accepted Pack member a later direct pin excludes, stating the fact install states",
    () => {
      const published = registry();
      publishSharedMemberScenario(published);
      const configured = {
        agents: ["claude-code"],
        sources: [published.source],
        packs: Object.fromEntries(SHARED_MEMBER_PACKS.map((pack) => [pack.name, pack.fqn])),
      };
      const workspace = fixture(configured);
      return workspace
        .provide(
          Effect.gen(function* () {
            // Both Packs accept the newest member version they admit, then the
            // person pins the member directly, in the form install records.
            yield* applySync();
            expect(workspace.readFile("axm-lock.yaml")).toContain("version: 1.2.0");
            workspace.writeSettings({
              owner: "@acme",
              ...configured,
              skills: {
                [SHARED_MEMBER.name]: `${published.source.name}:${SHARED_MEMBER.fqn}@${SHARED_MEMBER_PIN.inside}`,
              },
            });
            const before = workspace.snapshot();

            const failure = yield* applySync().pipe(Effect.flip);

            expect(failure).toMatchObject({
              _tag: "WorkspaceSyncFailed",
              detail: sharedMemberOutsidePinFact({
                registry: published.source.name,
                pin: SHARED_MEMBER_PIN.inside,
                acceptedVersion: "1.2.0",
              }),
            });
            expect(workspace.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect(
    "restores a missing Git package from the accepted commit after the branch advances",
    () =>
      Effect.gen(function* () {
        const remote = yield* gitRepository();
        cleanups.push(remote.cleanup);
        const workspace = fixture({
          agents: ["claude-code"],
          skills: { [SKILL]: remote.url },
        });
        const canonical = `agent_extensions/git/@acme/skills/${SKILL}`;
        yield* workspace.provide(
          Effect.gen(function* () {
            expect(deriveOperationOutcome(expectResolved(yield* applySync()))).toBe("applied");
            expect(workspace.readFile(`${canonical}/src/SKILL.md`)).toContain("Accepted guidance.");
            const settingsBefore = workspace.readFile("axm.json");
            const lockBefore = workspace.readFile("axm-lock.yaml");
            expect(lockBefore).toContain(remote.acceptedCommit);

            workspace.remove(canonical);
            remote.advance();
            const beforePreview = workspace.snapshot();
            expect(deriveOperationOutcome(expectResolved(yield* previewSync()))).toBe("previewed");
            expect(workspace.snapshot()).toEqual(beforePreview);
            const restored = expectResolved(yield* applySync());
            expect(deriveOperationOutcome(restored), JSON.stringify(restored.failure)).toBe(
              "applied",
            );
            expect(workspace.readFile(`${canonical}/src/SKILL.md`)).toContain("Accepted guidance.");
            expect(workspace.readFile(`${canonical}/src/SKILL.md`)).not.toContain("New guidance.");
            expect(workspace.readFile("axm.json")).toBe(settingsBefore);
            expect(workspace.readFile("axm-lock.yaml")).toBe(lockBefore);
            expect((yield* applySync())._tag).toBe("AlreadyReconciled");
          }),
        );
      }).pipe(Effect.provide(NodeServices.layer)),
    { timeout: 15_000 },
  );

  it.effect("repairs a stale Git projection without recopying current accepted content", () =>
    Effect.gen(function* () {
      const remote = yield* gitRepository();
      cleanups.push(remote.cleanup);
      const workspace = fixture({
        agents: ["claude-code"],
        skills: { [SKILL]: remote.url },
      });
      yield* workspace.provide(
        Effect.gen(function* () {
          expect(deriveOperationOutcome(expectResolved(yield* applySync()))).toBe("applied");
          const canonicalFile = nodePath.join(
            workspace.root,
            "agent_extensions/git/@acme/skills",
            SKILL,
            "src/SKILL.md",
          );
          const retainedTime = new Date("2001-01-01T00:00:00.000Z");
          fs.utimesSync(canonicalFile, retainedTime, retainedTime);
          const before = fs.statSync(canonicalFile).mtimeMs;
          const settings = workspace.readFile("axm.json");
          const lock = workspace.readFile("axm-lock.yaml");

          workspace.remove(CLAUDE_PROJECTION);
          remote.replaceHistory();
          expect(deriveOperationOutcome(expectResolved(yield* applySync()))).toBe("applied");
          expect(workspace.readFile(`${CLAUDE_PROJECTION}/SKILL.md`)).toContain(
            "Accepted guidance.",
          );
          expect(fs.statSync(canonicalFile).mtimeMs).toBe(before);
          expect(workspace.readFile("axm.json")).toBe(settings);
          expect(workspace.readFile("axm-lock.yaml")).toBe(lock);
          expect((yield* applySync())._tag).toBe("AlreadyReconciled");
        }),
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("refuses missing Git restoration when the accepted commit is unreachable", () =>
    Effect.gen(function* () {
      const remote = yield* gitRepository();
      cleanups.push(remote.cleanup);
      const workspace = fixture({
        agents: ["claude-code"],
        skills: { [SKILL]: remote.url },
      });
      yield* workspace.provide(
        Effect.gen(function* () {
          expect(deriveOperationOutcome(expectResolved(yield* applySync()))).toBe("applied");
          workspace.remove(`agent_extensions/git/@acme/skills/${SKILL}`);
          remote.replaceHistory();
          const before = workspace.snapshot();
          const refusal = yield* applySync().pipe(Effect.flip);
          expect(refusal._tag).toBe("WorkspaceSyncFailed");
          if (refusal._tag !== "WorkspaceSyncFailed") {
            throw new Error(`Expected a sync refusal, got ${refusal._tag}`);
          }
          expect(refusal.category).toBe("conflict");
          expect(refusal.detail).toContain(remote.acceptedCommit);
          expect(workspace.snapshot()).toEqual(before);
        }),
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect.each(["missing-subpath", "tree-mismatch"] as const)(
    "refuses Git restoration for $0 without changing accepted workspace state",
    (invalid) =>
      Effect.gen(function* () {
        const remote = yield* gitRepository();
        cleanups.push(remote.cleanup);
        const workspace = fixture({
          agents: ["claude-code"],
          skills: { [SKILL]: remote.url },
        });
        yield* workspace.provide(
          Effect.gen(function* () {
            expect(deriveOperationOutcome(expectResolved(yield* applySync()))).toBe("applied");
            const lock: unknown = YAML.parse(workspace.readFile("axm-lock.yaml"));
            if (!isRecord(lock) || !isRecord(lock["skills"])) {
              throw new Error("Expected skill lock entry");
            }
            const entry = lock["skills"][SKILL];
            if (!isRecord(entry) || !isRecord(entry["source"]) || !isRecord(entry["resolved"])) {
              throw new Error("Expected Git source and resolution");
            }
            if (invalid === "missing-subpath") {
              entry["source"]["path"] = "vendor/missing";
            } else {
              entry["resolved"]["tree"] = "0".repeat(40);
            }
            workspace.writeFile("axm-lock.yaml", YAML.stringify(lock));
            workspace.remove(`agent_extensions/git/@acme/skills/${SKILL}`);
            const before = workspace.snapshot();
            const refusal = yield* applySync().pipe(Effect.flip);
            expect(refusal._tag).toBe("WorkspaceSyncFailed");
            if (refusal._tag !== "WorkspaceSyncFailed") {
              throw new Error(`Expected a sync refusal, got ${refusal._tag}`);
            }
            expect(refusal.detail, JSON.stringify(refusal)).toContain("accepted Git commit");
            expect(workspace.snapshot()).toEqual(before);
          }),
        );
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("preserves the requested Pack range during first acquisition", () => {
    const published = registry();
    published.writePack("toolkit", [{ version: "1.0.0", dependencies: {} }]);
    const workspace = fixture({
      agents: ["claude-code"],
      sources: [published.source],
      packs: { toolkit: "test:@acme/packs/toolkit@^1.0.0" },
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

  it.effect("recovers never-accepted Packs within a direct pin on their shared member", () => {
    const published = registry();
    publishSharedMemberScenario(published);
    const workspace = fixture({
      agents: ["claude-code"],
      sources: [published.source],
      ...sharedMemberSettings(SHARED_MEMBER_PIN.inside),
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const settingsBefore = workspace.readFile("axm.json");

          expect(deriveOperationOutcome(expectResolved(yield* applySync()))).toBe("applied");

          // Both Packs admit 1.2.0, but the direct pin is a contributor too:
          // recovery and the direct entry settle on the one version all admit.
          const lock: unknown = YAML.parse(workspace.readFile("axm-lock.yaml"));
          if (!isRecord(lock) || !isRecord(lock["skills"])) {
            throw new Error("Expected skill lock entries");
          }
          expect(lock["skills"][SHARED_MEMBER.name]).toMatchObject({
            resolved: { version: SHARED_MEMBER_PIN.inside },
          });
          expect(workspace.readFile(`.claude/skills/${SHARED_MEMBER.name}/SKILL.md`)).toContain(
            sharedMemberBody(SHARED_MEMBER_PIN.inside),
          );
          expect(workspace.readFile("axm.json")).toBe(settingsBefore);
          // Nothing is left to downgrade: the next run has no work.
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
