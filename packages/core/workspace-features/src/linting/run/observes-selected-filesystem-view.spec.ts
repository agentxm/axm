// Raw node:fs/node:path and Git subprocesses are the repository convention for
// constructing mutable integration fixtures around Effect filesystem code.
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as nodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";
import { describe, expect, it } from "@effect/vitest";
import { RegistryTransportTest } from "@agentxm/registry-client/testing";
import { afterEach } from "vitest";

import { NoProjectionParticipants } from "@agentxm/workspace-kernel/projection/testing";
import { SettingsReader, WorkspaceLocation } from "@agentxm/workspace-kernel/workspace-state";
import { defineSpecification } from "@agentxm/specification-metadata";

import { OfflineHttpClient } from "../test-helpers.js";
import {
  EXTRANEOUS_AXM_SKILL_PACKAGE_ROOT,
  OFFICIAL_AXM_SKILL_PACKAGE_ROOT,
  lintWorkspaceServices,
  makeOfficialAxmSkillWorkspace,
  officialAxmSkillPackage,
} from "../testing.js";
import {
  admitLintRequest,
  lintSelectionRoot,
  lintSelectionLayer,
  queryLintWorkspace,
} from "./lint-workspace.js";
import { isolatedGitEnvironment } from "./staged-workspace.js";

export const specification = defineSpecification({
  requirement: "cli/lint/observes-selected-filesystem-view",
  title: "Lint observes only the selected filesystem view",
  statement:
    "When lint runs without --fix, it shall evaluate only the selected view — the staged content and its index fingerprint for git-index, the working tree for workspace — including which official AXM skill package that view's settings and lock state select, report diagnostic locations against the selected workspace rather than any snapshot of it, and leave the Git index unchanged.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity", "machine-automation"],
  boundary: "process",
  boundaryRationale:
    "Only a real Git index, driven through the git executable, can hold staged content that differs from the working tree, yield the index fingerprint, and show afterwards that the index and status were left untouched; an in-memory run has no Git index to observe.",
  methods: ["example"],
  derivedFrom: ["cli/lint/reports-facts-without-mutation"],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "How should an explicit lint path select a nested workspace inside a Git index, and how should user scope combine with a supplied path? Current root-selection precedence remains an implementation observation.",
  ],
});

const git = (root: string, args: ReadonlyArray<string>): string =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", env: isolatedGitEnvironment() });

