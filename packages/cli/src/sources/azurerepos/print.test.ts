import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";

import type { AzureReposSourceInput } from "../types.js";
import { print } from "./print.js";

const makeSource = (
  overrides: Partial<Pick<AzureReposSourceInput, "organization" | "project" | "repo">> & {
    ref?: string;
    subPath?: string;
  } = {},
): AzureReposSourceInput => ({
  type: "azurerepos",
  organization: overrides.organization ?? "myorg",
  project: overrides.project ?? "myproject",
  repo: overrides.repo ?? "myrepo",
  ref: Option.fromNullable(overrides.ref),
  subPath: Option.fromNullable(overrides.subPath),
});

describe("print", () => {
  it("formats org/project/repo", () => {
    expect(print(makeSource())).toBe("azurerepos:myorg/myproject/myrepo");
  });

  it("formats with subPath", () => {
    expect(print(makeSource({ subPath: "src/lib" }))).toBe(
      "azurerepos:myorg/myproject/myrepo/src/lib",
    );
  });

  it("formats with ref", () => {
    expect(print(makeSource({ ref: "v1.0.0" }))).toBe("azurerepos:myorg/myproject/myrepo@v1.0.0");
  });

  it("formats with subPath and ref", () => {
    expect(print(makeSource({ subPath: "src/lib", ref: "v2" }))).toBe(
      "azurerepos:myorg/myproject/myrepo/src/lib@v2",
    );
  });
});
