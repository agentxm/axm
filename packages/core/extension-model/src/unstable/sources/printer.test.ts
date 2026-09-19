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
