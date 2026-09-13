import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { defineSpecification } from "@agentxm/specification-metadata";
import { makeRegistrySkillLockEntry } from "@agentxm/workspace-state/testing";

import { lintProject, lintServices } from "../../test-helpers.js";
import { isolatedLintRules, makeLintWorkspace } from "../../testing.js";

export const specification = defineSpecification({
  requirement: "cli/lint/reports-installed-but-not-configured",
  title: "Lint reports installed packages that are not configured",
  statement:
    "When an installed package in the install root is reached by no desired route, lint shall report one warning per such package under workspace/installed-but-not-configured stating its identity, type, scope, canonical path, source directory, and whether a lock row exists, as facts without commands.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  boundary: "memory",
  boundaryRationale:
    "Leftovers are decided from a real install root, lockfile, and settings on disk; production lint observes them without mutating the workspace.",
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const ROOT = "agent_extensions/agentxm/@acme/skills";

const manifest = (name: string) =>
  JSON.stringify({ owner: "@acme", type: "skill", name, version: "1.0.0", description: "Fixture" });
const skill = (name: string) => `---\nname: ${name}\ndescription: Fixture\n---\n# Skill\n`;
const installed = (name: string) => ({
  [`${ROOT}/${name}/skill.json`]: manifest(name),
  [`${ROOT}/${name}/src/SKILL.md`]: skill(name),
});
const lockRow = (name: string) =>
  makeRegistrySkillLockEntry({ owner: decodeHandleSync("@acme"), name, sourceName: "agentxm" });

describe("Installed but not configured", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "reports each leftover with its facts and leaves configured packages unreported",
    () => {
      const workspace = makeLintWorkspace({
        settings: {
          owner: "@acme",
          skills: { kept: "agentxm:@acme/skills/kept" },
          lint: { rules: isolatedLintRules("workspace/installed-but-not-configured", undefined) },
        },
        files: {
          ...installed("kept"),
          ...installed("stale"),
          ...installed("orphan"),
          "axm-lock.yaml": JSON.stringify({
            lockfileVersion: 7,
            skills: { kept: lockRow("kept"), stale: lockRow("stale") },
          }),
        },
      });
      cleanups.push(workspace.cleanup);
      return Effect.gen(function* () {
        const before = workspace.snapshot();
        const { document, outcome } = yield* lintProject(workspace);
        expect(outcome).toBe("success");
        expect(
          [...document.findings]
            .map(({ ruleId, severity, message, location }) => ({
              ruleId,
              severity,
              message,
              file: location?.file,
            }))
            .sort((left, right) => (left.file ?? "").localeCompare(right.file ?? "")),
        ).toEqual([
          {
            ruleId: "workspace/installed-but-not-configured",
            severity: "warning",
            message: `Installed skill '@acme/skills/orphan' is not configured in project scope: canonical path ${ROOT}/orphan, source directory agentxm, no lock row.`,
            file: `${ROOT}/orphan`,
          },
          {
            ruleId: "workspace/installed-but-not-configured",
            severity: "warning",
            message: `Installed skill '@acme/skills/stale' is not configured in project scope: canonical path ${ROOT}/stale, source directory agentxm, lock row present.`,
            file: `${ROOT}/stale`,
          },
        ]);
        for (const finding of document.findings) {
          expect(finding.message).not.toMatch(/axm |run /);
        }
        const strict = yield* lintProject(workspace, { strict: true });
        expect(strict.outcome).toBe("fail");
        expect(workspace.snapshot()).toEqual(before);
      }).pipe(Effect.provide(lintServices(workspace)));
    },
  );

  it.effect("reports nothing when every installed package is configured", () => {
    const workspace = makeLintWorkspace({
      settings: {
        owner: "@acme",
        skills: { kept: "agentxm:@acme/skills/kept" },
        lint: { rules: isolatedLintRules("workspace/installed-but-not-configured", undefined) },
      },
      files: {
        ...installed("kept"),
        "axm-lock.yaml": JSON.stringify({ lockfileVersion: 7, skills: { kept: lockRow("kept") } }),
      },
    });
    cleanups.push(workspace.cleanup);
    return Effect.gen(function* () {
      const { document } = yield* lintProject(workspace, { strict: true });
      expect(document.findings).toEqual([]);
    }).pipe(Effect.provide(lintServices(workspace)));
  });
});
