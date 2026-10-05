import { execFileSync } from "node:child_process";
import { serveBareRepository } from "../../../testing/git-repositories.js";
import { zipSync } from "fflate";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { LockfileReader } from "@agentxm/workspace-kernel/workspace-state";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { makeLifecycleFixture } from "../../testing.js";
import { InstallExtensions, UninstallExtensions } from "../../index.js";
import { applySync } from "../../../testing/sync-fixture.js";
import { applyUpdate, configuredUpdateRequest } from "../../update/test-helpers.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { applyInstall, installRequest, makeInstallWorld } from "../../../testing/install-world.js";

export const specification = defineSpecification({
  requirement: "cli/skills/install/retains-plugin-package-context",
  title: "Selected plugin skills retain their upstream package context",
  statement:
    "When a consumer selects a skill from a supported plugin package, AXM shall retain the complete package and its relative layout unchanged, activate only the selected skill, and preserve that skill's contained links to package resources outside its component directory. If the target filesystem cannot realize that package context without changing the payload, AXM shall report the unsupported activation and roll back the installation.",
  class: "functional",
  role: "experience",
  goals: ["extension-adoption", "workspace-intent-fidelity", "trustworthy-distribution"],
  methods: ["example"],
  derivedFrom: ["docs/architecture/extensions/source-compatible-distribution.md"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Plugin package context", () => {
  it.effect("retains shared resources and inactive siblings without activating them", () =>
    Effect.gen(function* () {
      const world = yield* Effect.acquireRelease(
        Effect.sync(() => makeInstallWorld()),
        (world) => Effect.sync(() => world.cleanup()),
      );
      const source = path.join(world.workspace.root, "vendor", "plugin");
      for (const name of ["review", "other"])
        fs.mkdirSync(path.join(source, "skills", name), { recursive: true });
      fs.mkdirSync(path.join(source, "assets"));
      const manifest =
        '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"example","future":{"unchanged":true}}\n';
      fs.writeFileSync(path.join(source, "plugin.json"), manifest);
      fs.writeFileSync(path.join(source, "assets", "run"), "#!/bin/sh\necho shared\n", {
        mode: 0o755,
      });
      fs.writeFileSync(
        path.join(source, "skills", "review", "SKILL.md"),
        "# Review\nUse ../../assets/run.\n",
      );
      fs.writeFileSync(path.join(source, "skills", "other", "SKILL.md"), "# Other\n");
      fs.symlinkSync("../../assets/run", path.join(source, "skills", "review", "run"));
      yield* world.workspace.provide(
        applyInstall(
          installRequest({
            type: "skill",
            subject: { kind: "source", source },
            names: ["skills/review"],
            all: false,
          }),
        ),
      );
      for (const agent of [".claude", ".agents"]) {
        const activated = path.join(world.workspace.root, agent, "skills", "review");
        expect(fs.readFileSync(path.join(activated, "SKILL.md"), "utf8")).toBe(
          "# Review\nUse ../../assets/run.\n",
        );
        expect(fs.readlinkSync(path.join(activated, "run"))).toBe("../../assets/run");
        expect(fs.statSync(path.join(activated, "run")).mode & 0o111).toBe(0o111);
        const canonicalComponent = fs.realpathSync(activated);
        const canonicalPackage = path.resolve(canonicalComponent, "../..");
        expect(fs.readFileSync(path.join(canonicalPackage, "plugin.json"), "utf8")).toBe(manifest);
        expect(
          fs.readFileSync(path.join(canonicalPackage, "skills", "other", "SKILL.md"), "utf8"),
        ).toBe("# Other\n");
        expect(fs.existsSync(path.join(world.workspace.root, agent, "skills", "other"))).toBe(
          false,
        );
      }
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

describe("HTTP plugin package context", () => {
  it.effect(
    "keeps ZIP package resources and contained cycles, then removes the selected projection",
    () =>
      Effect.gen(function* () {
        const encode = (text: string) => new TextEncoder().encode(text);
        const manifest =
          '{"$schema":"https://agent-plugins.org/schemas/1.0.0/plugin.schema.json","name":"example"}\n';
        const archive = zipSync({
          "plugin.json": encode(manifest),
          "skills/review/SKILL.md": encode("# Review\nUse ../../assets/run.\n"),
          "skills/other/SKILL.md": encode("# Other\n"),
          "assets/run": [encode("#!/bin/sh\necho shared\n"), { os: 3, attrs: 0o100755 << 16 }],
          "skills/review/run": [encode("../../assets/run"), { os: 3, attrs: 0o120777 << 16 }],
          "skills/review/cycle": [encode("."), { os: 3, attrs: 0o120777 << 16 }],
          "empty/": new Uint8Array(),
        });
        const client = HttpClient.make((request) =>
          Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(archive, { headers: { "content-type": "application/zip" } }),
            ),
          ),
        );
        const workspace = yield* Effect.acquireRelease(
          Effect.sync(() =>
            makeLifecycleFixture({
              sources: "live",
              settings: { agents: ["claude-code"] },
              httpClient: Layer.succeed(HttpClient.HttpClient, client),
            }),
          ),
          (workspace) => Effect.sync(() => workspace.cleanup()),
        );
        const installed = yield* workspace.provide(
          applyInstall(
            installRequest({
              type: "skill",
              subject: { kind: "source", source: "https://example.test/plugin.zip" },
              names: ["skills/review"],
              all: false,
            }),
          ),
        );
        expect(installed).toMatchObject({
          units: [expect.objectContaining({ state: "committed" })],
        });
        const active = path.join(workspace.root, ".claude/skills/review");
        const canonical = fs.realpathSync(active);
        const packageRoot = path.resolve(canonical, "../..");
        expect(fs.readFileSync(path.join(packageRoot, "plugin.json"), "utf8")).toBe(manifest);
        expect(fs.readFileSync(path.join(packageRoot, "skills/other/SKILL.md"), "utf8")).toBe(
          "# Other\n",
        );
        expect(fs.readlinkSync(path.join(active, "run"))).toBe("../../assets/run");
        expect(fs.readlinkSync(path.join(active, "cycle"))).toBe(".");
        expect(fs.statSync(path.join(active, "run")).mode & 0o111).toBe(0o111);
        expect(fs.readdirSync(path.join(packageRoot, "empty"))).toEqual([]);
        expect(fs.existsSync(path.join(workspace.root, ".claude/skills/other"))).toBe(false);
        yield* workspace.provide(
          Effect.gen(function* () {
            const candidate = yield* UninstallExtensions.prepare({
              type: Option.some("skill"),
              selector: "review",
            });
            return yield* UninstallExtensions.previewOrApply(candidate, preapprovedPlanExecution);
          }),
        );
        expect(fs.existsSync(active)).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

describe("Marketplace package installation", () => {
  for (const transport of ["local", "git"] as const) {
    for (const format of ["claude", "codex", "cursor"] as const) {
      it.effect.each(["restore", "update"] as const)(
        `${transport}/${format}: retains the selected marketplace package through %s and removal`,
        (journey) =>
          Effect.gen(function* () {
            const world = yield* Effect.acquireRelease(
              Effect.sync(() => makeInstallWorld()),
              (world) => Effect.sync(() => world.cleanup()),
            );
            const source = path.join(world.workspace.root, "vendor", "marketplace");
            const catalog =
              format === "codex"
                ? ".agents/plugins/marketplace.json"
                : `.${format}-plugin/marketplace.json`;
            const plugin = `.${format}-plugin/plugin.json`;
            const manifest = JSON.stringify({
              name: "reviews",
              skills: "./skills",
              future: { retained: true },
            });
            for (const directory of [
              path.dirname(catalog),
              `packages/reviews/${path.dirname(plugin)}`,
              "packages/reviews/skills/review",
              "packages/reviews/skills/other",
              "packages/reviews/assets",
              "unlisted",
            ])
              fs.mkdirSync(path.join(source, directory), { recursive: true });
            fs.writeFileSync(
              path.join(source, catalog),
              JSON.stringify({
                plugins: [
                  {
                    name: "reviews",
                    source:
                      format === "codex"
                        ? { source: "local", path: "./packages/reviews" }
                        : "./packages/reviews",
                  },
                ],
              }),
            );
            fs.writeFileSync(path.join(source, "packages/reviews", plugin), manifest);
            fs.writeFileSync(
              path.join(source, "packages/reviews/skills/review/SKILL.md"),
              "# Review\n",
            );
            fs.writeFileSync(
              path.join(source, "packages/reviews/skills/other/SKILL.md"),
              "# Other\n",
            );
            fs.writeFileSync(path.join(source, "unlisted/SKILL.md"), "# Unlisted\n");
            fs.writeFileSync(
              path.join(source, "packages/reviews/assets/run"),
              "#!/bin/sh\necho shared\n",
              { mode: 0o755 },
            );
            fs.symlinkSync(
              "../../assets/run",
              path.join(source, "packages/reviews/skills/review/run"),
            );
            const git = (args: ReadonlyArray<string>) =>
              execFileSync("git", args, { cwd: source, encoding: "utf8" }).trim();
            const served =
              transport === "git"
                ? yield* Effect.gen(function* () {
                    git(["init", "--quiet", "--initial-branch=main"]);
                    git(["config", "user.email", "test@example.com"]);
                    git(["config", "user.name", "Test"]);
                    git(["add", "."]);
                    git(["commit", "--quiet", "-m", "accepted"]);
                    return yield* Effect.acquireRelease(
                      Effect.promise(() =>
                        serveBareRepository({
                          root: world.workspace.root,
                          source,
                          name: "plugins",
                        }),
                      ),
                      (repository) => Effect.sync(() => repository.stop()),
                    );
                  })
                : undefined;
            const installSource = served?.url ?? source;
            const { resolution: installed, installedSkills } = yield* world.workspace.provide(
              Effect.gen(function* () {
                const candidate = yield* InstallExtensions.prepare(
                  installRequest({
                    type: "skill",
                    subject: { kind: "source", source: installSource },
                    names: ["packages/reviews/skills/review"],
                    all: false,
                  }),
                );
                return yield* InstallExtensions.previewOrApply(candidate, preapprovedPlanExecution);
              }),
            );
            if (transport === "git") {
              expect(installedSkills).toHaveLength(1);
              expect(installedSkills[0]?.ref).toMatchObject({
                refType: "git-hosted",
                sourcePath: "packages/reviews/skills/review",
              });
            }
            expect(installed).toMatchObject({
              units: [expect.objectContaining({ state: "committed" })],
            });
            const accepted = yield* world.workspace.provide(
              Effect.flatMap(LockfileReader, (reader) => reader.entry("skill", "review")),
            );
            expect(Option.isSome(accepted)).toBe(true);
            if (Option.isNone(accepted)) return;
            expect(accepted.value.source).toMatchObject({
              distribution: {
                format,
                packageRoot: "packages/reviews",
                componentPath: "skills/review",
                manifestPath: plugin,
                marketplace: { path: catalog, name: "reviews" },
              },
            });
            const active = path.join(world.workspace.root, ".claude/skills/review");
            const packageRoot = path.resolve(fs.realpathSync(active), "../..");
            expect(fs.readFileSync(path.join(packageRoot, plugin), "utf8")).toBe(manifest);
            expect(fs.readlinkSync(path.join(active, "run"))).toBe("../../assets/run");
            expect(fs.statSync(path.join(active, "run")).mode & 0o111).toBe(0o111);
            expect(fs.readFileSync(path.join(packageRoot, "skills/other/SKILL.md"), "utf8")).toBe(
              "# Other\n",
            );
            expect(fs.existsSync(path.join(packageRoot, "unlisted"))).toBe(false);
            expect(fs.existsSync(path.join(world.workspace.root, ".claude/skills/other"))).toBe(
              false,
            );
            const lockBefore = world.workspace.readFile("axm-lock.yaml");
            if (journey === "restore") {
              fs.rmSync(packageRoot, { recursive: true });
              yield* world.workspace.provide(
                applySync({ target: Option.none(), type: Option.some("skill") }),
              );
              expect(world.workspace.readFile("axm-lock.yaml")).toBe(lockBefore);
            } else {
              fs.writeFileSync(
                path.join(source, "packages/reviews/assets/run"),
                "#!/bin/sh\necho updated\n",
                { mode: 0o755 },
              );
              if (served !== undefined) {
                git(["add", "."]);
                git(["commit", "--quiet", "-m", "updated resource"]);
                git(["push", "--quiet", served.repository, "main"]);
              }
              yield* world.workspace.provide(
                applyUpdate(configuredUpdateRequest({ type: "skill" })),
              );
              expect(fs.readFileSync(path.join(active, "run"), "utf8")).toBe(
                "#!/bin/sh\necho updated\n",
              );
            }
            expect(fs.readlinkSync(path.join(active, "run"))).toBe("../../assets/run");
            expect(fs.readFileSync(path.join(packageRoot, plugin), "utf8")).toBe(manifest);
            yield* world.workspace.provide(
              Effect.gen(function* () {
                const candidate = yield* UninstallExtensions.prepare({
                  type: Option.some("skill"),
                  selector: "review",
                });
                return yield* UninstallExtensions.previewOrApply(
                  candidate,
                  preapprovedPlanExecution,
                );
              }),
            );
            expect(fs.existsSync(active)).toBe(false);
            expect(fs.readFileSync(path.join(source, "packages/reviews", plugin), "utf8")).toBe(
              manifest,
            );
          }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
      );
    }
  }
});

describe("Plugin activation on filesystems without directory links", () => {
  it.effect.each([false, true])(
    "refuses a context-losing copy and rolls back (payload link: %s)",
    (withLink) =>
      Effect.gen(function* () {
        const workspace = yield* Effect.acquireRelease(
          Effect.sync(() =>
            makeLifecycleFixture({ sources: "live", settings: { agents: ["claude-code"] } }),
          ),
          (workspace) => Effect.sync(() => workspace.cleanup()),
        );
        const source = path.join(workspace.root, "vendor/plugin");
        fs.mkdirSync(path.join(source, "skills/review"), { recursive: true });
        fs.mkdirSync(path.join(source, "assets"));
        fs.writeFileSync(
          path.join(source, "plugin.json"),
          JSON.stringify({
            $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
            name: "reviews",
          }),
        );
        fs.writeFileSync(path.join(source, "assets/reference.txt"), "Unchanged package resource\n");
        fs.writeFileSync(
          path.join(source, "skills/review/SKILL.md"),
          "# Review\nRead ../../assets/reference.txt.\n",
        );
        if (withLink)
          fs.symlinkSync(
            "../../assets/reference.txt",
            path.join(source, "skills/review/reference"),
          );
        const before = workspace.snapshot();
        const fileSystem = yield* FileSystem.FileSystem;
        const unsupported = {
          ...fileSystem,
          symlink: (from: string, to: string) =>
            [".claude/skills/review", ".agents/skills/review"].some(
              (native) => to === path.join(workspace.root, native),
            )
              ? Effect.fail(
                  PlatformError.systemError({
                    _tag: "Unknown",
                    module: "FileSystem",
                    method: "symlink",
                    cause: { code: "ENOSYS" },
                  }),
                )
              : fileSystem.symlink(from, to),
        } satisfies FileSystem.FileSystem;
        const result = yield* workspace
          .provide(
            applyInstall(
              installRequest({
                type: "skill",
                subject: { kind: "source", source },
                names: ["skills/review"],
                all: false,
              }),
            ),
          )
          .pipe(Effect.provideService(FileSystem.FileSystem, unsupported));
        expect(result).toMatchObject({
          units: [
            {
              state: "failed",
              disposition: "restored",
              error: {
                category: "validation",
                detail: expect.stringContaining(
                  "requires directory-link support to retain its package context",
                ),
              },
            },
          ],
        });
        expect(workspace.snapshot()).toEqual(before);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
