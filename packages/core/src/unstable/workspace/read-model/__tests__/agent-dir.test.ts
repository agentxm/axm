/**
 * Agent-directory scanner: covers per-agent skill and subagent
 * directories declared by the existing `AgentRegistry`. Each occurrence
 * carries an `agent-dir` discriminator parameterized by `agentId` and the
 * subject `type`.
 */

import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import { AGENTS } from "../../../agents/registry.js";
import type { AgentId } from "../../../agents/types.js";
import { buildFixture } from "../__fixtures__/builder.js";
import { makeDiagnostics, type Warning } from "../diagnostics.js";
import { makeAgentDirScanner } from "../scanners/agent-dir.js";

const WORKSPACE_ROOT = "/ws";
const USER_HOME = "/home/user";

const expectedSkillAgentIdsFor = (agentIds: ReadonlyArray<AgentId>): ReadonlyArray<string> => {
  const observedDirs = agentIds.flatMap((agentId) => {
    const skills = AGENTS[agentId].skills;
    return skills === undefined ? [] : [skills.dir];
  });
  return observedDirs
    .flatMap((observedDir) =>
      Object.values(AGENTS).flatMap((agent) => {
        const skills = agent.skills;
        return skills !== undefined &&
          [skills.dir, ...skills.additionalReadPaths.map(({ path }) => path)].includes(observedDir)
          ? [agent.id]
          : [];
      }),
    )
    .sort();
};

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

layer(Path.layer, { excludeTestServices: true })("agent-dir scanner", (it) => {
  it.effect("emits no occurrences when no agent directory exists", () =>
    Effect.gen(function* () {
      const { occurrences, warnings } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {},
      });
      expect(occurrences).toEqual([]);
      expect(warnings).toEqual([]);
    }),
  );

  it.effect("does not scan the workspace root for an empty skills directory", () =>
    Effect.gen(function* () {
      const codemakerDescriptor = AGENTS.codemaker;
      const { occurrences } = yield* runScanner(
        {
          workspaceRoot: WORKSPACE_ROOT,
          userHome: USER_HOME,
          project: {
            agentDirs: {
              "claude-code": {
                "skills/some-skill/SKILL.md": "# some-skill\n",
              },
            },
          },
        },
        {
          agentRegistry: {
            ...AGENTS,
            codemaker: {
              ...codemakerDescriptor,
              skills: { dir: "", additionalReadPaths: [] },
            },
          },
        },
      );

      expect(
        occurrences.filter(
          (occurrence) => occurrence.type === "skill" && occurrence.agentId === "codemaker",
        ),
      ).toEqual([]);
    }),
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
    }),
  );

  it.effect("attributes a Skill in an additional read path to the compatible agent", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          agentDirs: {
            "claude-code": {
              "skills/compatible-skill/SKILL.md": "# compatible-skill\n",
            },
          },
        },
      });

      expect(
        occurrences.some(
          (occurrence) =>
            occurrence.type === "skill" &&
            occurrence.agentId === "cursor" &&
            occurrence.name === "compatible-skill" &&
            occurrence.contentLocation === "/ws/.claude/skills/compatible-skill",
        ),
      ).toBe(true);
    }),
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
      const expectedAgentIds = expectedSkillAgentIdsFor(["claude-code", "codex"]);
      expect(matches).toHaveLength(expectedAgentIds.length);
      const agentIds = matches.map((o) => o.agentId).sort();
      expect(agentIds).toEqual(expectedAgentIds);
      // Distinct contentLocations.
      expect(new Set(matches.map((o) => o.contentLocation)).size).toBe(2);
    }),
  );

  it.effect("emits subagent occurrences for agents with a subagents dir", () =>
    Effect.gen(function* () {
      const { occurrences } = yield* runScanner({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          agentDirs: {
            "claude-code": {
              "agents/code-reviewer.md": "# subagent\n",
            },
          },
        },
      });
      const subagents = occurrences.filter(
        (o) => o.type === "subagent" && o.agentId === "claude-code",
      );
      expect(subagents).toHaveLength(1);
      expect(subagents[0]?.name).toBe("code-reviewer");
      expect(subagents[0]?.contentLocation).toBe("/ws/.claude/agents/code-reviewer.md");
    }),
  );

  it.effect("emits Codex TOML subagent occurrences", () =>
    Effect.gen(function* () {
      const codexDescriptor = AGENTS.codex;
      const { occurrences } = yield* runScanner(
        {
          workspaceRoot: WORKSPACE_ROOT,
          userHome: USER_HOME,
          project: {
            agentDirs: {
              codex: {
                "agents/code-reviewer.toml": 'name = "code-reviewer"\n',
              },
            },
          },
        },
        {
          agentRegistry: {
            ...AGENTS,
            codex: {
              ...codexDescriptor,
              subagents: { dir: ".agents/agents", scopes: ["user", "project"] },
            },
          },
        },
      );
      const subagents = occurrences.filter(
        (occurrence) => occurrence.type === "subagent" && occurrence.agentId === "codex",
      );
      expect(subagents).toHaveLength(1);
      expect(subagents[0]?.name).toBe("code-reviewer");
      expect(subagents[0]?.contentLocation).toBe("/ws/.agents/agents/code-reviewer.toml");
    }),
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
          scopes: rooDescriptor.subagents?.scopes ?? ["project"],
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
    }),
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
    }),
  );
});
