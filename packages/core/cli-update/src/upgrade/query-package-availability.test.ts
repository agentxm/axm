/**
 * Exhaustive parser coverage for the availability gate: every manager's
 * affirmative-absence payload and every way a query can fail to answer.
 * The rule these rows check lives in
 * `installer-availability-gates-mutation.spec.ts`.
 */

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";

import { Npm, Pnpm, Yarn, type InstallMethodType } from "../install-method/install-method.js";
import { TARGET_VERSION, runUpgradeTrial, type SubprocessInvocation } from "../testing.js";

const methods: ReadonlyArray<InstallMethodType> = [
  new Npm({ importUrl: "file:///npm/axm", managerOwnedExecutable: "/npm/bin/axm" }),
  new Pnpm({ importUrl: "file:///pnpm/axm", managerOwnedExecutable: "/pnpm/bin/axm" }),
  new Yarn({
    importUrl: "file:///yarn/axm",
    managerOwnedExecutable: "/yarn/bin/axm",
    managerMajorVersion: 1,
    supported: true,
  }),
];

const absentPayload = (method: InstallMethodType): string =>
  JSON.stringify(
    method._tag === "Yarn"
      ? { type: "inspect", data: ["1000.0.0"] }
      : method._tag === "Pnpm"
        ? {
            error: {
              code: "ERR_PNPM_PACKAGE_NOT_FOUND",
              message: `No matching version found for axm.sh@${TARGET_VERSION}`,
            },
          }
        : {
            error: {
              code: "E404",
              summary: `No match found for version ${TARGET_VERSION}`,
            },
          },
  );

describe("package availability queries", () => {
  for (const method of methods) {
    it.effect(`${method._tag} reads an unrelated newer latest as the selected version`, () =>
      Effect.gen(function* () {
        const { assessment, calls } = yield* runUpgradeTrial({
          method,
          respond: (call: SubprocessInvocation) =>
            call.args.includes("--json")
              ? {
                  executionState: "exited" as const,
                  exitCode: 0,
                  stderr: "",
                  stdout: JSON.stringify(
                    method._tag === "Yarn"
                      ? { type: "inspect", data: [TARGET_VERSION, "1000.0.0"] }
                      : call.args.includes(`axm.sh@${TARGET_VERSION}`)
                        ? TARGET_VERSION
                        : "1000.0.0",
                  ),
                }
              : undefined,
        });
        expect(assessment.installerAvailability).toEqual({
          state: "ready",
          observedVersion: TARGET_VERSION,
        });
        expect(calls.filter((call) => call.args.includes("--json"))).toHaveLength(1);
      }).pipe(Effect.provide(NodeServices.layer)),
    );

    for (const observation of ["absent", "network", "malformed", "unexpected", "timeout"] as const)
      it.effect(`${method._tag} reports ${observation} without mutating`, () =>
        Effect.gen(function* () {
          const { assessment, calls } = yield* runUpgradeTrial({
            method,
            requestedVersion: TARGET_VERSION,
            respond: (call: SubprocessInvocation) =>
              call.args.includes("--json")
                ? {
                    executionState: observation === "timeout" ? "timed-out" : "exited",
                    exitCode:
                      observation === "timeout"
                        ? null
                        : observation === "network" ||
                            (observation === "absent" && method._tag !== "Yarn")
                          ? 1
                          : 0,
                    stderr: observation === "network" ? "connection failed" : "",
                    stdout:
                      observation === "absent"
                        ? absentPayload(method)
                        : observation === "unexpected"
                          ? JSON.stringify("1000.0.0")
                          : "invalid",
                  }
                : undefined,
          });
          const state = observation === "absent" ? "unavailable" : "indeterminate";
          expect(assessment).toMatchObject({
            outcome: "failed",
            disposition: `installer-${state}`,
            installerAvailability: { state },
            mutation: { state: "not-attempted" },
            verification: { state: "not-attempted" },
          });
          expect(
            calls.some((call) => call.args.includes("-g") || call.args.includes("global")),
          ).toBe(false);
        }).pipe(Effect.provide(NodeServices.layer)),
      );
  }
});
