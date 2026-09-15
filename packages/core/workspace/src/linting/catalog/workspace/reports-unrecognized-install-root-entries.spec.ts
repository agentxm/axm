import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { lintProject, lintServices } from "../../test-helpers.js";
import { isolatedLintRules, makeLintWorkspace } from "../../testing.js";

export const specification = defineSpecification({
  requirement: "cli/lint/reports-unrecognized-install-root-entries",
  title: "Lint reports unrecognized install root entries",
  statement:
    "When the install root holds an entry that is neither an installed package nor AXM staging, lint shall report one warning per such entry under workspace/install-root-entries-recognized stating its path, scope, and entry kind, and shall not change the entry.",
  class: "functional",
  role: "experience",
  goals: ["actionable-diagnostics", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  boundary: "memory",
  boundaryRationale:
    "Entry kinds (file, directory, symbolic link) and AXM staging names are observed from a real install root on disk.",
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const PACKAGE = "agent_extensions/agentxm/@acme/skills/review";

describe("Unrecognized install root entries", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("reports files, directories, and links but not packages or AXM staging", () => {
    const workspace = makeLintWorkspace({
      settings: {
        owner: "@acme",
        lint: { rules: isolatedLintRules("workspace/install-root-entries-recognized", undefined) },
      },
      files: {
        [`${PACKAGE}/skill.json`]: JSON.stringify({
          owner: "@acme",
          type: "skill",
          name: "review",
          version: "1.0.0",
        }),
        [`${PACKAGE}.axm-staging/src/SKILL.md`]: "# Staging\n",
        [`${PACKAGE}.axm-backup/src/SKILL.md`]: "# Backup\n",
        "agent_extensions/notes.txt": "notes\n",
        "agent_extensions/agentxm/stray/readme.md": "stray\n",
        "foreign/readme.md": "foreign\n",
      },
    });
    cleanups.push(workspace.cleanup);
    workspace.link("agent_extensions/linked", "foreign");
    return Effect.gen(function* () {
      const before = workspace.snapshot();
      const { document, outcome } = yield* lintProject(workspace);
      expect(outcome).toBe("success");
      expect(
        document.findings
          .map(({ ruleId, severity, message, location }) => ({
            ruleId,
            severity,
            message,
            file: location?.file,
          }))
          .sort((left, right) => (left.file ?? "").localeCompare(right.file ?? "")),
      ).toEqual(
        [
          ["agent_extensions/agentxm/stray", "directory"],
          ["agent_extensions/linked", "symlink"],
          ["agent_extensions/notes.txt", "file"],
        ].map(([file, kind]) => ({
          ruleId: "workspace/install-root-entries-recognized",
          severity: "warning",
          message: `Unrecognized ${kind} ${file} in the project-scope install root is not an installed package or AXM staging.`,
          file,
        })),
      );
      expect(workspace.snapshot()).toEqual(before);
    }).pipe(Effect.provide(lintServices(workspace)));
  });
});
