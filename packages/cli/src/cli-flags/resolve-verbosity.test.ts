import { describe, expect, it } from "vitest";

import { resolveVerbosityFromArgv } from "./resolve-verbosity.js";

describe("resolveVerbosityFromArgv", () => {
  it('returns "normal" when no flags are present', () => {
    expect(resolveVerbosityFromArgv([])).toBe("normal");
  });

  it('returns "quiet" for --quiet', () => {
    expect(resolveVerbosityFromArgv(["--quiet"])).toBe("quiet");
  });

  it('returns "quiet" for -q', () => {
    expect(resolveVerbosityFromArgv(["-q"])).toBe("quiet");
  });

  it('returns "verbose" for --verbose', () => {
    expect(resolveVerbosityFromArgv(["--verbose"])).toBe("verbose");
  });

  it('returns "verbose" for -v', () => {
    expect(resolveVerbosityFromArgv(["-v"])).toBe("verbose");
  });

  it('returns "debug" for --debug', () => {
    expect(resolveVerbosityFromArgv(["--debug"])).toBe("debug");
  });

  it("does not recognize the removed -vv alias", () => {
    expect(resolveVerbosityFromArgv(["-vv"])).toBe("normal");
  });

  it("quiet wins when combined with -v", () => {
    expect(resolveVerbosityFromArgv(["-q", "-v"])).toBe("quiet");
  });

  it("quiet wins over -v regardless of order", () => {
    expect(resolveVerbosityFromArgv(["-v", "-q"])).toBe("quiet");
  });

  it("quiet wins over debug regardless of order", () => {
    expect(resolveVerbosityFromArgv(["-q", "--debug"])).toBe("quiet");
    expect(resolveVerbosityFromArgv(["--debug", "--quiet"])).toBe("quiet");
  });

  it("scans flags after -- (they are in raw argv)", () => {
    expect(resolveVerbosityFromArgv(["--", "--verbose"])).toBe("verbose");
  });

  it("ignores non-verbosity flags", () => {
    expect(resolveVerbosityFromArgv(["--json", "--force"])).toBe("normal");
  });
});
