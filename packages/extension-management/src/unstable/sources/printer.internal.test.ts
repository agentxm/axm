import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { TreeIntegritySchema } from "../workspace/materialized-tree.js";
import { SourceHashSchema } from "../workspace/rendered-files.js";
import { exactVersion, extensionName, handle } from "../test-helpers.js";
import {
  lockEntryToSourceParams,
  printSkillLockSourceLocator,
  printSourceParams,
} from "./printer.js";

const contentIdentity = Schema.decodeUnknownSync(SourceHashSchema)("sha256-content");
const treeIntegrity = Schema.decodeUnknownSync(TreeIntegritySchema)(
  `sha256-tree-v1:${"0".repeat(64)}`,
);

describe("source printers", () => {
  it("prints source parameters", () => {
    expect(
      printSourceParams({
        type: "github",
        sourceName: "github",
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
        sourceType: "github",
        sourceName: "github",
        endpoint: new URL("https://github.com"),
        extensionType: "skill",
        workspaceName: extensionName("review"),
        packageFormat: "agentxm",
        packageOwner: handle("@acme"),
        packageName: extensionName("review"),
        owner: "acme",
        repo: "extensions",
        ref: "main",
        path: "skills/review",
        resolvedCommit: "commit-1",
        resolvedTree: "tree-1",
        contentIdentity,
        treeIntegrity,
      }),
    ).toEqual({
      type: "github",
      sourceName: "github",
      owner: "acme",
      repo: "extensions",
      ref: Option.some("main"),
      subPath: Option.some("skills/review"),
    });
    expect(
      lockEntryToSourceParams({
        type: "local",
        sourceType: "local",
        sourceName: "local",
        extensionType: "skill",
        workspaceName: extensionName("review"),
        packageFormat: "agentxm",
        packageOwner: handle("@acme"),
        packageName: extensionName("review"),
        path: "../review",
        contentIdentity,
        treeIntegrity,
      }),
    ).toEqual({ type: "local", path: "../review" });
  });

  it("prints a Registry accepted resolution as an exact locator", () => {
    expect(
      printSkillLockSourceLocator("ignored", {
        type: "registry",
        sourceType: "registry",
        endpoint: new URL("https://registry.agentxm.ai"),
        extensionType: "skill",
        workspaceName: extensionName("review"),
        packageFormat: "agentxm",
        owner: handle("@acme"),
        name: extensionName("review"),
        resolvedVersion: exactVersion("1.2.3"),
        integrity: "sha512-archive",
        sourceName: "agentxm",
        publisherBindingId: "binding-1",
        treeIntegrity,
      }),
    ).toBe("agentxm:@acme/skills/review@1.2.3");
  });
});
