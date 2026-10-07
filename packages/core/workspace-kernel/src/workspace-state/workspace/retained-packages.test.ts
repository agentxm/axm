import { describe, expect, it } from "@effect/vitest";
import * as Result from "effect/Result";
import { encodeSourcePath } from "./source-address.js";
import { validatePackageAddressClaims } from "./retained-packages.js";

const claim = (packageKey: string, segments: ReadonlyArray<string>) => ({
  packageKey,
  address: Result.getOrThrow(encodeSourcePath(segments)),
});

describe("portable retained package claims", () => {
  it("allows repeated component bindings to exactly one package", () => {
    const shared = claim("shared", ["github.com", "basecamp", "skills"]);
    expect(Result.isSuccess(validatePackageAddressClaims([shared, shared]))).toBe(true);
  });

  it.each([
    [
      ["example.test", "Repo"],
      ["example.test", "repo"],
    ],
    [
      ["example.test", "repo"],
      ["example.test", "repo", "nested"],
    ],
    [
      ["example.test", "repo", "nested"],
      ["example.test", "repo"],
    ],
    [
      ["example.test", "café"],
      ["example.test", "CAFÉ"],
    ],
    [
      ["example.test", "café"],
      ["example.test", "cafe\u0301"],
    ],
    [
      ["example.test", "repo"],
      ["example.test", "repo"],
    ],
  ])("refuses distinct source authorities at overlapping portable addresses", (left, right) => {
    expect(
      Result.isFailure(validatePackageAddressClaims([claim("left", left), claim("right", right)])),
    ).toBe(true);
  });

  it("keeps neighboring names and separately retained package boundaries distinct", () => {
    expect(
      Result.isSuccess(
        validatePackageAddressClaims([
          claim("first", ["example.test", "repo", "skills", "one"]),
          claim("second", ["example.test", "repo", "skills", "two"]),
          claim("third", ["example.test", "repository"]),
        ]),
      ),
    ).toBe(true);
  });

  it("counts the actual workspace root in the filesystem path limit", () => {
    expect(
      Result.isFailure(
        validatePackageAddressClaims(
          [claim("source", ["example.test", "repo"])],
          "/" + "x".repeat(4090),
        ),
      ),
    ).toBe(true);
  });
});
