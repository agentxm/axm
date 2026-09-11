/**
 * Built-CLI evidence for `cli/approval-required-names-a-valid-recovery`.
 *
 * The specification lives in
 * `apps/cli/src/root/shared/approval-required-names-a-valid-recovery.spec.ts`,
 * beside the adapter that composes the recovery command. This row keeps its
 * process control: the emitted advance-approval command is replayed on a real
 * command line and the workspace transition it produces is observed.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";

import { defineExecutionBinding } from "@agentxm/specification-metadata";

import { makeDirectoryFixture } from "./test-support/directory-harness.js";
import { PlanResolutionDocument } from "./test-support/machine-documents.js";
import { writeAuthoredSkill } from "./test-support/protected-state.js";
import { writeLocalSkillPackage } from "./test-support/spec-file-store.js";
import { snapshotWorkspaceContent } from "./test-support/workspace-fixtures.js";

export const executionBinding = defineExecutionBinding({
  requirements: ["cli/approval-required-names-a-valid-recovery"],
  boundary: "process",
  rationale:
    "Only a real command line shows that the emitted recovery parses and, when run, produces exactly the transition it promised while leaving unrelated workspace content alone.",
});

const SKILL = "review";
const FQN = "@acme/skills/review";

/** These fixtures use unquoted tokens; replay never evaluates a shell command. */
const argvOf = (cmd: string): ReadonlyArray<string> => {
  expect(cmd).toMatch(/^[A-Za-z0-9_@%+=:,./^ -]+$/u);
  const [program, ...rest] = cmd.split(" ");
  expect(program).toBe("axm");
  return rest;
};

describe("Advance-approval recovery over the built CLI", () => {
  it("executes the emitted advance-approval replay through the built CLI and replaces only the selected authored package", async () => {
    const fixture = makeDirectoryFixture();
    try {
      fs.writeFileSync(
        path.join(fixture.invoking, "axm.json"),
        JSON.stringify({
          owner: "@acme",
          agents: [],
          skills: { review: "workspace" },
          minimumReleaseAge: "0s",
        }),
      );
      writeAuthoredSkill(fixture.invoking, {
        name: SKILL,
        description: "Previous authored guidance.",
      });
      const replacement = writeLocalSkillPackage(fixture.invoking, {
        name: SKILL,
        body: "Selected replacement guidance.",
      });
      fs.writeFileSync(
        path.join(fixture.invoking, "unrelated.txt"),
        "Unrelated workspace content.\n",
      );
      const sourceBefore = snapshotWorkspaceContent(replacement);
      const before = snapshotWorkspaceContent(fixture.invoking);
      const blocked = await fixture.run([
        "demote",
        FQN,
        "./vendor/review",
        "--json",
        "--non-interactive",
      ]);
      expect(blocked.exitCode, blocked.stdout + blocked.stderr).toBe(2);
      const blockedDocument = Schema.decodeUnknownSync(PlanResolutionDocument)(
        JSON.parse(blocked.stdout),
      );
      expect(blockedDocument.result).toMatchObject({
        outcome: "blocked",
        counts: { committed: 0 },
        blocking: { class: "approval-required", subject: "replace-workspace-authority" },
      });
      expect(snapshotWorkspaceContent(fixture.invoking)).toEqual(before);
      const recovery = blockedDocument.result.blocking?.escape?.cmd;
      if (recovery === undefined) throw new Error("Expected an emitted demote recovery command");
      const argv = argvOf(recovery);
      expect(argv[0]).toBe("demote");
      expect(argv).toContain("--yes");
      expect(argv).toContain(FQN);
      expect(argv).toContain("./vendor/review");
      const applied = await fixture.run(argv);
      expect(applied.exitCode, applied.stdout + applied.stderr).toBe(0);
      const appliedDocument = Schema.decodeUnknownSync(PlanResolutionDocument)(
        JSON.parse(applied.stdout),
      );
      expect(appliedDocument.result.outcome).toBe("applied");
      const settings: unknown = JSON.parse(
        fs.readFileSync(path.join(fixture.invoking, "axm.json"), "utf8"),
      );
      expect(settings).toMatchObject({ skills: { review: "./vendor/review" } });
      expect(fs.existsSync(path.join(fixture.invoking, "skills/review"))).toBe(false);
      expect(
        snapshotWorkspaceContent(
          path.join(fixture.invoking, "agent_extensions/local/vendor/review"),
        ),
      ).toEqual(sourceBefore);
      expect(snapshotWorkspaceContent(replacement)).toEqual(sourceBefore);
      expect(fs.readFileSync(path.join(fixture.invoking, "unrelated.txt"), "utf8")).toBe(
        "Unrelated workspace content.\n",
      );
    } finally {
      fixture.cleanup();
    }
  });
});
