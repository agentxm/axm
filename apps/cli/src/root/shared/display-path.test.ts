import * as nodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import { formatDisplayPath } from "./display-path.js";

describe("display path helpers", () => {
  it("normalizes display paths with mixed separators", () => {
    expect(formatDisplayPath(nodePath.win32, "C:\\_code\\hello-claude\\axm.json")).toBe(
      "C:\\_code\\hello-claude\\axm.json",
    );
  });
});
