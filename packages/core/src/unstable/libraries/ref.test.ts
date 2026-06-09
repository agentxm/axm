import { describe, expect, it } from "vitest";
import * as Schema from "effect/Schema";
import { decodeExtensionNameSync } from "../extensions/index.js";
import { decodeHandleSync } from "../extensions/handle.js";
import {
  LibraryRefSchema,
  parseLibraryRef,
  parseLibraryRefOrThrow,
  formatLibraryRef,
} from "./ref.js";

describe("Library refs", () => {
  it("parses canonical library refs", () => {
    expect(parseLibraryRef("@acme/libraries/frontend")).toEqual({
      owner: "@acme",
      name: "frontend",
    });
  });

  it("formats canonical library refs", () => {
    expect(
      formatLibraryRef({
        owner: decodeHandleSync("@acme"),
        name: decodeExtensionNameSync("frontend"),
      }),
    ).toBe("@acme/libraries/frontend");
  });

  it("rejects extension FQNs and version suffixes", () => {
    expect(parseLibraryRef("@acme/skills/frontend")).toBeUndefined();
    expect(parseLibraryRef("@acme/libraries/frontend@1.0.0")).toBeUndefined();
  });

  it("decodes through schema", () => {
    expect(Schema.decodeUnknownSync(LibraryRefSchema)("@acme/libraries/frontend")).toBe(
      "@acme/libraries/frontend",
    );
  });

  it("throws for invalid refs in strict parser", () => {
    expect(() => parseLibraryRefOrThrow("@acme/packs/frontend")).toThrow(
      "Expected Library ref in @handle/libraries/name form",
    );
  });
});
