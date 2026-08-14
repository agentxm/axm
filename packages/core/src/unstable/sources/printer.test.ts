import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { SourceHashSchema } from "../extensions/rendered-files.js";
import { exactVersion, extensionName, handle } from "../test-helpers.js";
import {
  lockEntryToSourceParams,
  printSkillLockSourceLocator,
  printSourceParams,
} from "./printer.js";

const contentIdentity = Schema.decodeUnknownSync(SourceHashSchema)("sha256-content");

describe("source printers", () => {
  it("prints source parameters", () => {
    expect(
      printSourceParams({
        type: "github",
        owner: "acme",
        repo: "widgets",
        ref: Option.some("main"),
        subPath: Option.some("skills/foo"),
      }),
    ).toBe("github:acme/widgets//skills/foo@main");
    expect(printSourceParams({ type: "local", path: "./skills/foo" })).toBe("./skills/foo");
    expect(
      printSourceParams({
        type: "workspace",
        owner: handle("@acme"),
        extensionType: "skill",
        name: extensionName("review"),
      }),
    ).toBe("workspace:@acme/skills/review");
  });

  it("maps accepted Git and local resolutions back to source parameters", () => {
    expect(
      lockEntryToSourceParams({
        type: "github",
        owner: "acme",
        repo: "extensions",
        ref: "main",
        path: "skills/review",
        resolvedCommit: "commit-1",
        resolvedTree: "tree-1",
        contentIdentity,
      }),
    ).toEqual({
      type: "github",
      owner: "acme",
      repo: "extensions",
      ref: Option.some("main"),
      subPath: Option.some("skills/review"),
    });
    expect(lockEntryToSourceParams({ type: "local", path: "../review", contentIdentity })).toEqual({
      type: "local",
      path: "../review",
    });
  });

  it("prints a Registry accepted resolution as an exact locator", () => {
    expect(
      printSkillLockSourceLocator("ignored", {
        type: "registry",
        owner: handle("@acme"),
        name: extensionName("review"),
        resolvedVersion: exactVersion("1.2.3"),
        integrity: "sha512-archive",
        sourceName: "default",
        publisherBindingId: "binding-1",
      }),
    ).toBe("@acme/skills/review@1.2.3");
  });
});