const initializeGit = (root: string): void => {
  git(root, ["init", "--quiet", "--initial-branch=main"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test"]);
};

/** Declare one more Skill than the workspace has installed. */
const addDeclaredSkill = (settingsText: string): string => {
  const settings: unknown = JSON.parse(settingsText);
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
    throw new Error("Expected object-valued workspace settings");
  }
  const configuredSkills = "skills" in settings ? settings.skills : undefined;
  const skills =
    typeof configuredSkills === "object" &&
    configuredSkills !== null &&
    !Array.isArray(configuredSkills)
      ? configuredSkills
      : {};
  return `${JSON.stringify(
    { ...settings, skills: { ...skills, demo: "@acme/skills/demo" } },
    null,
    2,
  )}\n`;
};

const lintView = (
  workspace: { readonly root: string; readonly cliVersion: string },
  view: "workspace" | "git-index",
) =>
  Effect.gen(function* () {
    const selection = yield* admitLintRequest({
      path: workspace.root,
      scope: "project",
      view,
      fix: false,
      cwd: workspace.root,
      userHome: workspace.root,
    });
    return yield* queryLintWorkspace(selection, { strict: false }).pipe(
      Effect.provide(
        lintWorkspaceServices({
          workspaceRoot: lintSelectionRoot(selection),
          observationView: selection.nativeView,
          cliVersion: workspace.cliVersion,
        }).pipe(Layer.provideMerge(lintSelectionLayer(selection))),
      ),
    );
  }).pipe(Effect.scoped);

const viewServices = Layer.mergeAll(
  Layer.provideMerge(RegistryTransportTest(OfflineHttpClient), NodeServices.layer),
  NoProjectionParticipants,
);

describe("Selected lint filesystem view", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("constructs staged services without reading or inheriting live user settings", () => {
    const workspace = makeOfficialAxmSkillWorkspace("official-compatible");
    cleanups.push(workspace.cleanup);
    initializeGit(workspace.root);
    git(workspace.root, ["add", "."]);
    return Effect.gen(function* () {
      const hostFs = yield* FileSystem.FileSystem;
      const home = yield* hostFs.makeTempDirectoryScoped();
      const userSettings = nodePath.join(home, ".axm", "workspace", "axm.json");
      yield* hostFs.makeDirectory(nodePath.dirname(userSettings), { recursive: true });
      yield* hostFs.writeFileString(userSettings, "malformed live user settings");
      const selection = yield* admitLintRequest({
        path: workspace.root,
        cwd: workspace.root,
        userHome: home,
        scope: "project",
        view: "git-index",
        fix: false,
      });
      const captured = yield* FileSystem.FileSystem.pipe(
        Effect.provide(lintSelectionLayer(selection)),
      );
      const externalReads: string[] = [];
      const observed = FileSystem.make({
        ...captured,
        access: (target, options) => {
          if (target.startsWith(home)) externalReads.push(target);
          return captured.access(target, options);
        },
      });
      yield* Effect.gen(function* () {
        const settings = yield* SettingsReader;
        expect(yield* settings.owner).toEqual(Option.none());
        expect(yield* settings.configuredSources).toEqual([]);
        expect((yield* WorkspaceLocation).nativeDirectoryInputs.skillsDirectoryOverrides).toEqual({
          "claude-code": nodePath.join(selection.workspaceRoot, "selected-skills"),
        });
        const result = yield* queryLintWorkspace(selection, { strict: false });
        expect(result.document.input).toEqual(selection.input);
      }).pipe(
        Effect.provide(
          lintWorkspaceServices({
            workspaceRoot: lintSelectionRoot(selection),
            observationView: selection.nativeView,
            cliVersion: workspace.cliVersion,
          }).pipe(
            Layer.provideMerge(
              Layer.succeed(FileSystem.FileSystem, observed).pipe(
                Layer.provideMerge(lintSelectionLayer(selection)),
              ),
            ),
            Layer.provideMerge(
              ConfigProvider.layer(
                ConfigProvider.fromEnv({
                  env: {
                    AXM_USER_HOME: home,
                    AXM_CLAUDE_SKILLS_DIR: nodePath.join(
                      selection.workspaceRoot,
                      "selected-skills",
                    ),
                  },
                }),
              ),
            ),
          ),
        ),
      );
      expect(externalReads).toEqual([]);
      expect(yield* hostFs.readFileString(userSettings)).toBe("malformed live user settings");
    }).pipe(Effect.scoped, Effect.provide(viewServices));
  });

  it.effect("preserves permission failures for settings inside the captured view", () => {
    const workspace = makeOfficialAxmSkillWorkspace("official-compatible");
    cleanups.push(workspace.cleanup);
    initializeGit(workspace.root);
    git(workspace.root, ["add", "."]);
    return Effect.gen(function* () {
      const selection = yield* admitLintRequest({
        path: workspace.root,
        cwd: workspace.root,
        userHome: workspace.root,
        scope: "project",
        view: "git-index",
        fix: false,
      });
      const captured = yield* FileSystem.FileSystem.pipe(
        Effect.provide(lintSelectionLayer(selection)),
      );
      const selectedSettings = nodePath.join(selection.workspaceRoot, "axm.json");
      const denied = FileSystem.make({
        ...captured,
        access: (target, options) =>
          target === selectedSettings
            ? Effect.fail(
                PlatformError.systemError({
                  _tag: "PermissionDenied",
                  module: "FileSystem",
                  method: "access",
                  pathOrDescriptor: target,
                }),
              )
            : captured.access(target, options),
      });
      const result = yield* queryLintWorkspace(selection, { strict: false }).pipe(
        Effect.provide(
          lintWorkspaceServices({
            workspaceRoot: lintSelectionRoot(selection),
            observationView: selection.nativeView,
            cliVersion: workspace.cliVersion,
          }).pipe(
            Layer.provideMerge(
              Layer.succeed(FileSystem.FileSystem, denied).pipe(
                Layer.provideMerge(lintSelectionLayer(selection)),
              ),
            ),
          ),
        ),
        Effect.result,
      );
      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") expect(result.failure._tag).toBe("SettingsIoError");
    }).pipe(Effect.scoped, Effect.provide(viewServices));
  });

  it.effect(
    "resolves absolute staged aliases inside the captured view without reading live content",
    () => {
      const workspace = makeOfficialAxmSkillWorkspace("official-compatible");
      cleanups.push(workspace.cleanup);
      initializeGit(workspace.root);
      workspace.writeFile("captured.txt", "staged bytes");
      fs.symlinkSync(
        nodePath.join(workspace.root, "captured.txt"),
        nodePath.join(workspace.root, "alias"),
      );
      fs.symlinkSync(
        nodePath.join(workspace.root, "untracked.txt"),
        nodePath.join(workspace.root, "missing-alias"),
      );
      git(workspace.root, ["add", "."]);
      const indexBefore = git(workspace.root, ["ls-files", "--stage", "-z"]);
      workspace.writeFile("captured.txt", "live bytes");
      workspace.writeFile("untracked.txt", "live-only bytes");
      return Effect.gen(function* () {
        const selection = yield* admitLintRequest({
          path: workspace.root,
          cwd: workspace.root,
          userHome: workspace.root,
          scope: "project",
          view: "git-index",
          fix: false,
        });
        const captured = yield* FileSystem.FileSystem.pipe(
          Effect.provide(lintSelectionLayer(selection)),
        );
        expect(
          yield* captured.readFileString(nodePath.join(selection.workspaceRoot, "alias")),
        ).toBe("staged bytes");
        expect(
          (yield* captured
            .readFileString(nodePath.join(selection.workspaceRoot, "missing-alias"))
            .pipe(Effect.result))._tag,
        ).toBe("Failure");
        expect(selection.displayWorkspaceRoot).toBe(workspace.root);
        expect(selection.nativeView).toMatchObject({
          kind: "git-index",
          fingerprint:
            selection.input.view === "git-index" ? selection.input.fingerprint : "unexpected",
        });
        expect(git(workspace.root, ["ls-files", "--stage", "-z"])).toBe(indexBefore);
      }).pipe(Effect.scoped, Effect.provide(viewServices));
    },
  );

  it.effect("judges the official skill each view selects, beside an extraneous copy", () => {
    const incompatible = officialAxmSkillPackage({
      packageRoot: OFFICIAL_AXM_SKILL_PACKAGE_ROOT,
      version: "0.0.1",
      metadata: { cliVersion: "0.0.1", cliVersionRange: ">=0.0.1 <0.1.0" },
    });
    const workspace = makeOfficialAxmSkillWorkspace("official-compatible", {
      files: officialAxmSkillPackage({
        packageRoot: EXTRANEOUS_AXM_SKILL_PACKAGE_ROOT,
        version: "0.0.1",
        metadata: { cliVersion: "0.0.1", cliVersionRange: ">=0.0.1 <0.1.0" },
      }),
    });
    cleanups.push(workspace.cleanup);
    const compatible = Object.fromEntries(
      Object.keys(incompatible).map((file) => [file, workspace.readFile(file)]),
    );
    initializeGit(workspace.root);
    // Stage an incompatible canonical package, then repair only the working tree.
    for (const [file, contents] of Object.entries(incompatible))
      workspace.writeFile(file, contents);
    git(workspace.root, ["add", "."]);
    git(workspace.root, ["commit", "--quiet", "-m", "fixture"]);
    for (const [file, contents] of Object.entries(compatible)) workspace.writeFile(file, contents);
    const indexBefore = git(workspace.root, ["ls-files", "--stage", "-z"]);
    const canonicalRoot = nodePath.join(workspace.root, OFFICIAL_AXM_SKILL_PACKAGE_ROOT);
    const compatibilityFindings = (result: Effect.Success<ReturnType<typeof lintView>>) =>
      result.document.findings.filter(({ ruleId }) => ruleId === "workspace/axm-skill-compatible");

    return Effect.gen(function* () {
      const staged = yield* lintView(workspace, "git-index");

      expect(staged.document.axmSkillCompatibility).toMatchObject({
        status: "incompatible",
        skillVersion: "0.0.1",
      });
      const [stagedFinding, ...others] = compatibilityFindings(staged);
      expect(others).toEqual([]);
      if (stagedFinding === undefined) throw new Error("Expected the staged compatibility finding");
      const displayedRoot = nodePath.resolve(workspace.root, stagedFinding.displayRoot);
      expect(nodePath.resolve(displayedRoot, stagedFinding.path)).toBe(canonicalRoot);

      const live = yield* lintView(workspace, "workspace");

      expect(live.document.axmSkillCompatibility).toMatchObject({
        status: "compatible",
        skillVersion: workspace.cliVersion,
      });
      expect(compatibilityFindings(live)).toEqual([]);
      expect(git(workspace.root, ["ls-files", "--stage", "-z"])).toBe(indexBefore);

      git(workspace.root, ["add", "."]);
      const restaged = yield* lintView(workspace, "git-index");

      expect(restaged.document.axmSkillCompatibility).toMatchObject({ status: "compatible" });
      expect(compatibilityFindings(restaged)).toEqual([]);
    }).pipe(Effect.provide(viewServices));
  });

  it.effect("distinguishes the exact Git index from the working tree without changing it", () => {
    const workspace = makeOfficialAxmSkillWorkspace("official-compatible");
    cleanups.push(workspace.cleanup);
    initializeGit(workspace.root);
    git(workspace.root, ["add", "."]);
    git(workspace.root, ["commit", "--quiet", "-m", "fixture"]);

    const settingsPath = nodePath.join(workspace.root, "axm.json");
    const validSettings = fs.readFileSync(settingsPath, "utf8");
    fs.writeFileSync(settingsPath, addDeclaredSkill(validSettings));
    git(workspace.root, ["add", "axm.json"]);
    fs.writeFileSync(settingsPath, validSettings);

    const statusBefore = git(workspace.root, ["status", "--porcelain=v2", "-z"]);
    const indexBefore = git(workspace.root, ["ls-files", "--stage", "-z"]);

    const lint = (view: "workspace" | "git-index") => lintView(workspace, view);

    return Effect.gen(function* () {
      const staged = yield* lint("git-index");

      expect(staged.outcome).toBe("fail");
      const stagedInput = staged.document.input;
      expect(stagedInput.view).toBe("git-index");
      if (stagedInput.view !== "git-index") {
        return yield* Effect.die(new Error("Expected a Git-index lint result"));
      }
      expect(stagedInput.fingerprint).toMatch(/^sha256:[0-9a-f]{64}$/);
      // The staged declaration needs accepted-resolution state the workspace
      // does not have; that one fact is reported against its lockfile path.
      const stagedFinding = staged.document.findings.find(
        ({ ruleId }) => ruleId === "workspace/lockfile-valid",
      );
      if (stagedFinding === undefined) throw new Error("Expected the staged missing-Skill finding");
      expect(stagedFinding).toMatchObject({
        authority: "axm-lock.yaml",
        location: { file: "axm-lock.yaml" },
      });
      // Displayed locations are workspace-relative; every one must resolve to
      // the selected workspace, never to its temporary index copy.
      const lockPath = nodePath.join(workspace.root, "axm-lock.yaml");
      const displayedRoot = nodePath.resolve(workspace.root, stagedFinding.displayRoot);
      expect(displayedRoot).toBe(workspace.root);
      expect(nodePath.resolve(displayedRoot, stagedFinding.path)).toBe(lockPath);
      expect(nodePath.resolve(displayedRoot, stagedFinding.subject)).toBe(lockPath);

      const live = yield* lint("workspace");

      expect(live.outcome).toBe("success");
      expect(live.document.input).toEqual({ view: "workspace" });
      expect(live.document.findings).toEqual([]);

      expect(git(workspace.root, ["ls-files", "--stage", "-z"])).toBe(indexBefore);
      expect(git(workspace.root, ["status", "--porcelain=v2", "-z"])).toBe(statusBefore);
      expect(fs.readFileSync(settingsPath, "utf8")).toBe(validSettings);
    }).pipe(Effect.provide(viewServices));
  });
});
