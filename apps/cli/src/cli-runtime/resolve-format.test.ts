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

  it("keeps diagnostics off stdout when raw token output is requested with --json", () => {
    expect(resolveFormatFromArgv(["token", "--output", "token", "--json"])).toBe("text");
    expect(resolveFormatFromArgv(["token", "--output=token", "-j"])).toBe("text");
  });

  it("reads no options after --", () => {
    expect(resolveFormatFromArgv(["run", "--", "--json"])).toBe("text");
    expect(resolveFormatFromArgv(["run", "--json", "--", "--output", "token"])).toBe("json");
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
