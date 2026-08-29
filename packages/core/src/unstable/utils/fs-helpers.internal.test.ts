import * as nodePath from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { stripFileProtocol } from "./fs-helpers.js";

describe("filesystem helpers", () => {
  it("decodes file URLs into native paths", () => {
    const nativePath = nodePath.join(
      nodePath.parse(process.cwd()).root,
      "source with spaces",
      "#1",
    );

    expect(stripFileProtocol(pathToFileURL(nativePath).href)).toBe(nativePath);
  });

  it("preserves native paths", () => {
    const nativePath = nodePath.join("source with spaces", "skill");

    expect(stripFileProtocol(nativePath)).toBe(nativePath);
  });
});
