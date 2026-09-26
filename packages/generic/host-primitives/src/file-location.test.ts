import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { fromFileLocation, toFileLocation } from "./file-location.js";

describe("file locations", () => {
  it("decodes a basic file URL", () => {
    expect(fromFileLocation("file:///home/user/project")).toBe("/home/user/project");
  });

  it("decodes percent-encoded spaces", () => {
    expect(fromFileLocation("file:///home/user/my%20project")).toBe("/home/user/my project");
  });

  it("decodes special characters", () => {
    expect(fromFileLocation("file:///tmp/foo%23bar")).toBe("/tmp/foo#bar");
  });

  it("round-trips a path with spaces, #, and %", () => {
    const location = path.join(os.tmpdir(), "my project #1%", "file.txt");
    expect(fromFileLocation(toFileLocation(location))).toBe(location);
  });

  it.skipIf(process.platform !== "win32")("round-trips a Windows drive path", () => {
    const location = path.win32.join("C:\\", "Users", "Agent", "my file#1%");
    expect(fromFileLocation(toFileLocation(location))).toBe(location);
  });

  it("passes through non-file ref locations", () => {
    expect(fromFileLocation("github:owner/repo")).toBe("github:owner/repo");
  });
});
