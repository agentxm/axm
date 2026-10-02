import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { makeRegistrySkillLockEntry } from "@agentxm/workspace-kernel/workspace-state/testing";

import { lintProjectWithHome, lintServices } from "../../test-helpers.js";
import { isolatedLintRules, makeLintWorkspace } from "../../testing.js";

export const specification = defineSpecification({
  requirement: "cli/lint/reports-user-outputs-without-settings",
  title: "Lint reports AXM-owned user-scope agent outputs when user settings are unreadable",
  statement:
    "When user-scope agent outputs carry AXM ownership proof and the user workspace has no readable settings, a project lint run shall report one warning per such output under workspace/user-outputs-have-settings naming its type, path, ownership proof, and the expected user settings path, as facts without commands, and shall not report user-scope outputs without ownership proof.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity"],
  methods: ["example"],
  boundary: "memory",
  boundaryRationale:
    "Ownership proof is a real symlink to the exact canonical source named by an accepted user-scope resolution and settings readability is a real file under a separate user home; production lint observes both without mutating either.",
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const RULE_ID = "workspace/user-outputs-have-settings";
const CANONICAL = ".axm/workspace/agent_extensions/registry/@acme/skills/review/src";
const skill = (name: string) => `---\nname: ${name}\ndescription: Fixture\n---\n# Skill\n`;

describe("User outputs without settings", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("reports owned user outputs until the user workspace has readable settings", () => {
    const project = makeLintWorkspace({
      settings: { lint: { rules: isolatedLintRules(RULE_ID, undefined) } },
    });
    const home = makeLintWorkspace({
      files: {
        [`${CANONICAL}/SKILL.md`]: skill("review"),
        ".axm/workspace/axm-lock.yaml": JSON.stringify({
          lockfileVersion: 9,
          skills: {
            review: makeRegistrySkillLockEntry({
              owner: decodeHandleSync("@acme"),
              name: "review",
              sourceName: "agentxm",
            }),
          },
        }),
        ".claude/skills/notes/SKILL.md": skill("notes"),
      },
    });
    home.link(".claude/skills/review", CANONICAL);
    cleanups.push(project.cleanup, home.cleanup);
    return Effect.gen(function* () {
      const before = [project.snapshot(), home.snapshot()];
      const { document } = yield* lintProjectWithHome(project, home.root);
      expect(
        document.findings.map(({ ruleId, severity, message, location }) => ({
          ruleId,
          severity,
          message,
          file: location?.file,
        })),
      ).toEqual([
        {
          ruleId: RULE_ID,
          severity: "warning",
          message:
            "User-scope agent skill ~/.claude/skills/review links to its accepted canonical source, but the user workspace has no readable settings at ~/.axm/workspace/axm.json.",
          file: "~/.claude/skills/review",
        },
      ]);
      expect([project.snapshot(), home.snapshot()]).toEqual(before);

      home.writeFile(".axm/workspace/axm.json", `${JSON.stringify({ agents: [] })}\n`);
      const settled = yield* lintProjectWithHome(project, home.root, { strict: true });
      expect(settled.document.findings).toEqual([]);
    }).pipe(Effect.provide(lintServices(project)));
  });
});
