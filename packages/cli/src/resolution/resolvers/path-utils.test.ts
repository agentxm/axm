import * as os from "node:os";
import { describe, expect, it } from "vitest";
import { expandHome } from "./path-utils.js";

describe("expandHome", () => {
  it("expands bare ~ to home directory", () => {
    expect(expandHome("~")).toBe(os.homedir());
  });

  it("expands ~/path to home directory + path", () => {
    const result = expandHome("~/projects");
    expect(result).toContain(os.homedir());
    expect(result).toContain("projects");
  });

  it("returns non-tilde paths unchanged", () => {
    expect(expandHome("/usr/bin")).toBe("/usr/bin");
    expect(expandHome("./relative")).toBe("./relative");
  });
});
