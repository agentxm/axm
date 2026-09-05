import * as Effect from "effect/Effect";
import { describe, expect, it } from "@effect/vitest";
import { Npm, Pnpm, Yarn, type InstallMethodType } from "axm.sh/specification-harness";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { runUpgrade, TARGET_VERSION } from "../../support/upgrade-harness.js";

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

describe("Exact package availability", () => {
  for (const method of methods) {
    for (const exact of [false, true]) {
      it.effect(
        `${method._tag} installs the selected version when an unrelated latest is newer in ${exact ? "exact" : "latest"} mode`,
        () =>
          Effect.gen(function* () {
            const { document, calls } = yield* runUpgrade({
              method,
              ...(exact ? { requestedVersion: TARGET_VERSION } : {}),
              respond: (call) =>
                call.args.includes("--json")
                  ? {
                      executionState: "exited",
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
            expect(document).toMatchObject({
              result: {
                disposition: "upgraded",
                installerAvailability: { state: "ready", observedVersion: TARGET_VERSION },
                verification: { state: "verified" },
              },
            });
            const queries = calls.filter((call) => call.args.includes("--json"));
            expect(queries).toHaveLength(1);
            expect(queries[0]?.args).toContain(`axm.sh@${TARGET_VERSION}`);
          }),
      );
    }
    for (const observation of [
      "absent",
      "network",
      "malformed",
      "unexpected",
      "timeout",
    ] as const) {
      it.effect(
        `${method._tag} leaves the installation untouched when the exact query is ${observation}`,
        () =>
          Effect.gen(function* () {
            const { document, calls } = yield* runUpgrade({
              method,
              requestedVersion: TARGET_VERSION,
              respond: (call) =>
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
                          ? JSON.stringify(
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
                            )
                          : observation === "unexpected"
                            ? JSON.stringify("1000.0.0")
                            : "invalid",
                    }
                  : undefined,
            });
            const state = observation === "absent" ? "unavailable" : "indeterminate";
            expect(document).toMatchObject({
              result: {
                outcome: "failed",
                disposition: `installer-${state}`,
                installerAvailability: { state },
                mutation: { state: "not-attempted" },
                verification: { state: "not-attempted" },
              },
            });
            expect(
              calls.some((call) => call.args.includes("-g") || call.args.includes("global")),
            ).toBe(false);
          }),
      );
    }
  }
});
