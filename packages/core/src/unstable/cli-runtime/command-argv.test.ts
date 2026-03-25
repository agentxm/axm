import { describe, expect, it } from "vitest";
import { Argument, Flag } from "effect/unstable/cli";
import { extractParamKinds, serializeArgv } from "./command-argv.js";

describe("extractParamKinds", () => {
  it("identifies arguments and flags from a config object", () => {
    const config = {
      source: Argument.string("source"),
      scope: Flag.string("scope"),
      yes: Flag.boolean("yes"),
    };

    expect(extractParamKinds(config)).toEqual({
      source: "argument",
      scope: "flag",
      yes: "flag",
    });
  });

  it("skips non-Param values", () => {
    const config = {
      source: Argument.string("source"),
      notAParam: "some-string",
      alsoNot: 42,
    };

    expect(extractParamKinds(config)).toEqual({
      source: "argument",
    });
  });

  it("handles empty config", () => {
    expect(extractParamKinds({})).toEqual({});
  });
});

describe("serializeArgv", () => {
  it("prefixes arguments with cli.arg and flags with cli.flag", () => {
    const argv = { source: "owner/repo", scope: "project", yes: true };
    const paramKinds = { source: "argument" as const, scope: "flag" as const, yes: "flag" as const };

    expect(serializeArgv(argv, paramKinds)).toEqual({
      "cli.arg.source": "owner/repo",
      "cli.flag.scope": "project",
      "cli.flag.yes": "true",
    });
  });

  it("joins array values with commas", () => {
    const argv = { skill: ["foo", "bar"] };
    const paramKinds = { skill: "flag" as const };

    expect(serializeArgv(argv, paramKinds)).toEqual({
      "cli.flag.skill": "foo,bar",
    });
  });

  it("converts booleans to strings", () => {
    const argv = { force: false, preview: true };
    const paramKinds = { force: "flag" as const, preview: "flag" as const };

    expect(serializeArgv(argv, paramKinds)).toEqual({
      "cli.flag.force": "false",
      "cli.flag.preview": "true",
    });
  });

  it("converts numbers to strings", () => {
    const argv = { count: 5 };
    const paramKinds = { count: "flag" as const };

    expect(serializeArgv(argv, paramKinds)).toEqual({
      "cli.flag.count": "5",
    });
  });

  it("skips null and undefined values", () => {
    const argv = { source: "repo", optional: null, missing: undefined };
    const paramKinds = {
      source: "argument" as const,
      optional: "flag" as const,
      missing: "flag" as const,
    };

    expect(serializeArgv(argv, paramKinds)).toEqual({
      "cli.arg.source": "repo",
    });
  });

  it("defaults unknown param kinds to cli.flag", () => {
    const argv = { unknown: "value" };
    const paramKinds: Record<string, "argument" | "flag"> = {};

    expect(serializeArgv(argv, paramKinds)).toEqual({
      "cli.flag.unknown": "value",
    });
  });

  it("handles empty argv", () => {
    expect(serializeArgv({}, {})).toEqual({});
  });
});
