import { describe, expect, it } from "vitest";
import * as Option from "effect/Option";
import type { GitBasedSource } from "../sources/types.js";
import { gitSourceLockFields } from "./entry-fields.js";

describe("gitSourceLockFields", () => {
  it("maps hosted git source fields with optional ref, path, and tree hash", () => {
    const source = {
      type: "github",
      url: new URL("https://github.com"),
      owner: "acme",
      repo: "tools",
      ref: Option.some("main"),
      subPath: Option.some("packages/review"),
    } satisfies GitBasedSource;

    expect(gitSourceLockFields(source, Option.some("tree-sha"))).toEqual({
      type: "github",
      owner: "acme",
      repo: "tools",
      ref: "main",
      path: "packages/review",
      gitTreeHash: "tree-sha",
    });
  });

  it("maps Azure Repos source fields", () => {
    const source = {
      type: "azurerepos",
      url: new URL("https://dev.azure.com"),
      organization: "org",
      project: "project",
      repo: "tools",
      ref: Option.none(),
      subPath: Option.some("extensions"),
    } satisfies GitBasedSource;

    expect(gitSourceLockFields(source, Option.none())).toEqual({
      type: "azurerepos",
      organization: "org",
      project: "project",
      repo: "tools",
      path: "extensions",
    });
  });

  it("maps generic git source fields without hosted path", () => {
    const source = {
      type: "git",
      url: new URL("https://example.com/tools.git"),
      ref: Option.some("v1"),
    } satisfies GitBasedSource;

    expect(gitSourceLockFields(source, Option.none())).toEqual({
      type: "git",
      url: "https://example.com/tools.git",
      ref: "v1",
    });
  });
});
