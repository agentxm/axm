import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";

import {
  classifyVersionRelation,
  decideUpgrade,
  resolvePlatformBinary,
  supportedMethod,
  type VersionRelation,
} from "./policy.js";
import { Homebrew, Npm, Pnpm, Script, Unknown, Yarn } from "./installation.js";

describe("decideUpgrade", () => {
  const rows: ReadonlyArray<
    readonly [VersionRelation, boolean, boolean, ReturnType<typeof decideUpgrade>]
  > = [
    ["upgrade-available", false, true, "mutate"],
    ["upgrade-available", true, true, "mutate"],
    ["upgrade-available", false, false, "manual"],
    ["upgrade-available", true, false, "manual"],
    ["current", false, true, "noop-current"],
    ["current", false, false, "noop-current"],
    ["current", true, true, "mutate"],
    ["current", true, false, "manual"],
    ["local-newer", false, true, "noop-newer"],
    ["local-newer", false, false, "noop-newer"],
    ["local-newer", true, true, "refuse"],
    ["local-newer", true, false, "refuse"],
    ["unknown-local", false, true, "mutate"],
    ["unknown-local", true, true, "mutate"],
    ["unknown-local", false, false, "manual"],
    ["unknown-local", true, false, "manual"],
  ];

  it.each(rows)(
    "%s reinstall=%s supported=%s => %s",
    (relation, reinstall, supported, expected) => {
      expect(decideUpgrade(relation, reinstall, supported)).toBe(expected);
    },
  );
});

describe("supported upgrade targets", () => {
  it("resolves every supported platform binary and rejects unsupported targets", () => {
    expect(Option.getOrThrow(resolvePlatformBinary("darwin", "arm64")).binaryName).toBe(
      "axm-darwin-arm64",
    );
    expect(Option.getOrThrow(resolvePlatformBinary("linux", "x64")).binaryName).toBe(
      "axm-linux-x64",
    );
    expect(Option.getOrThrow(resolvePlatformBinary("win32", "x64")).binaryName).toBe(
      "axm-windows-x64.exe",
    );
    expect(Option.isNone(resolvePlatformBinary("freebsd", "x64"))).toBe(true);
  });
});

describe("version relationships", () => {
  it.each([
    [null, "2.0.0", null, "unknown-local"],
    ["invalid", "2.0.0", null, "unknown-local"],
    ["v1.0.0", "2.0.0", "1.0.0", "upgrade-available"],
    ["2.0.0", "2.0.0", "2.0.0", "current"],
    ["3.0.0", "2.0.0", "3.0.0", "local-newer"],
    ["2.0.0-rc.1", "2.0.0", "2.0.0-rc.1", "upgrade-available"],
  ] as const)("classifies local %s against target %s", (local, target, normalized, relation) => {
    expect(classifyVersionRelation(local, target)).toEqual({
      localVersion: normalized,
      versionRelation: relation,
    });
  });
});

describe("automatic upgrade eligibility", () => {
  it.each([
    [new Script({ execPath: "/axm" }), true],
    [new Homebrew({ execPath: "/brew/axm" }), true],
    [new Npm({ importUrl: "file:///npm/axm" }), true],
    [new Pnpm({ importUrl: "file:///pnpm/axm" }), true],
    [new Yarn({ importUrl: "file:///yarn/axm", managerMajorVersion: 1 }), true],
    [new Yarn({ importUrl: "file:///yarn/axm", managerMajorVersion: 4 }), false],
    [new Yarn({ importUrl: "file:///yarn/axm" }), false],
    [new Unknown(), false],
  ] as const)("decides from %s installation facts", (method, expected) => {
    expect(supportedMethod(method)).toBe(expected);
  });
});
