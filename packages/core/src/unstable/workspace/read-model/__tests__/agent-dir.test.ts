/**
 * Agent-directory scanner: covers per-agent skill, command, and subagent
 * directories declared by the existing `AgentRegistry`. Each occurrence
 * carries an `agent-dir` discriminator parameterized by `agentId` and the
 * subject `type`.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { AGENTS } from "../../../agents/registry.js";
import { buildFixture } from "../__fixtures__/builder.js";
import { makeDiagnostics, type Warning } from "../diagnostics.js";
import { makeAgentDirScanner } from "../scanners/agent-dir.js";

const WORKSPACE_ROOT = "/ws";
const USER_HOME = "/home/user";

const runScanner = (
  spec: Parameters<typeof buildFixture>[0],
  options?: { readonly agentRegistry?: typeof AGENTS },
) =>
  Effect.gen(function* () {
    const deps = yield* buildFixture(spec);
    const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
    const diag = makeDiagnostics(ref);
    const occurrences = yield* makeAgentDirScanner(
      options?.agentRegistry === undefined
        ? {
            fs: deps.fs,
            path: deps.path,
            workspaceRoot: spec.workspaceRoot,
            scope: "project",
            diagnostics: diag,
          }
        : {
            fs: deps.fs,
            path: deps.path,
            workspaceRoot: spec.workspaceRoot,
            scope: "project",
            diagnostics: diag,
            agentRegistry: options.agentRegistry,
          },
    );
    return { occurrences, warnings: yield* Ref.get(ref) };
  });

describe("agent-dir scanner", () => {
  it.effect("emits no occurrences when no agent directory exists", () =>
    Effect.gen(function* () {
      const { occurrences, warnings } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {},
      });
      expect(occurrences).toEqual([]);
      expect(warnings).toEqual([]);
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("emits skill occurrences for .claude/skills/<name>", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          agentDirs: {
            "claude-code": {
              "skills/some-skill/SKILL.md": "# some-skill\n",
              "skills/other-skill/SKILL.md": "# other-skill\n",
            },
          },
        },
      });
      const skillOccurrences = occurrences.filter((o) => o.type === "skill");
      const claudeSkills = skillOccurrences.filter((o) => o.agentId === "claude-code");
      expect(claudeSkills).toHaveLength(2);
      const names = claudeSkills.map((o) => o.name).sort();
      expect(names).toEqual(["other-skill", "some-skill"]);
      for (const o of claudeSkills) {
        expect(o._tag).toBe("agent-dir");
        expect(o.scope).toBe("project");
        expect(o.contentLocation.startsWith("/ws/.claude/skills/")).toBe(true);
      }
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("emits same skill name in two agent dirs as two distinct occurrences", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          agentDirs: {
            "claude-code": {
              "skills/some-skill/SKILL.md": "# claude\n",
            },
            codex: {
              "skills/some-skill/SKILL.md": "# codex\n",
            },
          },
        },
      });
      const matches = occurrences.filter((o) => o.type === "skill" && o.name === "some-skill");
      expect(matches).toHaveLength(2);
      const agentIds = matches.map((o) => o.agentId).sort();
      expect(agentIds).toEqual(["claude-code", "codex"]);
      // Distinct contentLocations.
      expect(new Set(matches.map((o) => o.contentLocation)).size).toBe(2);
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("emits command occurrences for agents with a commands dir", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          agentDirs: {
            "claude-code": {
              "commands/some-command/some-command.md": "# cmd\n",
            },
          },
        },
      });
      const commands = occurrences.filter(
        (o) => o.type === "command" && o.agentId === "claude-code",
      );
      expect(commands).toHaveLength(1);
      expect(commands[0]?.name).toBe("some-command");
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("emits subagent occurrences for agents with a subagents dir", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          agentDirs: {
            "claude-code": {
              "agents/code-reviewer/code-reviewer.md": "# subagent\n",
            },
          },
        },
      });
      const subagents = occurrences.filter(
        (o) => o.type === "subagent" && o.agentId === "claude-code",
      );
      expect(subagents).toHaveLength(1);
      expect(subagents[0]?.name).toBe("code-reviewer");
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("emits a single-file subagent occurrence when subagents dir is a file", () =>
    Effect.gen(function* () {
      // roo's subagents.dir is `.roomodes` with isFile: true. The fixture
      // builder writes `agentDirs[roo]` under `.roo` (first segment of
      // `.roo/skills`). We override roo's descriptor so its subagents file
      // resolves under `.roo/<agent-file>`, matching what the builder
      // synthesizes.
      const rooDescriptor = AGENTS["roo"];
      const fakeAgent = {
        ...rooDescriptor,
        subagents: {
          dir: ".roo/agent-file.txt",
          isFile: true,
        },
      };
      const { occurrences } = yield* runScanner(
        {
          workspaceRoot: WORKSPACE_ROOT,
          userHome: USER_HOME,
          project: {
            agentDirs: {
              roo: {
                "agent-file.txt": "ok\n",
              },
            },
          },
        },
        { agentRegistry: { ...AGENTS, roo: fakeAgent } },
      );
      const fileOccurrences = occurrences.filter(
        (o) => o.type === "subagent" && o.agentId === "roo",
      );
      expect(fileOccurrences).toHaveLength(1);
      expect(fileOccurrences[0]?.name).toBe("agent-file-txt");
      expect(fileOccurrences[0]?.contentLocation).toBe("/ws/.roo/agent-file.txt");
    }).pipe(Effect.provide(Path.layer)),
  );

  it.effect("does not emit rule occurrences (no agent in v1 registry exposes rules)", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          agentDirs: {
            cursor: {
              "rules/some-rule.mdc": "# rule\n",
            },
          },
        },
      });
      // cursor doesn't expose a rules dir on its descriptor; the scanner emits
      // no rule occurrences. A skill occurrence for `.cursor/skills` is also
      // absent in this fixture.
      // `type` is statically narrowed to AgentDirSubjectType; "rule" is not a
      // member, so a runtime check would never match. Verify instead that the
      // total occurrence count for `.cursor` is 0 (no rule subject is enumerated).
      const cursorEntries = occurrences.filter((o) => o.agentId === "cursor");
      expect(cursorEntries).toEqual([]);
    }).pipe(Effect.provide(Path.layer)),
  );
});
