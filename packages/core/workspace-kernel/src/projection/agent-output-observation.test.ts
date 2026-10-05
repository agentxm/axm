import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";

import { captureCopiedDirectory } from "../locations/index.js";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { resolveProjectWorkspaceLayout, SettingsSchema } from "../workspace-state/index.js";
import { codingAgentFromDescriptor } from "../agent-adapters/index.js";

import {
  observeAgentOutputs,
  observeWorkspaceOwnershipIssues,
} from "./agent-output-observation.js";
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
      expectedMcpEntries: {},
      expectedSkillSources: { other: [path.join(layout.authoredRoot("skill"), "other/src")] },
      expectedSubagentFiles: {},
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
          root: "agent_extensions/registry.agentxm.ai/@acme/hooks/audit",
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
                      command: "echo audit",
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
          ownership: "owned",
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
        const issues = yield* observeWorkspaceOwnershipIssues({
          ...args,
          configuredAgentIds: new Set<string>(),
        });
        expect(issues).toEqual([]);
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
