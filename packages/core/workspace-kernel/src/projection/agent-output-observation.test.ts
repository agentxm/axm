import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";

import * as Result from "effect/Result";
import { makeRecordingFileSystem } from "@agentxm/test-support";
import { captureCopiedDirectory, captureNativeLocationSet } from "../locations/index.js";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { resolveProjectWorkspaceLayout, SettingsSchema } from "../workspace-state/index.js";
import { codingAgentFromDescriptor } from "../agent-adapters/index.js";

import { observeAgentOutputs, workspaceOwnershipIssues } from "./agent-output-observation.js";
import { workObservations } from "../locations/testing.js";
import { classifyNativeOutputHealth } from "./native-output-conflicts.js";
import { CodingAgentRepository } from "./agents/coding-agent-repository.js";
import { makeCodingAgentRepository } from "./testing.js";

// Ownership scenarios need an unconditional reader at the custom source path,
// independently of vendor-specific workspace selection or migration conditions.
const fixtureReader = codingAgentFromDescriptor({
  id: "openclaw",
  name: "Fixture Skill reader",
  detection: { project: { markers: [] }, user: { markers: [] } },
  skills: {
    scopes: ["project"],
    writerSupported: false,
    locations: [
      {
        scope: "project",
        root: "project",
        path: "skills",
        shape: "directory",
        role: "primary",
        status: "canonical",
        applicability: { kind: "always" },
        provenance: { kind: "capability-sources" },
      },
    ],
  },
});
const repository = makeCodingAgentRepository([]);
const repositoryLayer = Layer.succeed(CodingAgentRepository, {
  ...repository,
  all: Effect.map(repository.all, (agents) =>
    agents.map((agent) => (agent.id === fixtureReader.id ? fixtureReader : agent)),
  ),
});

const expectedNames = {
  skill: new Set<string>(),
  subagent: new Set<string>(),
  hook: new Set<string>(),
  "mcp-server": new Set<string>(),
};
const fixture = (directory = "skills") =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "axm-authored-observer-" });
    const settings = Schema.decodeUnknownSync(SettingsSchema)({
      owner: "@acme",
      agents: [],
      skillsConfig: { dir: directory },
      skills: { review: { source: "workspace", enabled: false } },
      packs: { broken: "workspace" },
    });
    const layout = yield* resolveProjectWorkspaceLayout(decodeAbsolutePathSync(root), settings);
    const write = (relative: string, content: string) =>
      Effect.gen(function* () {
        const file = path.join(root, relative);
        yield* fs.makeDirectory(path.dirname(file), { recursive: true });
        yield* fs.writeFileString(file, content);
      });
    const manifest = JSON.stringify({
      owner: "@acme",
      type: "skill",
      name: "review",
      version: "1.0.0",
    });
    yield* write(`${directory}/review/skill.json`, manifest);
    yield* write(
      `${directory}/review/src/SKILL.md`,
      "---\nname: review\ndescription: Review\n---\nReview\n",
    );
    const args = {
      workspaceRoot: root,
      nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
      scope: "project" as const,
      desiredAgentIds: new Set<string>(),
      expectedNames,
      expectedHooks: [],
      declaredMcpNames: new Set<string>(),
      expectedSkillSources: { other: [path.join(layout.authoredRoot("skill"), "other/src")] },
      expectedSubagentNames: new Set<string>(),
      authoredSkills: { layout, entries: settings.skills ?? {} },
    };
    return { fs, path, root, write, manifest, args };
  });
const provide = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    FileSystem.FileSystem | Path.Path | Scope.Scope | CodingAgentRepository
  >,
) =>
  effect.pipe(Effect.provide(Layer.mergeAll(repositoryLayer, NodeServices.layer)), Effect.scoped);

