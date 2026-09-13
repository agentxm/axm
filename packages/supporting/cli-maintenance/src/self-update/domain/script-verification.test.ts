import { describe, expect, it } from "vitest";
import { acceptsScriptExecutable, selectReleaseChecksum } from "./script-verification.js";

describe("script release verification", () => {
  const hash = "a".repeat(64);
  const name = "axm-linux-x64";

  it("selects one checksum only from a wholly valid manifest", () => {
    expect(selectReleaseChecksum(`${hash}  ${name}\n`, name)).toEqual({
      valid: true,
      sha256Hex: hash,
    });
    for (const manifest of [
      "",
      "malformed\n",
      `${hash}  ${name}\nmalformed\n`,
      `${hash}  ${name}\n${hash}  ${name}\n`,
    ]) {
      expect(selectReleaseChecksum(manifest, name).valid).toBe(false);
    }
  });

  it("requires the selected version and a successful exit before accepting a download", () => {
    expect(acceptsScriptExecutable({ exitCode: 0, reportedVersion: "2.0.0" }, "2.0.0")).toBe(true);
    expect(acceptsScriptExecutable({ exitCode: 1, reportedVersion: "2.0.0" }, "2.0.0")).toBe(false);
    expect(acceptsScriptExecutable({ exitCode: 0, reportedVersion: "1.0.0" }, "2.0.0")).toBe(false);
  });

  it("an unknown original version requires successful restored execution without inventing a version", () => {
    expect(acceptsScriptExecutable({ exitCode: 0, reportedVersion: null }, null)).toBe(true);
    expect(acceptsScriptExecutable({ exitCode: null, reportedVersion: null }, null)).toBe(false);
  });
});
