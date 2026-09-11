import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { defineSpecification } from "@agentxm/specification-metadata";

import { Homebrew, Npm, Pnpm, Yarn } from "../install-method/install-method.js";
import {
  HOMEBREW_EXECUTABLE,
  LOCAL_VERSION,
  TARGET_VERSION,
  commandExited,
  runUpgradeTrial,
  type SubprocessInvocation,
} from "../testing.js";

export const specification = defineSpecification({
  requirement: "cli/upgrade/verifies-package-manager-upgrades",
  title: "Package-manager upgrade success requires observed installation evidence",
  statement:
    "When an owning package manager performs an upgrade, AXM shall delegate the selected version to that owner and report success only after the owning installation and the executable selected by command lookup report that version, distinguishing failed commands, unchanged versions and unavailable verification.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: [],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "The automatic Homebrew reinstall used after a successful but unchanged upgrade remains subordinate recovery logic; its exact retry policy is not an independently accepted experience obligation.",
  ],
});

const npm = new Npm({
  importUrl: "file:///controlled/npm/axm",
  managerOwnedExecutable: "/controlled/npm/axm",
});

/** Every owning package manager, with the global-install argv it is handed. */
const managers = [
  { name: "npm", method: npm, args: ["install", "-g", `axm.sh@${TARGET_VERSION}`] },
  {
    name: "pnpm",
    method: new Pnpm({
      importUrl: "file:///controlled/pnpm/axm",
      managerOwnedExecutable: "/controlled/pnpm/axm",
    }),
    args: ["add", "-g", `axm.sh@${TARGET_VERSION}`],
  },
  {
    name: "yarn",
    method: new Yarn({
      importUrl: "file:///controlled/yarn/axm",
      managerMajorVersion: 1,
      supported: true,
      managerOwnedExecutable: "/controlled/yarn/axm",
    }),
    args: ["global", "add", `axm.sh@${TARGET_VERSION}`],
  },
] as const;

