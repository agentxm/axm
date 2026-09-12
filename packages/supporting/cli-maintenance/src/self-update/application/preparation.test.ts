import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { Npm, Unknown, Yarn, type InstallMethodType } from "../domain/index.js";
import {
  CliReleaseCatalog,
  InstallationInspection,
  UpgradeFailed,
  UpgradeWorkingDirectory,
  prepareUpgrade,
  type SelectedRelease,
  type UpgradeRequest,
} from "./index.js";

const trial = (options?: {
  readonly method?: InstallMethodType;
  readonly platform?: string;
  readonly inspectionFailure?: UpgradeFailed;
}) => {
  const calls: Array<string> = [];
  const release = (targetVersion: string): SelectedRelease => ({
    targetVersion,
    release: { tagName: `cli-v${targetVersion}`, binaryAssetUrl: null, checksumAssetUrl: null },
    channel: null,
    etag: null,
    validatedAt: "2026-09-12T00:00:00.000Z",
  });
  const run = (request: UpgradeRequest = { localVersion: "1.0.0", reinstall: false }) =>
    prepareUpgrade(request).pipe(
      Effect.provideService(UpgradeWorkingDirectory, { path: "/selected-directory" }),
      Effect.provideService(InstallationInspection, {
        platform: options?.platform ?? "linux",
        architecture: "x64",
        inspect: (directory) =>
          Effect.gen(function* () {
            calls.push(`inspect:${directory}`);
            if (options?.inspectionFailure !== undefined) return yield* options.inspectionFailure;
            return {
              method: options?.method ?? new Npm({ importUrl: "file:///fixture/axm" }),
              commands: [],
            };
          }),
      }),
      Effect.provideService(CliReleaseCatalog, {
        stable: (binaryName) =>
          Effect.sync(() => {
            calls.push(`stable:${binaryName}`);
            return release("2.0.0");
          }),
        exact: (version, binaryName) =>
          Effect.sync(() => {
            calls.push(`exact:${version}:${binaryName}`);
            return release(version);
          }),
      }),
    );
  return { calls, run };
};

describe("upgrade preparation without installation or delivery mechanisms", () => {
  it.effect("refuses unsupported hosts before inspection or release lookup", () =>
    Effect.gen(function* () {
      const attempt = trial({ platform: "plan9" });
      const failure = yield* Effect.flip(attempt.run());
      expect(failure.category).toBe("validation");
      expect(failure.detail).toBe("Unsupported platform: plan9-x64");
      expect(attempt.calls).toEqual([]);
    }),
  );

  it.effect("refuses unresolved ownership before either release authority", () =>
    Effect.gen(function* () {
      const attempt = trial({ method: new Unknown({ reason: "ambiguous" }) });
      const failure = yield* Effect.flip(
        attempt.run({ localVersion: "1.0.0", reinstall: false, requestedVersion: "2.0.0" }),
      );
      expect(failure.category).toBe("validation");
      expect(attempt.calls).toEqual(["inspect:/selected-directory"]);
    }),
  );

  it.effect("uses the invocation directory and selects a release only after inspection", () =>
    Effect.gen(function* () {
      const attempt = trial();
      const candidate = yield* attempt.run();
      expect(attempt.calls).toEqual(["inspect:/selected-directory", "stable:axm-linux-x64"]);
      expect(candidate.selectedAction).toBe("mutate");
      expect(candidate.resolution.versionRelation).toBe("upgrade-available");
      expect(candidate.platform.binaryName).toBe("axm-linux-x64");
    }),
  );

  it.effect("keeps Yarn eligibility with the application consuming observed facts", () =>
    Effect.gen(function* () {
      const attempt = trial({
        method: new Yarn({ importUrl: "file:///fixture/axm", managerMajorVersion: 4 }),
      });
      const candidate = yield* attempt.run();
      expect(candidate.selectedAction).toBe("manual");
      expect(candidate.resolution.targetVersion).toBe("2.0.0");
    }),
  );

  it.effect.each([
    { localVersion: "3.0.0", reinstall: true, expected: "refuse" },
    { localVersion: "2.0.0", reinstall: false, expected: "noop-current" },
    { localVersion: "2.0.0", reinstall: true, expected: "mutate" },
  ] as const)(
    "owns the action for $localVersion with reinstall $reinstall",
    ({ expected, ...request }) =>
      Effect.gen(function* () {
        const candidate = yield* trial().run({ ...request, requestedVersion: "2.0.0" });
        expect(candidate.selectedAction).toBe(expected);
      }),
  );

  it.effect("preserves an inspection failure and leaves release selection untouched", () =>
    Effect.gen(function* () {
      const expected = new UpgradeFailed({
        category: "internal",
        detail: "Installation inspection failed",
      });
      const attempt = trial({ inspectionFailure: expected });
      expect(yield* Effect.flip(attempt.run())).toBe(expected);
      expect(attempt.calls).toEqual(["inspect:/selected-directory"]);
    }),
  );
});
