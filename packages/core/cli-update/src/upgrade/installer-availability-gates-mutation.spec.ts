import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { Npm } from "../install-method/install-method.js";
import { TARGET_VERSION, runUpgradeTrial, type SubprocessInvocation } from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/upgrade/installer-availability-gates-mutation",
  title: "Installer availability gates upgrade mutation",
  statement:
    "Before mutating an npm-, pnpm-, Yarn-, or Homebrew-owned installation, upgrade shall establish that the selected exact version is available through that installer; lagging, leading, unavailable, or indeterminate publication state shall leave the installation unchanged and report recovery guidance.",
  class: "constraint",
  role: "experience",
  goals: ["trustworthy-distribution", "safe-repetition"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

const npm = new Npm({ importUrl: "file:///npm/axm", managerOwnedExecutable: "/npm/bin/axm" });

/** The registry has a newer unrelated latest than the version being selected. */
const unrelatedNewerLatest = (call: SubprocessInvocation) =>
  call.args.includes("--json")
    ? {
        executionState: "exited" as const,
        exitCode: 0,
        stderr: "",
        stdout: JSON.stringify(
          call.args.includes(`axm.sh@${TARGET_VERSION}`) ? TARGET_VERSION : "1000.0.0",
        ),
      }
    : undefined;

describe("Exact package availability", () => {
  for (const exact of [false, true])
    it.effect(
      `installs the selected version when an unrelated latest is newer in ${exact ? "exact" : "latest"} mode`,
      () =>
        Effect.gen(function* () {
          const { assessment, calls } = yield* runUpgradeTrial({
            method: npm,
            ...(exact ? { requestedVersion: TARGET_VERSION } : {}),
            respond: unrelatedNewerLatest,
          });
          expect(assessment).toMatchObject({
            disposition: "upgraded",
            installerAvailability: { state: "ready", observedVersion: TARGET_VERSION },
            verification: { state: "verified" },
          });
          // The gate asks about the version the upgrade selected, not about
          // whatever the registry currently calls latest, and asks once.
          const queries = calls.filter((call) => call.args.includes("--json"));
          expect(queries).toHaveLength(1);
          expect(queries[0]?.args).toContain(`axm.sh@${TARGET_VERSION}`);
        }).pipe(Effect.provide(NodeServices.layer)),
    );

  for (const observation of [
    {
      name: "affirmatively absent",
      state: "unavailable",
      exitCode: 1,
      stdout: JSON.stringify({
        error: { code: "E404", summary: `No match found for version ${TARGET_VERSION}` },
      }),
    },
    {
      name: "not interpretable",
      state: "indeterminate",
      exitCode: 0,
      stdout: "invalid",
    },
  ] as const)
    it.effect(`leaves the installation untouched when the exact query is ${observation.name}`, () =>
      Effect.gen(function* () {
        const { assessment, calls } = yield* runUpgradeTrial({
          method: npm,
          requestedVersion: TARGET_VERSION,
          respond: (call: SubprocessInvocation) =>
            call.args.includes("--json")
              ? {
                  executionState: "exited" as const,
                  exitCode: observation.exitCode,
                  stderr: "",
                  stdout: observation.stdout,
                }
              : undefined,
        });
        expect(assessment).toMatchObject({
          outcome: "failed",
          disposition: `installer-${observation.state}`,
          installerAvailability: { state: observation.state },
          mutation: { state: "not-attempted" },
          verification: { state: "not-attempted" },
        });
        // The reader is told what the installer reported, so the wait or
        // the repair is theirs to choose.
        expect(assessment.details.messages.length).toBeGreaterThan(0);
        expect(calls.some((call) => call.args.includes("-g") || call.args.includes("global"))).toBe(
          false,
        );
      }).pipe(Effect.provide(NodeServices.layer)),
    );
});
