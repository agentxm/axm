import { execFileSync } from "node:child_process";
import * as Option from "effect/Option";
import { LockfileReader } from "@agentxm/workspace-kernel/workspace-state";
import { serveBareRepository } from "../testing/git-repositories.js";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { HandoffSkills } from "./index.js";
import { makeLifecycleFixture } from "./testing.js";

export const specification = defineSpecification({
  requirement: "cli/skills/handoff-preserves-selected-ownership",
  title: "Management handoff transfers only verified selected installations",
  statement:
    "Explicit Skills-manager handoff shall transfer selected verified native installations and their source tracking into AXM, retire only their former manager records, and preserve unrelated records and unknown fields. Modified installations and stale ownership evidence shall be refused without changing either manager's state; content or folder hashes shall never be treated as historical Git commits.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "workspace-intent-fidelity", "safe-repetition"],
  methods: ["example", "decision-table"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Skills management handoff", () => {
  for (const scope of ["project", "user"] as const) {
    for (const condition of [
      "clean",
      "modified",
      "stale",
      "rollback",
      "linked-lock-rollback",
      "unsupported",
    ] as const) {
      it.effect(`${scope}: ${condition}`, () =>
        Effect.gen(function* () {
          const workspace = yield* Effect.acquireRelease(
            Effect.sync(() =>
              makeLifecycleFixture({
                scope,
                sources: "live",
                settings: { agents: ["claude-code"] },
              }),
            ),
            (workspace) => Effect.sync(() => workspace.cleanup()),
          );
          const source = path.join(workspace.root, "upstream", "review");
          const nativeRoot = scope === "project" ? workspace.root : workspace.home;
          const canonical = path.join(nativeRoot, ".agents", "skills", "review");
          const projection = path.join(nativeRoot, ".claude", "skills", "review");
          const body = "---\nname: review\ncustom: untouched\n---\n# Review\n";
          fs.mkdirSync(source, { recursive: true });
          fs.mkdirSync(canonical, { recursive: true });
          fs.mkdirSync(path.dirname(projection), { recursive: true });
          fs.writeFileSync(path.join(source, "SKILL.md"), body);
          fs.writeFileSync(
            path.join(canonical, "SKILL.md"),
            condition === "modified" ? `${body}Local edits\n` : body,
          );
          fs.symlinkSync(path.relative(path.dirname(projection), canonical), projection);
          const unknown = { source: "future:unrecognized", future: { retain: true } };
          const oldLock = {
            version: scope === "project" ? 1 : 3,
            custom: "retain",
            skills: {
              review: {
                source,
                sourceType: condition === "unsupported" ? "future" : "local",
                computedHash: createHash("sha256").update("SKILL.md").update(body).digest("hex"),
              },
              unrelated: unknown,
            },
          };
          const lockPath = path.join(
            nativeRoot,
            scope === "project" ? "skills-lock.json" : ".agents/.skill-lock.json",
          );
          const storage =
            condition === "linked-lock-rollback"
              ? path.join(workspace.root, "manager-state.json")
              : lockPath;
          fs.writeFileSync(storage, JSON.stringify(oldLock));
          if (storage !== lockPath)
            fs.symlinkSync(path.relative(path.dirname(lockPath), storage), lockPath);
          const readState = (name: string) =>
            fs.readFileSync(path.join(workspace.workspaceRoot, name), "utf8");
          const settingsBefore = readState("axm.json");
          const acceptedBefore = readState("axm-lock.yaml");
          const filesystem = yield* FileSystem.FileSystem;
          const prepare = HandoffSkills.prepare({ lockPath, skills: ["review"], all: false }).pipe(
            Effect.provideService(
              FileSystem.FileSystem,
              condition.endsWith("rollback")
                ? {
                    ...filesystem,
                    writeFileString: (target, contents, options) =>
                      target === lockPath ||
                      target === storage ||
                      target.startsWith(`${lockPath}.tmp.`) ||
                      target.startsWith(`${storage}.tmp.`)
                        ? filesystem.writeFileString(target, "partial write").pipe(
                            Effect.andThen(
                              Effect.fail(
                                PlatformError.systemError({
                                  _tag: "PermissionDenied",
                                  module: "FileSystem",
                                  method: "writeFileString",
                                  pathOrDescriptor: target,
                                  description: "Exercise manager-lock failure after installation.",
                                }),
                              ),
                            ),
                          )
                        : filesystem.writeFileString(target, contents, options),
                  }
                : filesystem,
            ),
          );
          if (condition === "modified" || condition === "unsupported") {
            yield* workspace.provide(prepare).pipe(Effect.flip);
          } else {
            const candidate = yield* workspace.provide(prepare);
            expect(fs.readFileSync(lockPath, "utf8")).toBe(JSON.stringify(oldLock));
            if (condition === "stale") {
              fs.appendFileSync(path.join(canonical, "SKILL.md"), "Changed after preview\n");
              const stale = yield* workspace.provide(
                HandoffSkills.previewOrApply(candidate, preapprovedPlanExecution),
              );
              expect(stale.blocking?.class).toBe("stale-candidate");
            } else if (condition.endsWith("rollback")) {
              const result = yield* workspace.provide(
                HandoffSkills.previewOrApply(candidate, preapprovedPlanExecution),
              );
              expect(result.units[0]?.state).toBe("failed");
              expect(fs.readFileSync(path.join(canonical, "SKILL.md"), "utf8")).toBe(body);
            } else {
              const result = yield* workspace.provide(
                HandoffSkills.previewOrApply(candidate, preapprovedPlanExecution),
              );
              expect(result.units[0]?.state).toBe("committed");
              const retained: unknown = JSON.parse(fs.readFileSync(lockPath, "utf8"));
              expect(retained).toEqual({
                version: scope === "project" ? 1 : 3,
                custom: "retain",
                skills: { unrelated: unknown },
              });
              expect(fs.readFileSync(path.join(projection, "SKILL.md"), "utf8")).toBe(body);
              expect(fs.realpathSync(projection)).not.toBe(canonical);
              const settings: unknown = JSON.parse(readState("axm.json"));
              expect(settings).toHaveProperty("skills.review");
              return;
            }
          }
          expect(readState("axm.json")).toBe(settingsBefore);
          expect(readState("axm-lock.yaml")).toBe(acceptedBefore);
          expect(fs.readFileSync(lockPath, "utf8")).toBe(JSON.stringify(oldLock));
          expect(fs.lstatSync(projection).isSymbolicLink()).toBe(true);
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
      );
    }
  }

  for (const scope of ["project", "user"] as const) {
    it.effect(
      `${scope}: transfers two Git selections without treating folder hashes as commits`,
      () =>
        Effect.gen(function* () {
          const workspace = yield* Effect.acquireRelease(
            Effect.sync(() =>
              makeLifecycleFixture({
                scope,
                sources: "live",
                settings: { agents: ["claude-code"] },
              }),
            ),
            (workspace) => Effect.sync(() => workspace.cleanup()),
          );
          const source = path.join(workspace.root, "upstream");
          const nativeRoot = scope === "project" ? workspace.root : workspace.home;
          const names = ["review", "explain"];
          const body = (name: string) => `---\nname: ${name}\ncustom: unchanged\n---\n# ${name}\n`;
          for (const name of names) {
            const skill = path.join(source, "skills", name);
            const native = path.join(nativeRoot, ".agents", "skills", name);
            const projected = path.join(nativeRoot, ".claude", "skills", name);
            fs.mkdirSync(skill, { recursive: true });
            fs.mkdirSync(native, { recursive: true });
            fs.mkdirSync(path.dirname(projected), { recursive: true });
            fs.writeFileSync(path.join(skill, "SKILL.md"), body(name));
            fs.writeFileSync(path.join(native, "SKILL.md"), body(name));
            fs.symlinkSync(path.relative(path.dirname(projected), native), projected);
          }
          const git = (args: ReadonlyArray<string>) =>
            execFileSync("git", args, { cwd: source, encoding: "utf8" }).trim();
          git(["init", "--quiet", "--initial-branch=main"]);
          git(["config", "user.email", "test@example.com"]);
          git(["config", "user.name", "Test"]);
          git(["add", "."]);
          git(["commit", "--quiet", "-m", "source skills"]);
          const commit = git(["rev-parse", "HEAD"]);
          const served = yield* Effect.acquireRelease(
            Effect.promise(() =>
              serveBareRepository({ root: workspace.root, source, name: "handoff" }),
            ),
            (repository) => Effect.sync(() => repository.stop()),
          );
          const foreignHash = "a".repeat(40);
          const unknown = { sourceType: "future", source: "opaque", extra: { retain: true } };
          const lockPath = path.join(
            nativeRoot,
            scope === "project" ? "skills-lock.json" : ".agents/.skill-lock.json",
          );
          const original = JSON.stringify({
            version: scope === "project" ? 1 : 3,
            custom: "retain",
            skills: {
              ...Object.fromEntries(
                names.map((name) => [
                  name,
                  {
                    source: served.url,
                    sourceUrl: served.url,
                    sourceType: "git",
                    ref: "main",
                    skillPath: `skills/${name}/SKILL.md`,
                    ...(scope === "project"
                      ? {
                          computedHash: createHash("sha256")
                            .update("SKILL.md")
                            .update(body(name))
                            .digest("hex"),
                        }
                      : { skillFolderHash: foreignHash }),
                  },
                ]),
              ),
              unrelated: unknown,
            },
          });
          fs.writeFileSync(lockPath, original);
          yield* workspace.provide(
            Effect.gen(function* () {
              const candidate = yield* HandoffSkills.prepare({
                lockPath,
                skills: names,
                all: false,
              });
              expect(fs.readFileSync(lockPath, "utf8")).toBe(original);
              const result = yield* HandoffSkills.previewOrApply(
                candidate,
                preapprovedPlanExecution,
              );
              expect(result.units.filter((unit) => unit.state === "failed")).toEqual([]);
              expect(result.units.filter((unit) => unit.state === "committed")).toHaveLength(2);
              expect(JSON.parse(fs.readFileSync(lockPath, "utf8"))).toEqual({
                version: scope === "project" ? 1 : 3,
                custom: "retain",
                skills: { unrelated: unknown },
              });
              const lock = yield* LockfileReader;
              for (const name of names) {
                const accepted = yield* lock.acceptedEntry("skill", name);
                expect(Option.isSome(accepted)).toBe(true);
                if (Option.isSome(accepted)) {
                  expect(accepted.value).toMatchObject({
                    source: { type: "git" },
                    resolved: { commit },
                  });
                  expect(JSON.stringify(accepted.value)).not.toContain(foreignHash);
                }
                expect(
                  fs.readFileSync(
                    path.join(nativeRoot, ".claude", "skills", name, "SKILL.md"),
                    "utf8",
                  ),
                ).toBe(body(name));
                expect(fs.readFileSync(path.join(source, "skills", name, "SKILL.md"), "utf8")).toBe(
                  body(name),
                );
              }
            }),
          );
        }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
    );
  }
});