describe("Observed package-manager upgrade results", () => {
  for (const manager of managers)
    it.effect(`reports a verified ${manager.name} upgrade`, () =>
      Effect.gen(function* () {
        const upgrade = yield* runUpgradeTrial({ method: manager.method });
        expect(upgrade.calls).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ executable: manager.name, args: [...manager.args] }),
          ]),
        );
        expect(upgrade.assessment).toMatchObject({
          outcome: "applied",
          disposition: "upgraded",
          ownership: { method: manager.name },
          verification: { state: "verified", reportedVersion: TARGET_VERSION },
        });
        expect(upgrade.assessment.commands).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ purpose: "verification", exitCode: 0 }),
          ]),
        );
        expect(upgrade.installMetaWrites).toEqual([
          expect.objectContaining({ method: manager.name }),
        ]);
      }).pipe(Effect.provide(NodeServices.layer)),
    );

  for (const problem of ["unchanged", "unavailable", "command failed"] as const)
    it.effect(`reports ${problem} without claiming a completed upgrade`, () =>
      Effect.gen(function* () {
        const upgrade = yield* runUpgradeTrial({
          method: npm,
          respond: (invocation: SubprocessInvocation) => {
            if (
              problem === "command failed" &&
              invocation.executable === "npm" &&
              invocation.args[0] === "install"
            ) {
              return commandExited("", 1, "Permission denied by package manager");
            }
            if (invocation.args[0] === "--version") {
              return problem === "unavailable"
                ? commandExited("", 1, "Executable unavailable")
                : commandExited(`${LOCAL_VERSION}\n`);
            }
            return undefined;
          },
        });
        const result = upgrade.assessment;
        expect(result.outcome).toBe(problem === "unavailable" ? "indeterminate" : "failed");
        expect(result.verification.state).toBe(
          problem === "unchanged"
            ? "unchanged"
            : problem === "unavailable"
              ? "unavailable"
              : "not-attempted",
        );
        expect(result.mutation.state).toBe(problem === "unchanged" ? "unchanged" : "unknown");
        expect(upgrade.installMetaWrites).toEqual([]);
        if (problem === "command failed") {
          expect(result.commands).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                purpose: "delegation",
                exitCode: 1,
                stderr: "Permission denied by package manager",
              }),
            ]),
          );
        }
      }).pipe(Effect.provide(NodeServices.layer)),
    );

  it.effect("reports both the stable Homebrew executable and fresh command-path evidence", () =>
    Effect.gen(function* () {
      const upgrade = yield* runUpgradeTrial();
      expect(upgrade.assessment).toMatchObject({
        outcome: "applied",
        disposition: "upgraded",
        ownership: { method: "homebrew" },
        verification: { state: "verified", reportedVersion: TARGET_VERSION },
      });
      expect(upgrade.assessment.verification.executables).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: "manager-owned",
            path: HOMEBREW_EXECUTABLE,
            reportedVersion: TARGET_VERSION,
          }),
          expect.objectContaining({
            role: "path-resolved",
            path: HOMEBREW_EXECUTABLE,
            reportedVersion: TARGET_VERSION,
          }),
        ]),
      );
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("reports an interrupted Homebrew delegation without claiming it succeeded", () =>
    Effect.gen(function* () {
      const upgrade = yield* runUpgradeTrial({
        respond: (call: SubprocessInvocation) => {
          if (call.executable === "brew" && call.args[0] === "upgrade") {
            return {
              executionState: "timed-out" as const,
              exitCode: null,
              stdout: "",
              stderr: "Installer timed out",
            };
          }
          if (call.args[0] === "--version") return commandExited(`${LOCAL_VERSION}\n`);
          return undefined;
        },
      });
      expect(upgrade.assessment.outcome).toBe("failed");
      expect(upgrade.assessment.details.homebrewFailure).toBe("delegation-failed");
      expect(upgrade.assessment.commands).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ purpose: "delegation", executionState: "timed-out" }),
        ]),
      );
      expect(upgrade.installMetaWrites).toEqual([]);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  // Command lookup is the second half of the rule, so each owner that keeps its
  // own executable is shadowed on the PATH and must still refuse to claim the
  // upgrade landed.
  for (const owner of ["npm", "homebrew"] as const)
    it.effect(
      `reports a ${owner} installation whose command lookup still reaches the old version`,
      () =>
        Effect.gen(function* () {
          const shadow = "/controlled/shadow/axm";
          let primaryRan = false;
          const upgrade = yield* runUpgradeTrial({
            method:
              owner === "npm"
                ? npm
                : new Homebrew({ execPath: `/opt/homebrew/Cellar/axm/${LOCAL_VERSION}/bin/axm` }),
            resolveExecutable: () => shadow,
            respond: (call: SubprocessInvocation) => {
              if (call.executable === "brew" && call.args[0] === "upgrade") {
                primaryRan = true;
                return commandExited("");
              }
              // The Homebrew-owned executable reports the target only once the
              // delegation has run, so the pre-upgrade probe stays honest.
              if (call.executable === HOMEBREW_EXECUTABLE) {
                return commandExited(`${primaryRan ? TARGET_VERSION : LOCAL_VERSION}\n`);
              }
              return call.executable === shadow || call.executable === "axm"
                ? commandExited(`${LOCAL_VERSION}\n`)
                : undefined;
            },
          });
          expect(upgrade.assessment).toMatchObject({
            outcome: "failed",
            disposition: "verification-failed",
            mutation: { state: "updated" },
            verification: { state: "mismatch" },
          });
          expect(upgrade.assessment.verification.executables).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ role: "manager-owned", reportedVersion: TARGET_VERSION }),
              expect.objectContaining({ role: "path-resolved", reportedVersion: LOCAL_VERSION }),
            ]),
          );
          expect(upgrade.installMetaWrites).toEqual([]);
        }).pipe(Effect.provide(NodeServices.layer)),
    );
});
