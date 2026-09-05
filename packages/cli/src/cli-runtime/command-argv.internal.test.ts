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
  it("records argument/flag presence with kind prefixes but redacts values", () => {
    const argv = { source: "owner/repo", scope: "project", yes: true };
    const paramKinds = {
      source: "argument" as const,
      scope: "flag" as const,
      yes: "flag" as const,
    };

    expect(serializeArgv(argv, paramKinds)).toEqual({
      "cli.arg.source": "<redacted>",
      "cli.flag.scope": "<redacted>",
      "cli.flag.yes": "true",
    });
  });

  it("redacts array values without leaking their contents", () => {
    const argv = { skill: ["foo", "bar"] };
    const paramKinds = { skill: "flag" as const };

    expect(serializeArgv(argv, paramKinds)).toEqual({
      "cli.flag.skill": "<redacted>",
    });
  });

  it("keeps boolean toggle values (they carry no secret)", () => {
    const argv = { force: false, preview: true };
    const paramKinds = { force: "flag" as const, preview: "flag" as const };

    expect(serializeArgv(argv, paramKinds)).toEqual({
      "cli.flag.force": "false",
      "cli.flag.preview": "true",
    });
  });

  it("redacts numeric values", () => {
    const argv = { count: 5 };
    const paramKinds = { count: "flag" as const };

    expect(serializeArgv(argv, paramKinds)).toEqual({
      "cli.flag.count": "<redacted>",
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
      "cli.arg.source": "<redacted>",
    });
  });

  it("defaults unknown param kinds to cli.flag", () => {
    const argv = { unknown: "value" };
    const paramKinds: Record<string, "argument" | "flag"> = {};

    expect(serializeArgv(argv, paramKinds)).toEqual({
      "cli.flag.unknown": "<redacted>",
    });
  });

  it("never emits a secret-bearing value verbatim (regression)", () => {
    const secret = "Bearer sk-live-0xDEADBEEF-super-secret-token";
    const argv = {
      header: `Authorization: ${secret}`,
      env: "OPENAI_API_KEY=sk-live-0xDEADBEEF",
      url: "https://user:p4ssw0rd@example.com/repo.git",
    };
    const paramKinds = {
      header: "flag" as const,
      env: "flag" as const,
      url: "argument" as const,
    };

    const serialized = serializeArgv(argv, paramKinds);
    const emitted = JSON.stringify(serialized);

    expect(emitted).not.toContain("sk-live");
    expect(emitted).not.toContain("p4ssw0rd");
    expect(emitted).not.toContain("Bearer");
    // Presence + kind are still recorded for analytics.
    expect(serialized).toEqual({
      "cli.flag.header": "<redacted>",
      "cli.flag.env": "<redacted>",
      "cli.arg.url": "<redacted>",
    });
  });

  it("handles empty argv", () => {
    expect(serializeArgv({}, {})).toEqual({});
  });
});
