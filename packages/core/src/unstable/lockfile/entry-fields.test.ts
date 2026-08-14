import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { SourceHashSchema } from "../extensions/rendered-files.js";
import { gitSourceLockFields } from "./entry-fields.js";

describe("gitSourceLockFields", () => {
  it("persists locator plus immutable commit, tree, and content identities", () => {
    const contentIdentity = Schema.decodeUnknownSync(SourceHashSchema)("sha256-content");
    expect(
      gitSourceLockFields(
        {
          type: "github",
          url: new URL("https://github.com"),
          owner: "acme",
          repo: "extensions",
          ref: Option.some("main"),
          subPath: Option.some("skills/review"),
        },
        "commit-1",
        "tree-1",
        contentIdentity,
      ),
    ).toEqual({
      type: "github",
      owner: "acme",
      repo: "extensions",
      ref: "main",
      path: "skills/review",
      resolvedCommit: "commit-1",
      resolvedTree: "tree-1",
      contentIdentity,
    });
  });
});
