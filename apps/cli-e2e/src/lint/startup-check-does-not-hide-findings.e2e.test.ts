/**
 * Disabling the startup update check must not change what a lint run reports.
 *
 * This is a startup-composition regression guard, not a decision of the
 * official-skill compatibility rule: `AXM_NO_UPDATE_CHECK` short-circuits a
 * runtime step that once shared wiring with the compatibility policy, and a
 * regression there would silently empty the local findings.
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import { createTempDir, runCli } from "../e2e/utils.js";

/** Binds this file's evidence to the requirement whose binding it supports. */
export const executionBinding = {
  requirements: ["cli/lint/declared-official-skill-must-be-compatible"],
  boundary: "process",
  rationale:
    "Only a real CLI invocation composes the startup update check alongside the lint path, so only a process can show that disabling the check leaves the local compatibility finding in place.",
} as const;

/** Every file under a root, so the run can be shown to have written nothing. */
const snapshot = (root: string): ReadonlyArray<readonly [string, string]> => {
  const entries: Array<readonly [string, string]> = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      const relative = path.relative(root, child);
      if (entry.isSymbolicLink()) {
        entries.push([relative, `symlink:${fs.readlinkSync(child)}`]);
        continue;
      }
      if (entry.isDirectory()) {
        entries.push([relative, "directory"]);
        walk(child);
        continue;
      }
      entries.push([relative, fs.readFileSync(child, "utf8")]);
    }
  };
  walk(root);
  return entries.sort((left, right) => left[0].localeCompare(right[0]));
};

describe("startup update check and local lint findings", () => {
  it("disabling the startup update check does not hide local compatibility findings", async () => {
    const temp = createTempDir("axm-lint-startup-check-e2e-");
    try {
      fs.writeFileSync(
        path.join(temp.path, "axm.json"),
        `${JSON.stringify({ agents: [], skills: { axm: "@agentxm/skills/axm" } }, null, 2)}\n`,
      );
      const before = snapshot(temp.path);

      const result = await runCli(["lint", "--json"], {
        cwd: temp.path,
        env: { AXM_NO_UPDATE_CHECK: "1", DO_NOT_TRACK: "1" },
      });

      const document: unknown = JSON.parse(result.stdout);
      expect(document).toMatchObject({
        result: {
          axmSkillCompatibility: { reasonCode: "axm-skill-missing" },
          findings: expect.arrayContaining([
            expect.objectContaining({
              ruleId: "workspace/axm-skill-compatible",
              severity: "error",
            }),
          ]),
        },
      });
      expect(result.exitCode).toBe(1);
      expect(snapshot(temp.path)).toEqual(before);
    } finally {
      temp.cleanup();
    }
  });
});
