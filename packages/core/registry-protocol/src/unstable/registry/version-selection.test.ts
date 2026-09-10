import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

import { decodeVersionSync } from "@agentxm/extension-model/unstable/version-constraints";
import type { VersionEntry } from "./schema.js";
import { resolveVersionEntry, selectVersion } from "./version-selection.js";

const makeVersionEntry = (overrides?: Partial<VersionEntry>): VersionEntry => ({
  version: decodeVersionSync("1.0.0"),
  published: DateTime.makeUnsafe("2025-01-01T00:00:00Z"),
  integrity: "sha512-AAAA==",
  ...overrides,
});

describe("selectVersion", () => {
  it("returns the maximum version regardless of publication order", () => {
    const versions = [
      makeVersionEntry({ version: decodeVersionSync("1.0.0") }),
      makeVersionEntry({ version: decodeVersionSync("2.0.0") }),
      makeVersionEntry({ version: decodeVersionSync("1.5.0") }),
    ];
    const result = selectVersion(versions);
    expect(Option.isSome(result)).toBe(true);
    expect(Option.getOrThrow(result).version).toBe("2.0.0");
  });

  it("returns None for empty versions", () => {
    expect(Option.isNone(selectVersion([]))).toBe(true);
  });

  it("skips yanked versions for unversioned selection", () => {
    const result = selectVersion([
      makeVersionEntry({
        version: decodeVersionSync("2.0.0"),
        yankedAt: DateTime.makeUnsafe("2025-02-01T00:00:00Z"),
      }),
      makeVersionEntry({ version: decodeVersionSync("1.0.0") }),
    ]);

    expect(Option.getOrThrow(result).version).toBe("1.0.0");
  });
});

describe("resolveVersionEntry", () => {
  const versions = [
    makeVersionEntry({
      version: decodeVersionSync("1.2.0"),
      yankedAt: DateTime.makeUnsafe("2025-02-01T00:00:00Z"),
    }),
    makeVersionEntry({ version: decodeVersionSync("1.1.0") }),
  ];

  it("allows a syntactically exact yanked version", () => {
    expect(Option.getOrThrow(resolveVersionEntry(versions, Option.some("1.2.0"))).version).toBe(
      "1.2.0",
    );
  });

  it("excludes yanked versions from range resolution", () => {
    expect(Option.getOrThrow(resolveVersionEntry(versions, Option.some("^1.0.0"))).version).toBe(
      "1.1.0",
    );
  });
});
