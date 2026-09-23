import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import * as Effect from "effect/Effect";
import type * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import { WorkspaceReadModelTest } from "./__fixtures__/test-layer.js";
import { makeWorkspaceReadModel } from "../../index.js";

export const specification = defineSpecification({
  requirement: "workspace-inventory/unreadable-paths-remain-visible",
  title: "Incomplete workspace observations identify unreadable paths",
  statement:
    "When filesystem access prevents observing part of a workspace, its inventory shall retain healthy observations and report a diagnostic identifying the unreadable path.",
  class: "functional",
  role: "interface",
  goals: ["workspace-intent-fidelity", "actionable-diagnostics"],
  methods: ["decision-table", "example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const nativeManifest = (owner: string, name: string) =>
  JSON.stringify({ owner, type: "skill", name });
const cases = [
  { method: "stat", path: "/ws/agent_extensions/registry/@blocked/skills/blocked-skill" },
  { method: "readDirectory", path: "/ws/agent_extensions/registry/@blocked/skills" },
  {
    method: "readFileString",
    path: "/ws/agent_extensions/registry/@blocked/skills/blocked-skill/skill.json",
  },
  { method: "stat", path: "/ws/agent_extensions/registry/@blocked/skills/blocked-skill/src" },
  { method: "readFileString", path: "/ws/agent_extensions/external/portable/SKILL.md" },
  { method: "readFile", path: "/ws/.claude/agents/blocked-agent.md" },
] as const;

describe("partial workspace inventory", () => {
  it.effect.each(cases)(
    "retains healthy entries when $method fails at $path",
    ({ method, path }) => {
      const wrapFileSystem = (fs: FileSystem.FileSystem): FileSystem.FileSystem => {
        const denied = PlatformError.systemError({
          _tag: "PermissionDenied",
          module: "FileSystem",
          method,
          pathOrDescriptor: path,
          description: "fixture permission denied",
        });
        const observe = <A>(
          operation: string,
          location: string,
          effect: Effect.Effect<A, PlatformError.PlatformError>,
        ) => (operation === method && location === path ? Effect.fail(denied) : effect);
        return {
          ...fs,
          stat: (location) => observe("stat", location, fs.stat(location)),
          readDirectory: (location) =>
            observe("readDirectory", location, fs.readDirectory(location)),
          readFileString: (location, ...args) =>
            observe("readFileString", location, fs.readFileString(location, ...args)),
          readFile: (location) => observe("readFile", location, fs.readFile(location)),
        };
      };
      return Effect.gen(function* () {
        const model = yield* makeWorkspaceReadModel("project");
        const [skills, subagents] = yield* Effect.all(
          [model.skills.actual, model.subagents.actual],
          { concurrency: "unbounded" },
        );
        expect(skills.some((entry) => entry.key.name === "healthy-skill")).toBe(true);
        expect(subagents.some((entry) => entry.key.name === "healthy-agent")).toBe(true);
        expect(yield* model.diagnostics).toContainEqual(
          expect.objectContaining({
            source: "scanner",
            code: "scanner-io",
            path,
          }),
        );
      }).pipe(
        Effect.provide(
          WorkspaceReadModelTest(
            {
              workspaceRoot: "/ws",
              userHome: "/home/user",
              project: {
                axmExtensions: {
                  "registry/@healthy/skills/healthy-skill/skill.json": nativeManifest(
                    "@healthy",
                    "healthy-skill",
                  ),
                  "registry/@healthy/skills/healthy-skill/src/SKILL.md": "# Healthy\n",
                  "registry/@blocked/skills/blocked-skill/skill.json": nativeManifest(
                    "@blocked",
                    "blocked-skill",
                  ),
                  "registry/@blocked/skills/blocked-skill/src/SKILL.md": "# Blocked\n",
                  "external/portable/SKILL.md":
                    "---\nname: portable\ndescription: Portable skill.\n---\n",
                },
                agentDirs: {
                  "claude-code": {
                    "agents/healthy-agent.md": "Healthy agent.",
                    "agents/blocked-agent.md": "Blocked agent.",
                  },
                },
              },
            },
            { wrapFileSystem },
          ),
        ),
      );
    },
  );
});
