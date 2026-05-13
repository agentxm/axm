import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { formatDisplayPath, joinDisplayPath } from "./display-path.js";

describe("display path helpers", () => {
  it("joins relative display paths with native Windows separators", () => {
    expect(
      joinDisplayPath(
        nodePath.win32,
        ".axm",
        "extensions",
        "@acme",
        "commands",
        "cool-emoji",
        "src",
        "cool-emoji.md",
      ),
    ).toBe(".axm\\extensions\\@acme\\commands\\cool-emoji\\src\\cool-emoji.md");
  });

  it("joins absolute display paths without mixed Windows separators", () => {
    expect(joinDisplayPath(nodePath.win32, "C:\\_code\\hello-claude\\.axm", "settings.json")).toBe(
      "C:\\_code\\hello-claude\\.axm\\settings.json",
    );
  });

  it("normalizes display paths with mixed separators", () => {
    expect(formatDisplayPath(nodePath.win32, "C:\\_code\\hello-claude\\.axm/settings.json")).toBe(
      "C:\\_code\\hello-claude\\.axm\\settings.json",
    );
  });
});
