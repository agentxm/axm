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

  it('returns "normal" for -v because the CLI reserves it for --version', () => {
    expect(resolveVerbosityFromArgv(["-v"])).toBe("normal");
  });

  it('returns "debug" for --debug', () => {
    expect(resolveVerbosityFromArgv(["--debug"])).toBe("debug");
  });

  it('returns "debug" for -vv', () => {
    expect(resolveVerbosityFromArgv(["-vv"])).toBe("debug");
  });

  it("last flag wins among verbosity flags: -q -v remains quiet", () => {
    expect(resolveVerbosityFromArgv(["-q", "-v"])).toBe("quiet");
  });

  it("ignores -v when resolving verbosity", () => {
    expect(resolveVerbosityFromArgv(["-v", "-q"])).toBe("quiet");
  });

  it("last flag wins: -q --debug returns debug", () => {
    expect(resolveVerbosityFromArgv(["-q", "--debug"])).toBe("debug");
  });

  it("scans flags after -- (they are in raw argv)", () => {
    expect(resolveVerbosityFromArgv(["--", "--verbose"])).toBe("verbose");
  });

  it("ignores non-verbosity flags", () => {
    expect(resolveVerbosityFromArgv(["--json", "--force", "-v"])).toBe("normal");
  });
});
