import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import {
  CliReleaseCatalog,
  selectUpgradeRelease,
  UpgradeFailed,
  type SelectedRelease,
} from "./index.js";

const release = (targetVersion: string): SelectedRelease => ({
  targetVersion,
  release: { tagName: `cli-v${targetVersion}`, binaryAssetUrl: null, checksumAssetUrl: null },
  channel: null,
  etag: null,
  validatedAt: "2026-09-12T00:00:00.000Z",
});

describe("release selection through a substitute catalog", () => {
  it.effect.each([
    ["0.9.0", "upgrade-available"],
    ["1.0.0", "current"],
    ["2.0.0", "local-newer"],
    [null, "unknown-local"],
    ["unreadable", "unknown-local"],
  ] as const)("owns the relation for local version %s", ([localVersion, expected]) =>
    Effect.gen(function* () {
      const calls: Array<string> = [];
      const result = yield* selectUpgradeRelease({
        localVersion,
        binaryName: "axm-linux-x64",
      }).pipe(
        Effect.provideService(CliReleaseCatalog, {
          stable: (binaryName) =>
            Effect.sync(() => {
              calls.push(binaryName);
              return release("1.0.0");
            }),
          exact: () => Effect.die("Exact lookup must not run for a stable request"),
        }),
      );
      expect(calls).toEqual(["axm-linux-x64"]);
      expect(result.versionRelation).toBe(expected);
      expect(result.localVersion).toBe(localVersion === "unreadable" ? null : localVersion);
    }),
  );

  it.effect.each(["v1.2.3", "1.2.3-beta.1", "01.2.3", "1.2", " 1.2.3"])(
    "rejects %s before asking a provider",
    (requestedVersion) =>
      Effect.gen(function* () {
        const failure = yield* Effect.flip(
          selectUpgradeRelease({
            requestedVersion,
            localVersion: "1.0.0",
            binaryName: "axm-linux-x64",
          }).pipe(
            Effect.provideService(CliReleaseCatalog, {
              stable: () => Effect.die("Invalid input must not reach a provider"),
              exact: () => Effect.die("Invalid input must not reach a provider"),
            }),
          ),
        );
        expect(failure.category).toBe("validation");
      }),
  );

  it.effect("selects only the exact lookup for an exact request", () =>
    Effect.gen(function* () {
      const calls: Array<readonly [string, string]> = [];
      const result = yield* selectUpgradeRelease({
        requestedVersion: "1.2.3",
        localVersion: "1.0.0",
        binaryName: "axm-linux-x64",
      }).pipe(
        Effect.provideService(CliReleaseCatalog, {
          stable: () => Effect.die("Exact requests must not discover releases"),
          exact: (version, binaryName) =>
            Effect.sync(() => {
              calls.push([version, binaryName]);
              return release(version);
            }),
        }),
      );
      expect(calls).toEqual([["1.2.3", "axm-linux-x64"]]);
      expect(result.versionRelation).toBe("upgrade-available");
    }),
  );

  it.effect.each(["invalid", "1.2.3-beta.1", "2.0.0"])(
    "refuses an exact provider result of %s",
    (targetVersion) =>
      Effect.gen(function* () {
        const failure = yield* Effect.flip(
          selectUpgradeRelease({
            requestedVersion: "1.2.3",
            localVersion: "1.0.0",
            binaryName: "axm-linux-x64",
          }).pipe(
            Effect.provideService(CliReleaseCatalog, {
              stable: () => Effect.die("Exact requests must not discover releases"),
              exact: () => Effect.succeed(release(targetVersion)),
            }),
          ),
        );
        expect(failure.category).toBe("validation");
      }),
  );

  it.effect("preserves typed provider failure for its caller", () =>
    Effect.gen(function* () {
      const expected = new UpgradeFailed({
        category: "network",
        detail: "The release authority is offline",
      });
      const failure = yield* Effect.flip(
        selectUpgradeRelease({ localVersion: "1.0.0", binaryName: "axm-linux-x64" }).pipe(
          Effect.provideService(CliReleaseCatalog, {
            stable: () => Effect.fail(expected),
            exact: () => Effect.die("Exact lookup must not run for a stable request"),
          }),
        ),
      );
      expect(failure).toBe(expected);
    }),
  );
});