describe("authored skill exclusion", () => {
  it.effect("preserves an unreadable container instead of calling it absent or a broken link", () =>
    provide(
      Effect.gen(function* () {
        const { args, fs, path, root } = yield* fixture();
        const denied = path.join(root, ".claude/skills");
        yield* fs.makeDirectory(denied, { recursive: true });
        const inventory = yield* observeAgentOutputs(args).pipe(
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            readDirectory: (target) =>
              target === denied
                ? Effect.fail(
                    PlatformError.systemError({
                      _tag: "PermissionDenied",
                      module: "FileSystem",
                      method: "readDirectory",
                      pathOrDescriptor: target,
                    }),
                  )
                : fs.readDirectory(target),
          }),
        );
        expect(classifyNativeOutputHealth(inventory.outputs)).toEqual([
          { kind: "unreadable", path: denied, reason: "unreadable" },
        ]);
      }),
    ),
  );

  it.effect("retains broken skill and subagent entries pointing outside the workspace", () =>
    provide(
      Effect.gen(function* () {
        const { args, fs, path, root } = yield* fixture();
        const target = path.join(root, "..", "missing-native-output-target");
        const entries = [
          path.join(root, ".claude/skills/leftover"),
          path.join(root, ".claude/agents/leftover.md"),
        ];
        for (const entry of entries) {
          yield* fs.makeDirectory(path.dirname(entry), { recursive: true });
          yield* fs.symlink(target, entry);
        }
        const inventory = yield* observeAgentOutputs(args);
        expect(classifyNativeOutputHealth(inventory.outputs)).toEqual(
          [...entries].sort().map((entry) => ({ kind: "broken-link", path: entry, target })),
        );
      }),
    ),
  );

  it.effect("tracks copied outputs by package ownership across a skill rename", () =>
    provide(
      Effect.gen(function* () {
        const { args, fs, path, root, write } = yield* fixture();
        const source = path.join(root, "skills/review/src");
        const oldTarget = path.join(root, ".claude/skills/review");
        const newTarget = path.join(root, ".claude/skills/inspect");
        yield* fs.makeDirectory(path.dirname(oldTarget), { recursive: true });
        yield* fs.copy(source, oldTarget);
        yield* captureCopiedDirectory(oldTarget, source);
        yield* write("skills/review/src/SKILL.md", "---\nname: inspect\n---\nReview\n");
        yield* fs.copy(source, newTarget);
        yield* captureCopiedDirectory(newTarget, source);
        const inventory = yield* observeAgentOutputs({
          ...args,
          desiredAgentIds: new Set(["claude-code"]),
          expectedNames: { ...args.expectedNames, skill: new Set(["review"]) },
          expectedSkillSources: { review: [source] },
        });
        expect(inventory.ownedResidue.find((output) => output.path === oldTarget)).toMatchObject({
          extensionName: "review",
          entryName: "review",
          proof: "copied-directory-receipt",
          desired: false,
        });
        expect(inventory.outputs.find((output) => output.path === newTarget)).toMatchObject({
          extensionName: "review",
          entryName: "inspect",
          proof: "copied-directory-receipt",
          desired: true,
        });
      }),
    ),
  );

  it.effect("observes scoped Hook aliases as one physical unit", () =>
    provide(
      Effect.gen(function* () {
        const { args, fs, path, root, write } = yield* fixture();
        const owner = {
          name: "audit",
          ref: "@acme/hooks/audit",
          scope: "user" as const,
          root: path.join(root, "agent_extensions/registry.agentxm.ai/@acme/hooks/audit"),
        };
        yield* write(
          ".claude/settings.json",
          JSON.stringify({
            hooks: {
              PreToolUse: [
                {
                  hooks: [
                    {
                      type: "command",
                      command: `bash '${owner.root}/src/hook.sh'`,
                      "x-axm": {
                        v: 1,
                        managed: true,
                        source: "extension",
                        unit: "hook:audit",
                        ref: owner.ref,
                        scope: owner.scope,
                        root: owner.root,
                      },
                    },
                  ],
                },
              ],
            },
          }),
        );
        yield* fs.makeDirectory(path.join(root, ".gemini"));
        yield* fs.symlink("../.claude/settings.json", path.join(root, ".gemini/settings.json"));
        const inventory = yield* observeAgentOutputs({
          ...args,
          scope: "user",
          expectedHooks: [owner],
        });
        const hooks = inventory.outputs.filter((output) => output.extensionType === "hook");
        expect(hooks).toHaveLength(1);
        expect(hooks[0]).toMatchObject({
          path: `${root}/.claude/settings.json#audit`,
          ownership: "declared",
        });
        expect(hooks[0]?.claimantAgentIds).toContain("claude-code");
        expect(hooks[0]?.claimantAgentIds).toContain("gemini-cli");
      }),
    ),
  );

  it.effect.each(["AXM_CLAUDE_SKILLS_DIR", "AXM_GEMINI_CLI_SKILLS_DIR"])(
    "uses captured native inputs independently of later %s provider failure",
    (key) =>
      provide(
        Effect.gen(function* () {
          const { args } = yield* fixture();
          const sourceError = new ConfigProvider.SourceError({ message: "source unavailable" });
          const inventory = yield* observeAgentOutputs(args).pipe(
            Effect.provide(
              ConfigProvider.layer(
                ConfigProvider.make((path) =>
                  path[0] === key ? Effect.fail(sourceError) : Effect.succeed(undefined),
                ),
              ),
            ),
          );
          expect(inventory.outputs).toEqual([]);
        }),
      ),
  );

  it.effect("excludes declared source independently of a broken pack and a projection banner", () =>
    provide(
      Effect.gen(function* () {
        const { args, write } = yield* fixture();
        yield* write(
          "skills/review/SKILL.md",
          "<!-- axm:file v=1 ext=@acme/skills/review src=skills/review/src -->\nReview\n",
        );
        const inventory = yield* observeAgentOutputs(args);
        expect(inventory.outputs).toEqual([]);
        expect(workspaceOwnershipIssues(inventory)).toEqual([]);
      }),
    ),
  );
  it.effect(
    "does not exclude an agent path merely because its name matches a custom source path",
    () =>
      provide(
        Effect.gen(function* () {
          const { args, write, manifest, root } = yield* fixture("catalog/skills");
          yield* write("skills/review/skill.json", manifest);
          yield* write("skills/review/src/SKILL.md", "Review\n");
          const inventory = yield* observeAgentOutputs(args);
          expect(inventory.unownedFootprints.map((output) => output.path)).toEqual([
            `${root}/skills/review`,
          ]);
        }),
      ),
  );
  it.effect(
    "keeps a foreign root symlink unowned and an owned projection link eligible for cleanup",
    () =>
      provide(
        Effect.gen(function* () {
          const { args, fs, path, root, write } = yield* fixture();
          yield* fs.rename(path.join(root, "skills/review"), path.join(root, "foreign"));
          yield* fs.symlink("../foreign", path.join(root, "skills/review"));
          yield* write("skills/other/src/SKILL.md", "Other\n");
          yield* fs.makeDirectory(path.join(root, ".claude/skills"), { recursive: true });
          yield* fs.symlink("../../skills/other/src", path.join(root, ".claude/skills/other"));
          const inventory = yield* observeAgentOutputs(args);
          expect(inventory.unownedFootprints.map((output) => output.path)).toContain(
            `${root}/skills/review`,
          );
          expect(inventory.ownedResidue.map((output) => output.path)).toEqual([
            `${root}/.claude/skills/other`,
          ]);
        }),
      ),
  );
});

