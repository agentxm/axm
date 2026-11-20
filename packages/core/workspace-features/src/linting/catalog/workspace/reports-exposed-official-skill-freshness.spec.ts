import * as Effect from "effect/Effect";
import { expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/specification-metadata";
import { lintProjectWithHome, lintServices } from "../../test-helpers.js";
import {
  isolatedLintRules,
  makeLintWorkspace,
  makeOfficialAxmSkillWorkspace,
  officialAxmSkillPackage,
} from "../../testing.js";

export const specification = defineSpecification({
  requirement: "cli/lint/reports-exposed-official-skill-freshness",
  title: "Lint distinguishes exposed official guidance from declared compatibility",
  statement:
    "Lint shall warn once per physical official AXM skill tree with incompatible or missing compatibility metadata actually exposed to configured agents, retaining all discovery paths, readers, known version and ownership evidence. This warning shall neither establish ownership nor change the declared-skill compatibility result. Same-named content from another owner and content not exposed to configured agents shall not trigger it.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "agent-interoperability"],
  boundary: "platform",
  boundaryRationale:
    "Production lint observes separate project and user trees with multiple native links and preserves their bytes.",
  methods: ["example"],
  derivedFrom: ["cli/lint/undeclared-official-skill-is-informational"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});
const freshness = "workspace/exposed-axm-skill-compatible";
const overlap = "workspace/project-outputs-not-shadowed";

for (const { exposed, official } of [
  { exposed: true, official: true },
  { exposed: false, official: true },
  { exposed: true, official: false },
])
  it.effect(
    `legacy content warns only when official and exposed, with all links grouped: ${official}/${exposed}`,
    () => {
      const project = makeOfficialAxmSkillWorkspace("official-compatible", {
        settings: {
          agents: ["claude-code", "codex"],
          lint: {
            rules: {
              ...isolatedLintRules(freshness, undefined),
              [overlap]: "warn",
              "workspace/axm-skill-compatible": "error",
            },
          },
        },
      });
      const home = makeLintWorkspace({
        files: {
          ...officialAxmSkillPackage({
            packageRoot: ".legacy/axm",
            version: "0.0.1",
            metadata: null,
          }),
          ...(official
            ? {}
            : {
                ".legacy/axm/skill.json": JSON.stringify({
                  type: "skill",
                  owner: "@acme",
                  name: "axm",
                  version: "0.0.1",
                }),
              }),
        },
      });
      if (exposed) {
        home.link(".claude/skills/axm", ".legacy/axm/src");
        home.link(".agents/skills/axm", ".legacy/axm/src");
      }
      return Effect.gen(function* () {
        const before = [project.snapshot(), home.snapshot()];
        const result = yield* lintProjectWithHome(project, home.root);
        const findings = result.document.findings.filter(({ ruleId }) => ruleId === freshness);
        expect(findings).toHaveLength(exposed && official ? 1 : 0);
        if (exposed && official) {
          const message = findings[0]?.message ?? "";
          expect(message).toContain("0.0.1");
          expect(message).toContain(".claude/skills/axm");
          expect(message).toContain(".agents/skills/axm");
          expect(message).toContain("unowned");
          expect(result.document.findings.filter(({ ruleId }) => ruleId === overlap)).toHaveLength(
            1,
          );
        }
        expect(
          result.document.findings.filter(
            ({ ruleId }) => ruleId === "workspace/axm-skill-compatible",
          ),
        ).toEqual([]);
        expect(result.document.axmSkillCompatibility?.status).toBe("compatible");
        expect([project.snapshot(), home.snapshot()]).toEqual(before);
      }).pipe(
        Effect.provide(lintServices(project)),
        Effect.ensuring(
          Effect.sync(() => {
            project.cleanup();
            home.cleanup();
          }),
        ),
      );
    },
  );
