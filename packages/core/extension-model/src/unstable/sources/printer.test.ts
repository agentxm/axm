import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";
import { extensionName, handle } from "../test-helpers.js";
import { printSourceParams } from "./printer.js";

describe("printSourceParams", () => {
  it("prints source parameters", () => {
    expect(
      printSourceParams({
        type: "git",
        url: new URL("https://github.com/acme/widgets.git"),
        ref: Option.some("main"),
        subPath: Option.some("skills/foo"),
      }),
    ).toBe("github:acme/widgets//skills/foo@main");
    expect(
      printSourceParams({
        type: "git",
        url: new URL("https://dev.azure.com/acme/platform/_git/widgets"),
        ref: Option.some("main"),
        subPath: Option.some("skills/foo"),
      }),
    ).toBe("azurerepos:acme/platform/widgets//skills/foo@main");
    expect(
      printSourceParams({
        type: "git",
        url: new URL("https://gitlab.com/group/subgroup/widgets.git"),
        ref: Option.some("v2"),
        subPath: Option.some("packages/tool"),
      }),
    ).toBe("gitlab:group/subgroup/widgets//packages/tool@v2");
    expect(
      printSourceParams({
        type: "git",
        url: new URL("https://bitbucket.org/acme/widgets.git"),
        ref: Option.none(),
        subPath: Option.none(),
      }),
    ).toBe("bitbucket:acme/widgets");
    expect(
      printSourceParams({
        type: "git",
        url: new URL("https://example.com/acme/widgets.git"),
        ref: Option.some("main"),
        subPath: Option.none(),
      }),
    ).toBe("https://example.com/acme/widgets.git#main");
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
});
