import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import type * as Scope from "effect/Scope";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { resolveProjectWorkspaceLayout, SettingsSchema } from "@agentxm/workspace-state";

import {
  observeAgentOutputs,
  observeWorkspaceOwnershipIssues,
} from "./agent-output-observation.js";
import type { CodingAgentRepository } from "./agents/coding-agent-repository.js";
import { codingAgentRepositoryLayer } from "./testing.js";

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
      scope: "project" as const,
      desiredAgentIds: new Set<string>(),
      expectedNames,
      skillOwnershipRoots: [layout.acquiredRoot, layout.authoredRoot("skill")],
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
  effect.pipe(
    Effect.provide(Layer.mergeAll(codingAgentRepositoryLayer([]), NodeServices.layer)),
    Effect.scoped,
  );

describe("authored skill exclusion", () => {
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
