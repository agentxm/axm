import { describe, expect, it } from "vitest";
import { fileUrlToPath } from "./utils.js";

describe("fileUrlToPath", () => {
  it("converts a basic file:// URL to a path", () => {
    expect(fileUrlToPath("file:///home/user/project")).toBe("/home/user/project");
  });

  it("decodes percent-encoded characters", () => {
    expect(fileUrlToPath("file:///home/user/my%20project")).toBe("/home/user/my project");
  });

  it("handles paths with special characters", () => {
    expect(fileUrlToPath("file:///tmp/foo%23bar")).toBe("/tmp/foo#bar");
  });
});