describe("Subagent output ownership", () => {
  it.effect("owns a declared name at its native path whatever the file says", () =>
    provide(
      Effect.gen(function* () {
        const { args, root, write } = yield* fixture();
        yield* write(".claude/agents/review.md", "Hand-written review\n");
        yield* write(
          ".claude/agents/personal.md",
          "<!-- axm:file v=1 ext=@acme/subagents/personal src=subagents/personal -->\nMine\n",
        );
        const observed = { ...args, expectedSubagentNames: new Set(["review"]) };
        const inventory = yield* observeAgentOutputs(observed);
        const subagents = inventory.outputs.filter((output) => output.extensionType === "subagent");
        expect(
          subagents.map(({ entryName, ownership, proof }) => ({ entryName, ownership, proof })),
        ).toEqual(
          expect.arrayContaining([
            { entryName: "review", ownership: "owned", proof: "declared-native-path" },
            { entryName: "personal", ownership: "unowned", proof: undefined },
          ]),
        );
        const issues = workspaceOwnershipIssues(inventory);
        expect(issues).toContainEqual({
          kind: "managed-file-unowned",
          path: `${root}/.claude/agents/personal.md`,
          detail: "Agent subagent file is not a declared Subagent at this path.",
        });
        expect(issues.map((issue) => issue.path)).not.toContain(`${root}/.claude/agents/review.md`);
      }),
    ),
  );
});

