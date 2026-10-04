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
import { AGENT_DESCRIPTORS } from "@agentxm/extension-model/unstable/agents/registry";
import type { MaterializationTargetId } from "@agentxm/extension-model/unstable/agents/types";
import { buildFixture } from "../__fixtures__/builder.js";
import { makeDiagnostics, type Warning } from "../diagnostics.js";
import { makeAgentDirScanner } from "../scanners/agent-dir.js";

const WORKSPACE_ROOT = "/ws";
const USER_HOME = "/home/user";

const expectedSkillAgentIdsFor = (
  agentIds: ReadonlyArray<MaterializationTargetId>,
): ReadonlyArray<string> => {
  const observedDirs = agentIds.flatMap((agentId) => {
    const skills = AGENT_DESCRIPTORS[agentId].skills;
    return skills === undefined
      ? []
      : skills.locations
          .filter(
            (location) =>
              location.scope === "project" &&
              location.role === "primary" &&
              location.applicability.kind === "always",
          )
          .map((location) => location.path);
  });
  return observedDirs
    .flatMap((observedDir) =>
      Object.values(AGENT_DESCRIPTORS).flatMap((agent) => {
        const skills = agent.skills;
        return skills !== undefined &&
          skills.locations
            .filter(
              (location) =>
                location.scope === "project" && location.applicability.kind === "always",
            )
            .map(({ path }) => path)
            .includes(observedDir)
          ? [agent.id]
          : [];
      }),
    )
    .sort();
};

const runScanner = (
  spec: Parameters<typeof buildFixture>[0],
  options?: { readonly agentRegistry?: typeof AGENT_DESCRIPTORS },
) =>
  Effect.gen(function* () {
    const deps = yield* buildFixture(spec);
    const ref = yield* Ref.make<ReadonlyArray<Warning>>([]);
    const diag = makeDiagnostics(ref);
    const occurrences = yield* makeAgentDirScanner(
      options?.agentRegistry === undefined
        ? {
            nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
            fs: deps.fs,
            path: deps.path,
            workspaceRoot: spec.workspaceRoot,
            scope: "project",
            diagnostics: diag,
          }
        : {
            nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
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
  it.effect("shares ancestor reads within a scan and observes them afresh on the next scan", () =>
    Effect.gen(function* () {
      const deps = yield* buildFixture({
        workspaceRoot: WORKSPACE_ROOT,
        userHome: USER_HOME,
        project: {
          agentDirs: { "claude-code": { "skills/review/SKILL.md": "# Review\n" } },
        },
      });
      const rootReads = yield* Ref.make(0);
      const warnings = yield* Ref.make<ReadonlyArray<Warning>>([]);
      const scan = makeAgentDirScanner({
        nativeDirectoryInputs: { skillsDirectoryOverrides: {} },
        fs: {
          ...deps.fs,
          readDirectory: (target, options) =>
            (target === "/" ? Ref.update(rootReads, (count) => count + 1) : Effect.void).pipe(
              Effect.andThen(deps.fs.readDirectory(target, options)),
            ),
        },
        path: deps.path,
        workspaceRoot: WORKSPACE_ROOT,
        scope: "project",
        diagnostics: makeDiagnostics(warnings),
      });
      const first = yield* scan;
      expect(first.some((occurrence) => occurrence.name === "review")).toBe(true);
      expect(yield* Ref.get(rootReads)).toBe(1);
      expect(yield* scan).toEqual(first);
      expect(yield* Ref.get(rootReads)).toBe(2);
      expect(yield* Ref.get(warnings)).toEqual([]);
    }),
  );

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
      const codemakerDescriptor = AGENT_DESCRIPTORS.codemaker;
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
            ...AGENT_DESCRIPTORS,
            codemaker: {
              ...codemakerDescriptor,
              skills: { locations: [], scopes: ["project"], writerSupported: true },
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
      const codexDescriptor = AGENT_DESCRIPTORS.codex;
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
            ...AGENT_DESCRIPTORS,
            codex: {
              ...codexDescriptor,
              subagents: {
                locations: [
                  {
                    scope: "project",
                    root: "project",
                    path: ".agents/agents",
                    shape: "directory",
                    role: "primary",
                    status: "canonical",
                    applicability: { kind: "always" },
                    provenance: { kind: "capability-sources" },
                  },
                ],
                scopes: ["user", "project"],
                writerSupported: true,
              },
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
      const rooDescriptor = AGENT_DESCRIPTORS["roo"];
      const fakeAgent = {
        ...rooDescriptor,
        subagents: {
          locations: [
            {
              scope: "project",
              root: "project",
              path: ".roo/agent-file.txt",
              shape: "file",
              role: "primary",
              status: "canonical",
              applicability: { kind: "always" },
              provenance: { kind: "capability-sources" },
            },
          ],
          writerSupported: false,
          scopes: rooDescriptor.subagents?.scopes ?? ["project"],
        },
      } satisfies typeof rooDescriptor;
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
        { agentRegistry: { ...AGENT_DESCRIPTORS, roo: fakeAgent } },
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
