import { execFileSync } from "node:child_process";
import { serveBareRepository } from "../../../testing/git-repositories.js";
import { zipSync } from "fflate";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { LockfileReader } from "@agentxm/workspace-kernel/workspace-state";
import { preapprovedPlanExecution } from "@agentxm/workspace-kernel/planning/testing";
import { makeLifecycleFixture } from "../../testing.js";
import { SourceHostProviders, SourceNetworkFailure } from "@agentxm/workspace-kernel/sources";
import { previewPlanExecution } from "@agentxm/workspace-kernel/operations";
import { UpdateExtensions } from "../../update/update-extensions.js";
import { InstallExtensions, UninstallExtensions } from "../../index.js";
import { applySync } from "../../../testing/sync-fixture.js";
import { applyActivation } from "../../activation/test-helpers.js";
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
    "When a consumer selects a skill from a supported plugin package, AXM shall retain the complete package and its relative layout unchanged, share that retained package among selected components until the last accepted binding is removed, add components at the accepted package snapshot even when the upstream selector advances, atomically install or update all selected consumers of the package while retaining disabled activation state and refusing disappearance of a selected component, activate only the selected skills, and preserve that skill's contained links to package resources outside its component directory. If the target filesystem cannot realize that package context without changing the payload, AXM shall report the unsupported activation and roll back the installation.",
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
      const retainedBefore = path.resolve(
        fs.realpathSync(path.join(world.workspace.root, ".claude/skills/review")),
        "../..",
      );
      const retainedIdentity = fs.statSync(retainedBefore).ino;
      fs.writeFileSync(path.join(source, "skills/other/SKILL.md"), "# Upstream moved\n");
      yield* world.workspace.provide(
        applyInstall(
          installRequest({
            type: "skill",
            subject: { kind: "source", source },
            names: ["skills/other"],
            all: false,
          }),
        ),
      );
      const review = path.join(world.workspace.root, ".claude/skills/review");
      const other = path.join(world.workspace.root, ".claude/skills/other");
      const retained = path.resolve(fs.realpathSync(review), "../..");
      expect(path.resolve(fs.realpathSync(other), "../..")).toBe(retained);
      expect(fs.statSync(retained).ino).toBe(retainedIdentity);
      const uninstall = (selector: string) =>
        world.workspace.provide(
          Effect.gen(function* () {
            const candidate = yield* UninstallExtensions.prepare({
              type: Option.some("skill"),
              selector,
            });
            return yield* UninstallExtensions.previewOrApply(candidate, preapprovedPlanExecution);
          }),
        );
      expect(yield* uninstall("review")).toMatchObject({
        units: [expect.objectContaining({ state: "committed" })],
      });
      expect(fs.existsSync(review)).toBe(false);
      expect(fs.readFileSync(path.join(other, "SKILL.md"), "utf8")).toBe("# Other\n");
      expect(fs.existsSync(retained)).toBe(true);
      expect(yield* uninstall("other")).toMatchObject({
        units: [expect.objectContaining({ state: "committed" })],
      });
      expect(fs.existsSync(other)).toBe(false);
      expect(fs.existsSync(retained)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

describe("Shared package updates", () => {
  it.effect.each(["advance", "disabled", "mixed", "missing-component"] as const)(
    "settles the complete retained package: %s",
    (scenario) =>
      Effect.gen(function* () {
        const world = yield* Effect.acquireRelease(
          Effect.sync(() => makeInstallWorld()),
          (world) => Effect.sync(() => world.cleanup()),
        );
        const source = path.join(world.workspace.root, "vendor/plugin");
        fs.mkdirSync(source, { recursive: true });
        fs.writeFileSync(
          path.join(source, "plugin.json"),
          JSON.stringify({
            $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
            name: "example",
          }),
        );
        for (const name of ["first", "second"]) {
          fs.mkdirSync(path.join(source, "skills", name), { recursive: true });
          fs.writeFileSync(path.join(source, "skills", name, "SKILL.md"), `# Accepted ${name}\n`);
        }
        const mcp = (url: string) =>
          JSON.stringify({
            $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
            mcpServers: { context: { type: "streamable-http", url } },
          });
        if (scenario === "mixed")
          fs.writeFileSync(path.join(source, "mcp.json"), mcp("https://example.test/accepted"));
        yield* world.workspace.provide(
          applyInstall(
            installRequest({
              type: "skill",
              subject: { kind: "source", source },
              names: ["skills/first", "skills/second"],
              all: false,
            }),
          ),
        );
        if (scenario === "mixed") {
          // The inactive connection was retained with the original skill package.
          yield* world.workspace.provide(
            applyInstall(
              installRequest({
                type: "mcp-server",
                subject: { kind: "source", source },
                names: ["context"],
                all: false,
                localName: "work-context",
              }),
            ),
          );
        }
        const retained = path.resolve(
          fs.realpathSync(path.join(world.workspace.root, ".claude/skills/first")),
          "../..",
        );
        if (scenario === "disabled")
          yield* world.workspace.provide(
            applyActivation({ type: "skill", name: "second", enabled: false }),
          );
        const lockPath = path.join(world.workspace.root, "axm-lock.yaml");
        const before = fs.readFileSync(lockPath, "utf8");
        fs.writeFileSync(path.join(source, "skills/first/SKILL.md"), "# Updated first\n");
        if (scenario !== "missing-component")
          fs.writeFileSync(path.join(source, "skills/second/SKILL.md"), "# Updated second\n");
        else fs.rmSync(path.join(source, "skills/second"), { recursive: true });
        if (scenario === "mixed")
          fs.writeFileSync(path.join(source, "mcp.json"), mcp("https://example.test/updated"));
        const outcome = yield* world.workspace.provide(
          applyUpdate(configuredUpdateRequest({ type: "skill", nameFilters: ["first"] })),
        );
        if (scenario !== "missing-component") {
          if (outcome._tag === "Resolved") expect(outcome.resolution.blocking).toBeUndefined();
          expect(outcome._tag).toBe("Resolved");
          if (outcome._tag === "Resolved")
            expect(
              outcome.resolution.units.map((unit) => ({
                state: unit.state,
                message: unit.message,
              })),
            ).toEqual([expect.objectContaining({ state: "committed" })]);
          for (const name of ["first", "second"])
            expect(fs.readFileSync(path.join(retained, "skills", name, "SKILL.md"), "utf8")).toBe(
              `# Updated ${name}\n`,
            );
          if (scenario === "disabled")
            expect(fs.existsSync(path.join(world.workspace.root, ".claude/skills/second"))).toBe(
              false,
            );
          const lock = yield* world.workspace.provide(
            Effect.gen(function* () {
              return yield* (yield* LockfileReader).lockfile;
            }),
          );
          expect(lock.skills["first"]?.treeIntegrity).toBe(lock.skills["second"]?.treeIntegrity);
          if (scenario === "mixed") {
            const native: unknown = JSON.parse(world.workspace.readFile(".mcp.json"));
            expect(native).toMatchObject({
              mcpServers: { "work-context": { url: "https://example.test/updated" } },
            });
            expect(
              Object.values(lock.mcpServers ?? {}).map((entry) => entry.treeIntegrity),
            ).toEqual([lock.skills["first"]?.treeIntegrity]);
          }
        } else {
          expect(fs.readFileSync(lockPath, "utf8")).toBe(before);
          for (const name of ["first", "second"])
            expect(
              fs.readFileSync(
                path.join(world.workspace.root, ".claude/skills", name, "SKILL.md"),
                "utf8",
              ),
            ).toBe(`# Accepted ${name}\n`);
        }
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

describe("Retained Git snapshot additions", () => {
  it.effect("adds a sibling at the accepted commit after the branch changes", () =>
    Effect.gen(function* () {
      const world = yield* Effect.acquireRelease(
        Effect.sync(() => makeInstallWorld()),
        (world) => Effect.sync(() => world.cleanup()),
      );
      const source = path.join(world.workspace.root, "upstream");
      fs.mkdirSync(path.join(source, ".claude-plugin"), { recursive: true });
      fs.writeFileSync(
        path.join(source, ".claude-plugin/plugin.json"),
        JSON.stringify({ name: "example", skills: "./skills" }),
      );
      for (const name of ["first", "second"]) {
        fs.mkdirSync(path.join(source, "skills", name), { recursive: true });
        fs.writeFileSync(path.join(source, "skills", name, "SKILL.md"), `# Accepted ${name}\n`);
      }
      const git = (args: ReadonlyArray<string>) =>
        execFileSync("git", args, { cwd: source, encoding: "utf8" }).trim();
      git(["init", "--quiet", "--initial-branch=main"]);
      git(["config", "user.email", "test@example.com"]);
      git(["config", "user.name", "Test"]);
      git(["add", "."]);
      git(["commit", "--quiet", "-m", "accepted"]);
      const commit = git(["rev-parse", "HEAD"]);
      const served = yield* Effect.acquireRelease(
        Effect.promise(() =>
          serveBareRepository({ root: world.workspace.root, source, name: "plugin" }),
        ),
        (repository) => Effect.sync(() => repository.stop()),
      );
      const install = (name: string) =>
        world.workspace.provide(
          applyInstall(
            installRequest({
              type: "skill",
              subject: { kind: "source", source: served.url },
              names: [`skills/${name}`],
              all: false,
            }),
          ),
        );
      expect(yield* install("first")).toMatchObject({
        units: [expect.objectContaining({ state: "committed" })],
      });
      fs.rmSync(path.join(source, "skills/first"), { recursive: true });
      fs.writeFileSync(path.join(source, "skills/second/SKILL.md"), "# Changed second\n");
      git(["add", "."]);
      git(["commit", "--quiet", "-m", "changed branch"]);
      git(["push", "--quiet", served.repository, "main"]);
      expect(yield* install("second")).toMatchObject({
        units: [expect.objectContaining({ state: "committed" })],
      });
      for (const name of ["first", "second"]) {
        expect(world.workspace.readFile(`.claude/skills/${name}/SKILL.md`)).toBe(
          `# Accepted ${name}\n`,
        );
      }
      const lock = yield* world.workspace.provide(
        Effect.flatMap(LockfileReader, (reader) => reader.lockfile),
      );
      expect(lock.skills["first"]).toMatchObject({ resolved: { commit } });
      expect(lock.skills["second"]).toMatchObject({ resolved: { commit } });
      expect(
        world.workspace.readFile("axm-lock.yaml").match(new RegExp(commit, "gu")),
      ).toHaveLength(1);
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
        const responseBytes = yield* Ref.make(archive);
        const client = HttpClient.make((request) =>
          Ref.get(responseBytes).pipe(
            Effect.map((body) =>
              HttpClientResponse.fromWeb(
                request,
                new Response(body, { headers: { "content-type": "application/zip" } }),
              ),
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
        yield* Ref.set(
          responseBytes,
          zipSync({ "skills/other/SKILL.md": encode("# Upstream moved\n") }),
        );
        const additional = yield* workspace.provide(
          applyInstall(
            installRequest({
              type: "skill",
              subject: { kind: "source", source: "https://example.test/plugin.zip" },
              names: ["skills/other"],
              all: false,
            }),
          ),
        );
        expect(additional.units.map((unit) => unit.state)).toEqual(["committed"]);
        expect(workspace.readFile(".claude/skills/other/SKILL.md")).toBe("# Other\n");
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
                applySync({ target: Option.none(), types: ["skill"] }),
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

describe("Shared package installation", () => {
  it.effect("rolls back every selected skill when a later component cannot activate", () =>
    Effect.gen(function* () {
      const workspace = yield* Effect.acquireRelease(
        Effect.sync(() =>
          makeLifecycleFixture({ sources: "live", settings: { agents: ["claude-code"] } }),
        ),
        (workspace) => Effect.sync(() => workspace.cleanup()),
      );
      const source = path.join(workspace.root, "vendor/plugin");
      for (const name of ["alpha", "zeta"]) {
        fs.mkdirSync(path.join(source, "skills", name), { recursive: true });
        fs.writeFileSync(path.join(source, "skills", name, "SKILL.md"), `# ${name}\n`);
      }
      fs.writeFileSync(
        path.join(source, "plugin.json"),
        JSON.stringify({
          $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
          name: "reviews",
        }),
      );
      const before = workspace.snapshot();
      const firstActivated = yield* Ref.make(false);
      const fileSystem = yield* FileSystem.FileSystem;
      const failing = {
        ...fileSystem,
        symlink: (from: string, to: string) =>
          to === path.join(workspace.root, ".agents/skills/zeta")
            ? Effect.gen(function* () {
                yield* Ref.set(
                  firstActivated,
                  fs.existsSync(path.join(workspace.root, ".agents/skills/alpha")),
                );
                return yield* PlatformError.systemError({
                  _tag: "Unknown",
                  module: "FileSystem",
                  method: "symlink",
                  cause: { code: "ENOSYS" },
                });
              })
            : fileSystem.symlink(from, to),
      } satisfies FileSystem.FileSystem;
      const result = yield* workspace
        .provide(
          applyInstall(
            installRequest({
              type: "skill",
              subject: { kind: "source", source },
              all: true,
            }),
          ),
        )
        .pipe(Effect.provideService(FileSystem.FileSystem, failing));
      expect(yield* Ref.get(firstActivated)).toBe(true);
      expect(result.units.every((unit) => unit.state === "failed")).toBe(true);
      expect(workspace.snapshot()).toEqual(before);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});

describe("Shared package failure atomicity", () => {
  it.effect.each(["acquisition", "canonical", "lock", "stale"] as const)(
    "preserves both accepted selections after a %s failure",
    (failure) =>
      Effect.gen(function* () {
        const world = yield* Effect.acquireRelease(
          Effect.sync(() => makeInstallWorld()),
          (world) => Effect.sync(world.cleanup),
        );
        const source = path.join(world.workspace.root, "vendor/shared-failure");
        for (const name of ["first", "second"]) {
          fs.mkdirSync(path.join(source, "skills", name), { recursive: true });
          fs.writeFileSync(path.join(source, "skills", name, "SKILL.md"), `# Accepted ${name}\n`);
        }
        fs.writeFileSync(
          path.join(source, "plugin.json"),
          JSON.stringify({
            $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
            name: "shared",
          }),
        );
        const armed = yield* Ref.make(false);
        const injected = yield* Ref.make(false);
        const filesystem = yield* FileSystem.FileSystem;
        const failingFilesystem = {
          ...filesystem,
          rename: (from: string, to: string) =>
            Effect.gen(function* () {
              const selected =
                failure === "canonical"
                  ? from === `${to}.axm-staging` && to.endsWith("/shared-failure")
                  : failure === "lock" &&
                    to === path.join(world.workspace.workspaceRoot, "axm-lock.yaml");
              if ((yield* Ref.get(armed)) && selected && !(yield* Ref.get(injected))) {
                yield* Ref.set(injected, true);
                return yield* PlatformError.systemError({
                  _tag: "Unknown",
                  module: "FileSystem",
                  method: "rename",
                  cause: { code: "EIO" },
                });
              }
              return yield* filesystem.rename(from, to);
            }),
        } satisfies FileSystem.FileSystem;
        yield* world.workspace
          .provide(
            Effect.gen(function* () {
              const installed = yield* applyInstall(
                installRequest({
                  type: "skill",
                  subject: { kind: "source", source },
                  all: true,
                }),
              );
              expect(installed.units.every((unit) => unit.state === "committed")).toBe(true);
              for (const name of ["first", "second"])
                fs.writeFileSync(
                  path.join(source, "skills", name, "SKILL.md"),
                  `# Updated ${name}\n`,
                );
              const candidate = yield* UpdateExtensions.prepare(
                configuredUpdateRequest({ type: "skill", nameFilters: ["first"] }),
              );
              if (candidate.outcome === "nothing-configured")
                throw new Error("Expected a shared update");
              const before = world.workspace.snapshot();
              const preview = yield* UpdateExtensions.previewOrApply(
                candidate,
                previewPlanExecution,
              ).pipe(Effect.map((result) => result.resolution));
              expect(preview.blocking).toBeUndefined();
              expect(world.workspace.snapshot()).toEqual(before);
              if (failure === "stale") {
                fs.appendFileSync(
                  path.join(world.workspace.workspaceRoot, "axm-lock.yaml"),
                  "# Intervening acceptance edit\n",
                );
                const changed = world.workspace.snapshot();
                const result = yield* UpdateExtensions.previewOrApply(
                  candidate,
                  preapprovedPlanExecution,
                ).pipe(Effect.map((result) => result.resolution));
                expect(result.blocking?.class).toBe("stale-candidate");
                expect(world.workspace.snapshot()).toEqual(changed);
                return;
              }
              const sources = yield* SourceHostProviders;
              yield* Ref.set(armed, true);
              const result = yield* UpdateExtensions.previewOrApply(
                candidate,
                preapprovedPlanExecution,
              )
                .pipe(Effect.map((result) => result.resolution))
                .pipe(
                  Effect.provideService(SourceHostProviders, {
                    ...sources,
                    acquireForTransition: (ref) =>
                      failure === "acquisition"
                        ? Ref.set(injected, true).pipe(
                            Effect.andThen(
                              Effect.fail(
                                new SourceNetworkFailure({
                                  detail: "Injected acquisition failure",
                                }),
                              ),
                            ),
                          )
                        : sources.acquireForTransition(ref),
                  }),
                );
              expect(
                yield* Ref.get(injected),
                JSON.stringify(
                  result.units.map(({ state, disposition, error }) => ({
                    state,
                    disposition,
                    error,
                  })),
                ),
              ).toBe(true);
              expect(
                result.units.some((unit) => unit.state === "failed"),
                JSON.stringify(result),
              ).toBe(true);
              expect(world.workspace.snapshot()).toEqual(before);
            }),
          )
          .pipe(Effect.provideService(FileSystem.FileSystem, failingFilesystem));
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