describe("workspace ownership issues", () => {
  it.effect("are the same whatever agents and names the inventory expects", () =>
    provide(
      Effect.gen(function* () {
        const { args, fs, path, root, write } = yield* fixture();
        // An authored package, an owned projection link, foreign artifacts,
        // a declared Subagent and an unreadable container. The authored
        // package and the owned link are not issues; everything else is.
        yield* write("skills/other/src/SKILL.md", "Other\n");
        yield* fs.makeDirectory(path.join(root, ".claude/skills"), { recursive: true });
        yield* fs.symlink("../../skills/other/src", path.join(root, ".claude/skills/other"));
        yield* write(".claude/skills/stray/SKILL.md", "Stray\n");
        yield* write(".claude/agents/review.md", "Review\n");
        yield* write(".claude/agents/personal.md", "Mine\n");
        const denied = path.join(root, ".agents/skills");
        yield* fs.makeDirectory(denied, { recursive: true });
        const deniedFileSystem: FileSystem.FileSystem = {
          ...fs,
          readDirectory: (target, options) =>
            target === denied
              ? Effect.fail(
                  PlatformError.systemError({
                    _tag: "PermissionDenied",
                    module: "FileSystem",
                    method: "readDirectory",
                    pathOrDescriptor: target,
                  }),
                )
              : fs.readDirectory(target, options),
        };
        const observed = { ...args, expectedSubagentNames: new Set(["review"]) };
        const inventory = (expectations: {
          readonly desiredAgentIds: ReadonlySet<string>;
          readonly expectedNames: typeof expectedNames;
        }) =>
          observeAgentOutputs({ ...observed, ...expectations }).pipe(
            Effect.provideService(FileSystem.FileSystem, deniedFileSystem),
          );
        const withoutExpectations = workspaceOwnershipIssues(
          yield* inventory({ desiredAgentIds: new Set<string>(), expectedNames }),
        );
        const withExpectations = workspaceOwnershipIssues(
          yield* inventory({
            desiredAgentIds: new Set(["claude-code", "gemini-cli"]),
            expectedNames: {
              ...expectedNames,
              skill: new Set(["review", "other", "stray"]),
              subagent: new Set(["review", "personal"]),
            },
          }),
        );
        expect(withExpectations).toEqual(withoutExpectations);
        expect(withoutExpectations).toEqual([
          {
            kind: "managed-file-unowned",
            path: denied,
            detail: "Agent skill artifact has no AXM ownership proof.",
          },
          {
            kind: "managed-file-unowned",
            path: `${root}/.claude/skills/stray`,
            detail: "Agent skill artifact has no AXM ownership proof.",
          },
          {
            kind: "managed-file-unowned",
            path: `${root}/skills/other`,
            detail: "Agent skill artifact has no AXM ownership proof.",
          },
          {
            kind: "managed-file-unowned",
            path: `${root}/.claude/agents/personal.md`,
            detail: "Agent subagent file is not a declared Subagent at this path.",
          },
        ]);
        expect(Object.isFrozen(withoutExpectations)).toBe(true);
      }),
    ),
  );
});

describe("incomplete Hook observations", () => {
  for (const failure of ["read", "resolve", "syntax", "shape"] as const) {
    it.effect(
      `retains healthy Hook observations when another configuration has a ${failure} failure`,
      () =>
        provide(
          Effect.gen(function* () {
            const { args, fs, path, root, write } = yield* fixture();
            const blocked = path.join(root, ".claude/settings.json");
            const healthy = path.join(root, ".gemini/settings.json");
            yield* write(
              ".gemini/settings.json",
              JSON.stringify({ hooks: { BeforeAgent: [{ command: "echo healthy" }] } }),
            );
            yield* write(
              ".claude/settings.json",
              failure === "syntax"
                ? "{broken"
                : failure === "shape"
                  ? JSON.stringify({ hooks: [] })
                  : "{}",
            );
            if (failure === "resolve") {
              yield* fs.remove(blocked);
              yield* fs.symlink("settings.json", blocked);
            }
            const denied = PlatformError.systemError({
              _tag: "PermissionDenied",
              module: "FileSystem",
              method: "readFileString",
              pathOrDescriptor: blocked,
            });
            const inventory = yield* observeAgentOutputs(args).pipe(
              Effect.provideService(FileSystem.FileSystem, {
                ...fs,
                readFileString: (file, ...options) =>
                  failure === "read" && file === blocked
                    ? Effect.fail(denied)
                    : fs.readFileString(file, ...options),
              }),
            );
            const diagnostics = inventory.diagnostics.filter(
              (diagnostic) =>
                diagnostic.extensionType === "hook" && diagnostic.address.path === blocked,
            );
            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0]).toMatchObject({
              stage: failure === "syntax" || failure === "shape" ? "decode" : failure,
            });
            if (failure === "read") expect(diagnostics[0]?.cause).toBe(denied);
            expect(
              inventory.outputs.some(
                (output) => output.extensionType === "hook" && output.containerPath === healthy,
              ),
            ).toBe(true);
            expect(
              inventory.outputs.some(
                (output) => output.extensionType === "hook" && output.containerPath === blocked,
              ),
            ).toBe(false);
            expect(
              inventory.unownedFootprints.some((output) => output.containerPath === blocked),
            ).toBe(false);
          }),
        ),
    );
  }

  it.effect("groups failed Hook readers by physical file and preserves their aliases", () =>
    provide(
      Effect.gen(function* () {
        const { args, fs, path, root, write } = yield* fixture();
        const physical = path.join(root, ".claude/settings.json");
        const alias = path.join(root, ".gemini/settings.json");
        yield* write(
          ".claude/settings.json",
          JSON.stringify({ hooks: { BeforeAgent: "invalid" } }),
        );
        yield* fs.makeDirectory(path.dirname(alias), { recursive: true });
        yield* fs.symlink("../.claude/settings.json", alias);
        const inventory = yield* observeAgentOutputs(args);
        const diagnostics = inventory.diagnostics.filter(
          (diagnostic) => diagnostic.extensionType === "hook",
        );
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({
          address: { path: physical, keys: ["hooks"] },
          stage: "decode",
          aliases: [physical, alias],
          claimantAgentIds: ["claude-code", "gemini-cli"],
        });
      }),
    ),
  );

  it.effect("keeps absent and valid empty Hook configurations quiet", () =>
    provide(
      Effect.gen(function* () {
        const { args, write } = yield* fixture();
        yield* write(".claude/settings.json", "{}");
        const inventory = yield* observeAgentOutputs(args);
        expect(
          inventory.diagnostics.filter((diagnostic) => diagnostic.extensionType === "hook"),
        ).toEqual([]);
        expect(inventory.outputs.filter((output) => output.extensionType === "hook")).toEqual([]);
      }),
    ),
  );
});

