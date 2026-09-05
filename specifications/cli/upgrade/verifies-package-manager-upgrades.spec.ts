import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Npm, Pnpm, Yarn, Homebrew, UpgradeDocumentSchema } from "axm.sh/specification-harness";
import {
  makeUpgradeExecution,
  completedUpgradeCommand,
} from "../../support/upgrade-execution-fixture.js";
import {
  LOCAL_VERSION,
  TARGET_VERSION,
  HOMEBREW_EXECUTABLE,
  runUpgrade,
} from "../../support/upgrade-harness.js";

export const specification = defineSpecification({
  requirement: "cli/upgrade/verifies-package-manager-upgrades",
  title: "Package-manager upgrade success requires observed installation evidence",
  statement:
    "When an owning package manager performs an upgrade, AXM shall delegate the selected version to that owner and report success only after the owning installation and the executable selected by command lookup report that version, distinguishing failed commands, unchanged versions and unavailable verification.",
  class: "functional",
  role: "experience",
  goals: ["trustworthy-distribution", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["packages/cli/src/root/upgrade/handler.internal.test.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "The automatic Homebrew reinstall used after a successful but unchanged upgrade remains subordinate recovery logic; its exact retry policy is not an independently accepted experience obligation.",
  ],
});

describe("Observed package-manager upgrade results", () => {
  const managers = [
    {
      name: "npm",
      method: new Npm({
        importUrl: "file:///controlled/npm/axm",
        managerOwnedExecutable: "/controlled/npm/axm",
      }),
      args: ["install", "-g", `axm.sh@${TARGET_VERSION}`],
    },
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
  ];
  for (const manager of managers)
    it.effect(`reports a verified ${manager.name} upgrade`, () =>
      Effect.gen(function* () {
        const upgrade = makeUpgradeExecution({ method: manager.method });
        yield* upgrade.run();
        expect(upgrade.calls).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ executable: manager.name, args: manager.args }),
          ]),
        );
        expect(upgrade.document().result).toMatchObject({
          outcome: "applied",
          disposition: "upgraded",
          ownership: { method: manager.name },
          verification: { state: "verified", reportedVersion: TARGET_VERSION },
        });
        expect(upgrade.document().result.commands).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ purpose: "verification", exitCode: 0 }),
          ]),
        );
        expect(upgrade.metadata).toEqual([expect.objectContaining({ method: manager.name })]);
      }),
    );
  for (const problem of ["unchanged", "unavailable", "command failed"] as const)
    it.effect(`reports ${problem} without claiming a completed upgrade`, () =>
      Effect.gen(function* () {
        const upgrade = makeUpgradeExecution({
          method: new Npm({
            importUrl: "file:///controlled/npm/axm",
            managerOwnedExecutable: "/controlled/npm/axm",
          }),
          reply: (invocation) => {
            if (
              problem === "command failed" &&
              invocation.executable === "npm" &&
              invocation.args[0] === "install"
            )
              return Effect.succeed(
                completedUpgradeCommand("", 1, "Permission denied by package manager"),
              );
            if (invocation.args[0] === "--version")
              return Effect.succeed(
                problem === "unavailable"
                  ? completedUpgradeCommand("", 1, "Executable unavailable")
                  : completedUpgradeCommand(`${LOCAL_VERSION}\n`),
              );
            return undefined;
          },
        });
        yield* upgrade.run();
        const result = upgrade.document().result;
        expect(result.outcome).toBe(problem === "unavailable" ? "indeterminate" : "failed");
        expect(result.verification.state).toBe(
          problem === "unchanged"
            ? "unchanged"
            : problem === "unavailable"
              ? "unavailable"
              : "not-attempted",
        );
        expect(result.mutation.state).toBe(problem === "unchanged" ? "unchanged" : "unknown");
        expect(upgrade.metadata).toEqual([]);
        if (problem === "command failed")
          expect(result.commands).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                purpose: "delegation",
                exitCode: 1,
                stderr: "Permission denied by package manager",
              }),
            ]),
          );
      }),
    );
  it.effect("reports both the stable Homebrew executable and fresh command-path evidence", () =>
    Effect.gen(function* () {
      const upgrade = yield* runUpgrade();
      const { result } = yield* Schema.decodeUnknownEffect(UpgradeDocumentSchema)(upgrade.document);
      expect(result).toMatchObject({
        outcome: "applied",
        disposition: "upgraded",
        ownership: { method: "homebrew" },
        verification: { state: "verified", reportedVersion: TARGET_VERSION },
      });
      expect(result.verification.executables).toEqual(
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
    }),
  );
  it.effect("reports an interrupted Homebrew delegation without claiming it succeeded", () =>
    Effect.gen(function* () {
      const upgrade = yield* runUpgrade({
        respond: (call) => {
          if (call.executable === "brew" && call.args[0] === "upgrade")
            return {
              executionState: "timed-out",
              exitCode: null,
              stdout: "",
              stderr: "Installer timed out",
            };
          if (call.args[0] === "--version") return completedUpgradeCommand(`${LOCAL_VERSION}\n`);
          return undefined;
        },
      });
      const { result } = yield* Schema.decodeUnknownEffect(UpgradeDocumentSchema)(upgrade.document);
      expect(result.outcome).toBe("failed");
      expect(result.details.homebrewFailure).toBe("delegation-failed");
      expect(result.commands).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ purpose: "delegation", executionState: "timed-out" }),
        ]),
      );
      expect(upgrade.installMetaWrites).toEqual([]);
    }),
  );
  for (const manager of ["npm", "homebrew"] as const)
    it.effect(
      `reports a ${manager} installation whose command lookup still reaches the old version`,
      () =>
        Effect.gen(function* () {
          const shadow = "/controlled/shadow/axm";
          let primaryRan = false;
          const upgrade = makeUpgradeExecution({
            method:
              manager === "npm"
                ? new Npm({
                    importUrl: "file:///controlled/npm/axm",
                    managerOwnedExecutable: "/controlled/npm/axm",
                  })
                : new Homebrew({ execPath: `/opt/homebrew/Cellar/axm/${LOCAL_VERSION}/bin/axm` }),
            resolveExecutable: () => shadow,
            reply: (call) => {
              if (call.executable === "brew" && call.args[0] === "upgrade") {
                primaryRan = true;
                return Effect.succeed(completedUpgradeCommand(""));
              }
              if (call.executable === HOMEBREW_EXECUTABLE)
                return Effect.succeed(
                  completedUpgradeCommand(`${primaryRan ? TARGET_VERSION : LOCAL_VERSION}\n`),
                );
              return call.executable === shadow || call.executable === "axm"
                ? Effect.succeed(completedUpgradeCommand(`${LOCAL_VERSION}\n`))
                : undefined;
            },
          });
          yield* upgrade.run();
          const result = upgrade.document().result;
          expect(result).toMatchObject({
            outcome: "failed",
            disposition: "verification-failed",
            mutation: { state: "updated" },
            verification: { state: "mismatch" },
          });
          expect(result.verification.executables).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ role: "manager-owned", reportedVersion: TARGET_VERSION }),
              expect.objectContaining({ role: "path-resolved", reportedVersion: LOCAL_VERSION }),
            ]),
          );
          expect(upgrade.metadata).toEqual([]);
        }),
    );
});
