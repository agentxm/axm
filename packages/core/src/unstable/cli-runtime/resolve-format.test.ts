import * as Option from "effect/Option";
import { describe, expect, it } from "vitest";
import { resolveFormat, resolveFormatFromArgv } from "./resolve-format.js";

// ---------------------------------------------------------------------------
// resolveFormatFromArgv
// ---------------------------------------------------------------------------

describe("resolveFormatFromArgv", () => {
  it("returns explicit --json", () => {
    expect(resolveFormatFromArgv(["--json"])).toBe("json");
  });

  it("returns explicit -j", () => {
    expect(resolveFormatFromArgv(["-j"])).toBe("json");
  });

  it("defaults to text without --json", () => {
    expect(resolveFormatFromArgv([])).toBe("text");
  });

  it("ignores other flags when resolving format", () => {
    expect(resolveFormatFromArgv(["--verbose"])).toBe("text");
  });
});

// ---------------------------------------------------------------------------
// resolveFormat
// ---------------------------------------------------------------------------

describe("resolveFormat", () => {
  it("returns explicit json", () => {
    expect(resolveFormat(Option.some(true))).toBe("json");
  });

  it("treats explicit false as text", () => {
    expect(resolveFormat(Option.some(false))).toBe("text");
  });

  it("defaults to text when json is not requested", () => {
    expect(resolveFormat(Option.none())).toBe("text");
  });
});