describe("Hook settings parses within one inventory", () => {
  /** One inventory over a fixture whose only Hook file is `.claude/settings.json`. */
  const observeHookFile = (content: (hookRoot: string) => string, declare = false) =>
    Effect.gen(function* () {
      const { args, path, root, write } = yield* fixture();
      const hookRoot = path.join(root, "agent_extensions/@acme/hooks/guard");
      yield* write(".claude/settings.json", content(hookRoot));
      const work = workObservations(false);
      const inventory = yield* observeAgentOutputs({
        ...args,
        expectedHooks: declare
          ? [{ name: "guard", ref: "@acme/hooks/guard", scope: "project", root: hookRoot }]
          : [],
      }).pipe(work.provide);
      return {
        settings: path.join(root, ".claude/settings.json"),
        parses: work.facts.filter(
          (fact) => fact.kind === "axm.parse.native" && fact.attributes?.["axm.format"] === "jsonc",
        ).length,
        hooks: inventory.outputs.filter((output) => output.extensionType === "hook"),
        diagnostics: inventory.diagnostics.filter(
          (diagnostic) => diagnostic.extensionType === "hook",
        ),
      };
    });

  it.effect("parses a file holding only foreign registrations once", () =>
    provide(
      Effect.gen(function* () {
        const observed = yield* observeHookFile(() =>
          JSON.stringify({ hooks: { BeforeAgent: [{ command: "echo foreign" }] } }),
        );
        expect(observed.parses).toBe(1);
        expect(observed.diagnostics).toEqual([]);
        expect(observed.hooks).toEqual([
          {
            extensionType: "hook",
            containerPath: observed.settings,
            path: `${observed.settings}#hooks`,
            entryName: "hooks",
            nativeAddress: { kind: "key-path", path: observed.settings, keys: ["hooks"] },
            claimantAgentIds: ["claude-code"],
            ownership: "unowned",
            desired: false,
          },
        ]);
      }),
    ),
  );

  it.effect("parses an empty settings object once and reports nothing", () =>
    provide(
      Effect.gen(function* () {
        const observed = yield* observeHookFile(() => "{}");
        expect(observed.parses).toBe(1);
        expect(observed.hooks).toEqual([]);
        expect(observed.diagnostics).toEqual([]);
      }),
    ),
  );

  it.effect("parses a blank settings file not at all", () =>
    provide(
      Effect.gen(function* () {
        const observed = yield* observeHookFile(() => "  \n");
        expect(observed.parses).toBe(0);
        expect(observed.hooks).toEqual([]);
        expect(observed.diagnostics).toEqual([]);
      }),
    ),
  );

  it.effect("parses a file holding a declared registration once", () =>
    provide(
      Effect.gen(function* () {
        const observed = yield* observeHookFile(
          (hookRoot) =>
            JSON.stringify({
              hooks: {
                BeforeAgent: [{ hooks: [{ type: "command", command: `bash ${hookRoot}/run.sh` }] }],
              },
            }),
          true,
        );
        expect(observed.parses).toBe(1);
        expect(observed.hooks).toEqual([
          expect.objectContaining({
            path: `${observed.settings}#guard`,
            ownership: "declared",
            proof: "effective-native-declaration",
          }),
        ]);
      }),
    ),
  );
});

