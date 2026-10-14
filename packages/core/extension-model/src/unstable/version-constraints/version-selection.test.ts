import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

import { decodeVersionSync } from "./version-constraints.js";
import {
  admittedReleases,
  resolveVersionEntry,
  selectVersion,
  type ReleasedVersion,
} from "./version-selection.js";

interface Candidate extends ReleasedVersion {
  readonly integrity: string;
}

const makeVersionEntry = (overrides?: Partial<Candidate>): Candidate => ({
  version: decodeVersionSync("1.0.0"),
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
  it("preserves the selected candidate and its consumer-owned metadata", () => {
    const candidate = makeVersionEntry({
      integrity: "sha512-consumer-metadata",
      yankedAt: undefined,
    });
    expect(Option.getOrThrow(resolveVersionEntry([candidate], Option.some("^1.0.0")))).toBe(
      candidate,
    );
  });

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

describe("admittedReleases", () => {
  const yanked = makeVersionEntry({
    version: decodeVersionSync("1.2.0"),
    yankedAt: DateTime.makeUnsafe("2025-02-01T00:00:00Z"),
  });
  const versions = [
    makeVersionEntry({ version: decodeVersionSync("1.0.0") }),
    yanked,
    makeVersionEntry({ version: decodeVersionSync("2.0.0-beta.1") }),
    makeVersionEntry({ version: decodeVersionSync("1.1.0") }),
  ];
  const admitted = (request: Option.Option<string>) =>
    admittedReleases(versions, request).map((entry) => entry.version);

  it("lists a range's non-yanked stable releases newest first", () => {
    expect(admitted(Option.some("^1.0.0"))).toEqual(["1.1.0", "1.0.0"]);
    expect(admitted(Option.none())).toEqual(admitted(Option.some("*")));
  });

  it("admits a yanked or prerelease version only through its exact request", () => {
    expect(admitted(Option.some("1.2.0"))).toEqual(["1.2.0"]);
    expect(admitted(Option.some("2.0.0-beta.1"))).toEqual(["2.0.0-beta.1"]);
  });
});
