import * as nodePath from "node:path";
import { describe, expect, it } from "vitest";
import { handle } from "../test-helpers.js";
import {
  computeExtensionPaths,
  extensionContentFilename,
  extensionContentPath,
} from "./extension-paths.js";

describe("extension path helpers", () => {
  it("computes registry extension canonical and source paths", () => {
    const paths = computeExtensionPaths(
      nodePath.join,
      "/workspace",
      { refType: "registry", owner: handle("@acme") },
      "rules",
      "review-pr",
    );

    expect(paths).toEqual({
      canonicalPath: "/workspace/.axm/extensions/@acme/rules/review-pr",
      extensionSrcPath: "/workspace/.axm/extensions/@acme/rules/review-pr/src",
    });
  });

  it("computes external extension canonical and source paths", () => {
    const paths = computeExtensionPaths(
      nodePath.join,
      "/workspace",
      { refType: "local", owner: handle("@acme") },
      "subagents",
      "reviewer",
    );

    expect(paths).toEqual({
      canonicalPath: "/workspace/.axm/extensions/external/subagents/reviewer",
      extensionSrcPath: "/workspace/.axm/extensions/external/subagents/reviewer",
    });
  });

  it("computes markdown content filenames and paths", () => {
    expect(extensionContentFilename("review-pr")).toBe("review-pr.md");
    expect(extensionContentPath(nodePath.join, "/workspace/rules/review-pr", "review-pr")).toBe(
      "/workspace/rules/review-pr/review-pr.md",
    );
  });
});
