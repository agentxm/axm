import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { Npm, Script, Yarn, type InstallMethodType } from "../domain/index.js";
import {
  assessUpgrade,
  CliReleaseCatalog,
  InstallationInspection,
  InstallerInstructions,
  UpgradeWorkingDirectory,
  type SelectedRelease,
  type UpgradeFailed,
  type UpgradeRequest,
  type UpgradeSettlement,
} from "./index.js";

const trial = (method: InstallMethodType = new Npm({ importUrl: "file:///fixture/axm" })) => {
  const calls: Array<string> = [];
  const selected = (targetVersion: string): SelectedRelease => ({
    targetVersion,
    release: { tagName: `cli-v${targetVersion}`, binaryAssetUrl: null, checksumAssetUrl: null },
    channel: null,
    etag: null,
    validatedAt: "2026-09-13T00:00:00.000Z",
  });

  // This closed Effect is a compile-time boundary: no installer, recorder,
  // cache, filesystem, subprocess, HTTP client, or terminal service is provided.
  const run = (
    request: UpgradeRequest = { localVersion: "1.0.0", reinstall: false },
  ): Effect.Effect<UpgradeSettlement, UpgradeFailed> =>
    assessUpgrade(request).pipe(
      Effect.provideService(UpgradeWorkingDirectory, { path: "/selected-directory" }),
      Effect.provideService(InstallationInspection, {
        platform: "linux",
        architecture: "x64",
        inspect: (directory) =>
          Effect.sync(() => {
            calls.push(`inspect:${directory}`);
            return { method, commands: [] };
          }),
      }),
      Effect.provideService(CliReleaseCatalog, {
        stable: (binaryName) =>
          Effect.sync(() => {
            calls.push(`stable:${binaryName}`);
            return selected("2.0.0");
          }),
        exact: (version) => Effect.succeed(selected(version)),
      }),
      Effect.provideService(InstallerInstructions, {
        packageCommand: (_method, version, reinstall) => {
          calls.push(`describe:${version}:${String(reinstall)}`);
          return {
            executable: "fixture-installer",
            args: [reinstall ? "reinstall" : "install", version],
            shellRequired: false,
          };
        },
        recoveryCommand: (version) => {
          calls.push(`recovery:${version}`);
          return { executable: "fixture-repair", args: [version], shellRequired: false };
        },
      }),
    );
  return { calls, run };
};

describe("upgrade assessment without mutation or delivery services", () => {
  it.effect("returns a typed delegated command after ownership and release selection", () =>
    Effect.gen(function* () {
      const attempt = trial();
      const result = yield* attempt.run();
      expect(attempt.calls).toEqual([
        "inspect:/selected-directory",
        "stable:axm-linux-x64",
        "describe:2.0.0:false",
      ]);
      expect(result.previewIntent).toEqual({
        kind: "package-command",
        command: {
          executable: "fixture-installer",
          args: ["install", "2.0.0"],
          shellRequired: false,
        },
      });
      expect(result.result).toMatchObject({
        resultStatus: "preview",
        mutationState: "not-attempted",
        verification: "not-attempted",
        details: [],
      });
      expect(result.availability.state).toBe("not-required");
    }),
  );

  it.effect("describes executable replacement without acquiring release assets", () =>
    Effect.gen(function* () {
      const attempt = trial(new Script({ execPath: "/installed/axm" }));
      const result = yield* attempt.run();
      expect(result.previewIntent).toEqual({
        kind: "executable-replacement",
        executablePath: "/installed/axm",
        binaryName: "axm-linux-x64",
        targetVersion: "2.0.0",
      });
      expect(attempt.calls).toEqual(["inspect:/selected-directory", "stable:axm-linux-x64"]);
    }),
  );

  it.effect("carries equal-version reinstall intent into the installer description", () =>
    Effect.gen(function* () {
      const attempt = trial();
      const result = yield* attempt.run({ localVersion: "2.0.0", reinstall: true });
      expect(result.previewIntent).toMatchObject({
        kind: "package-command",
        command: { args: ["reinstall", "2.0.0"] },
      });
    }),
  );

  it.effect.each([
    { localVersion: "2.0.0", reinstall: false, status: "already-up-to-date" },
    { localVersion: "3.0.0", reinstall: false, status: "local-newer" },
    { localVersion: "3.0.0", reinstall: true, status: "downgrade-refused" },
  ] as const)("settles $status without an installer action", ({ status, ...request }) =>
    Effect.gen(function* () {
      const attempt = trial();
      const result = yield* attempt.run(request);
      expect(result.result.resultStatus).toBe(status);
      expect(result.previewIntent).toBeNull();
      expect(attempt.calls).toEqual(["inspect:/selected-directory", "stable:axm-linux-x64"]);
    }),
  );

  it.effect(
    "keeps unsupported-manager policy while obtaining recovery grammar through its port",
    () =>
      Effect.gen(function* () {
        const attempt = trial(
          new Yarn({ importUrl: "file:///fixture/yarn", managerMajorVersion: 4 }),
        );
        const result = yield* attempt.run();
        expect(result.result).toMatchObject({
          resultStatus: "manual-action-required",
          recommendedCommand: {
            executable: "fixture-repair",
            args: ["2.0.0"],
            shellRequired: false,
          },
        });
        expect(result.previewIntent).toBeNull();
        expect(attempt.calls).toEqual([
          "inspect:/selected-directory",
          "stable:axm-linux-x64",
          "recovery:2.0.0",
        ]);
      }),
  );
});