describe("skill locations retained for the caller's classification", () => {
  it.effect("answer exactly as a fresh capture would, without resolving again", () =>
    provide(
      Effect.gen(function* () {
        const { args, fs, path, root } = yield* fixture();
        const source = path.join(root, "skills/review/src");
        const linked = path.join(root, ".claude/skills/review");
        const dangling = path.join(root, ".claude/skills/leftover");
        yield* fs.makeDirectory(path.dirname(linked), { recursive: true });
        yield* fs.symlink(source, linked);
        yield* fs.symlink(path.join(root, "missing"), dangling);
        // The shared directory links to itself, so its referent fails.
        const shared = path.join(root, ".agents/skills");
        yield* fs.makeDirectory(path.dirname(shared), { recursive: true });
        yield* fs.symlink(shared, shared);
        const agents = yield* (yield* CodingAgentRepository).all;
        const readers = (yield* Effect.forEach(agents, (agent) =>
          agent.resolveNativeReadLocations({
            workspaceRoot: root,
            scope: "project",
            kind: "skill",
          }),
        )).flatMap((locations) => locations.map((location) => location.path));
        const { fileSystem, recording } = makeRecordingFileSystem(fs);
        const inventory = yield* observeAgentOutputs({
          ...args,
          expectedSkillSources: { review: [source] },
          retainSkillLocations: true,
        }).pipe(Effect.provideService(FileSystem.FileSystem, fileSystem));
        expect(inventory.outputs.find((output) => output.path === linked)).toMatchObject({
          ownership: "owned",
          proof: "canonical-source-link",
        });
        const locations = inventory.skillLocations;
        if (locations === undefined) return expect.unreachable("skill locations were requested");
        const entries = [linked, dangling];
        const referents = [shared, ...readers, source];
        const fresh = yield* captureNativeLocationSet({ entries, referents });

        recording.reset();
        for (const entry of entries)
          expect(yield* locations.entry(entry).pipe(Effect.result)).toEqual(
            yield* fresh.entry(entry).pipe(Effect.result),
          );
        for (const referent of referents)
          expect(yield* locations.referent(referent).pipe(Effect.result)).toEqual(
            yield* fresh.referent(referent).pipe(Effect.result),
          );
        expect(recording.calls()).toEqual([]);
        expect(Result.isFailure(yield* locations.referent(shared).pipe(Effect.result))).toBe(true);
        expect(yield* locations.entry(dangling)).toMatchObject({
          kind: "symlink",
          referentPath: undefined,
        });
      }),
    ),
  );

  it.effect("resolve a path the inventory did not observe live", () =>
    provide(
      Effect.gen(function* () {
        const { args, fs, path, root } = yield* fixture();
        const elsewhere = path.join(root, "elsewhere");
        yield* fs.makeDirectory(elsewhere);
        const { fileSystem, recording } = makeRecordingFileSystem(fs);
        const inventory = yield* observeAgentOutputs({ ...args, retainSkillLocations: true }).pipe(
          Effect.provideService(FileSystem.FileSystem, fileSystem),
        );
        const locations = inventory.skillLocations;
        if (locations === undefined) return expect.unreachable("skill locations were requested");
        const fresh = yield* captureNativeLocationSet({
          entries: [elsewhere],
          referents: [elsewhere],
        });

        recording.reset();
        expect(yield* locations.entry(elsewhere)).toEqual(yield* fresh.entry(elsewhere));
        expect(yield* locations.referent(elsewhere)).toEqual(yield* fresh.referent(elsewhere));
        expect(recording.counts(elsewhere)).toEqual({ readLink: 1, stat: 1, realPath: 2 });
      }),
    ),
  );

  it.effect("are absent unless requested", () =>
    provide(
      Effect.gen(function* () {
        const { args } = yield* fixture();
        expect(yield* observeAgentOutputs(args)).not.toHaveProperty("skillLocations");
      }),
    ),
  );
});
