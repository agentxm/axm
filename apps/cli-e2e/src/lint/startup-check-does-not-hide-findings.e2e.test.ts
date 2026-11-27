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
import { snapshotTree } from "@agentxm/test-support";

import { createTempDir } from "@agentxm/client-e2e-utils";
import { runCli } from "../utils.js";

/** Binds this file's evidence to the requirement whose binding it supports. */
export const executionBinding = {
  requirements: ["cli/lint/declared-official-skill-must-be-compatible"],
  boundary: "process",
  rationale:
    "Only a real CLI invocation composes the startup update check alongside the lint path, so only a process can show that disabling the check leaves the local compatibility finding in place.",
} as const;

describe("startup update check and local lint findings", () => {
  it("disabling the startup update check does not hide local compatibility findings", async () => {
    const temp = createTempDir("axm-lint-startup-check-e2e-");
    try {
      // The bundled official skill is declared but its package is absent.
      fs.writeFileSync(
        path.join(temp.path, "axm.json"),
        `${JSON.stringify(
          {
            agents: [],
            skills: { axm: { source: "workspace", enabled: true, origin: "bundled" } },
          },
          null,
          2,
        )}\n`,
      );
      const before = snapshotTree(temp.path);

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
      expect(snapshotTree(temp.path)).toEqual(before);
    } finally {
      temp.cleanup();
    }
  });
});
