import { describe, expect, it } from "@effect/vitest";
import * as Result from "effect/Result";
import {
  decodeSourceSegment,
  localSourceCoordinates,
  encodeSourcePath,
  encodeSourceSegment,
  sourceUrlCoordinates,
} from "./source-address.js";

describe("source address spelling", () => {
  it.each([
    "github.com",
    "@acme",
    "_git",
    "review",
    "CON",
    "aux.txt",
    "file.",
    "file ",
    "~2e",
    "a:b",
    "café",
    "日本語",
    "100%",
    "_local",
    ".axm",
    "axm.json",
  ])("round-trips %s without filesystem-reserved spelling", (segment) => {
    const encoded = Result.getOrThrow(encodeSourceSegment(segment));
    expect(Result.getOrThrow(decodeSourceSegment(encoded))).toBe(segment);
    expect(encoded).not.toMatch(/[<>:"/\\|?*]/u);
    expect([...encoded].every((character) => character.charCodeAt(0) >= 32)).toBe(true);
    expect(encoded).not.toMatch(/[. ]$/u);
  });

  it.each([".axm", ".AXM", "axm.json", "AXM.JSON"])(
    "separates %s from workspace ownership markers",
    (segment) => {
      const encoded = Result.getOrThrow(encodeSourceSegment(segment));
      expect(encoded.toLowerCase()).not.toBe(segment.toLowerCase());
      expect(Result.getOrThrow(decodeSourceSegment(encoded))).toBe(segment);
    },
  );

  it.each(["plugin.axm-staging", "plugin.axm-backup", "PLUGIN.AXM-STAGING"])(
    "separates %s from materialization scratch paths",
    (segment) => {
      const encoded = Result.getOrThrow(encodeSourceSegment(segment));
      expect(encoded).not.toMatch(/\.axm-(?:staging|backup)$/iu);
      expect(Result.getOrThrow(decodeSourceSegment(encoded))).toBe(segment);
    },
  );

  it.each(["", ".", "..", "one/two", "one\\two", "\u0000", "x".repeat(256)])(
    "refuses unsafe or oversized segments",
    (segment) => {
      expect(Result.isFailure(encodeSourceSegment(segment))).toBe(true);
    },
  );

  it.each(["~", "~2E", "~2e~2e", "~2f", "~ff", "~61", "日本語"])(
    "refuses noncanonical encoded spelling %s",
    (encoded) => {
      expect(Result.isFailure(decodeSourceSegment(encoded))).toBe(true);
    },
  );

  it("preserves forge namespaces, endpoint base paths, ports and path case", () => {
    expect(
      Result.getOrThrow(
        sourceUrlCoordinates(
          new URL("ssh://git@GitLab.EXAMPLE:2222/Engineering/Platform/extensions.git"),
        ),
      ),
    ).toEqual(["gitlab.example:2222", "Engineering", "Platform", "extensions.git"]);
    expect(
      Result.getOrThrow(
        sourceUrlCoordinates(new URL("https://dev.azure.com/acme/platform/_git/extensions")),
      ),
    ).toEqual(["dev.azure.com", "acme", "platform", "_git", "extensions"]);
    expect(
      Result.getOrThrow(sourceUrlCoordinates(new URL("https://registry.example/team-a/"))),
    ).toEqual(["registry.example", "team-a"]);
  });

  it.each([
    "https://user:secret@example.com/repo",
    "https://example.com/repo?token=secret",
    "https://example.com/repo#fragment",
    "https://example.com/a%2fb",
    "https://example.com/%252e%252e",
  ])("refuses ambiguous or credential-bearing URLs without exposing their values", (url) => {
    const result = sourceUrlCoordinates(new URL(url));
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) expect(result.failure.detail).not.toContain("secret");
  });

  it("rejects excessive path length without truncation", () => {
    expect(
      Result.isFailure(encodeSourcePath(Array.from({ length: 20 }, () => "x".repeat(255)))),
    ).toBe(true);
  });
});

describe("local source coordinates", () => {
  it.each([
    ["vendor/plugin", ["project", "vendor", "plugin"]],
    ["/opt/plugins/review", ["absolute", "root", "opt", "plugins", "review"]],
    ["c:/plugins/review", ["absolute", "drive-C", "plugins", "review"]],
    ["//server/share/review", ["absolute", "unc", "server", "share", "review"]],
  ])("preserves the anchor of %s", (source, coordinates) => {
    expect(Result.getOrThrow(localSourceCoordinates(source))).toEqual(coordinates);
  });
  it.each(["../outside", "/opt/../outside", "C:relative", "bad\0path", "\ud800"])(
    "rejects unsafe address %s",
    (source) => {
      expect(Result.isFailure(localSourceCoordinates(source))).toBe(true);
    },
  );
});
