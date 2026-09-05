// @effect-diagnostics anyUnknownInErrorContext:off — parser failures are foreign CliError values asserted by tag
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";

import { rootCommand } from "../app.js";
import { TEST_VERSION } from "../command-tree-test-helpers.js";
import { baseLayer } from "../runtime.js";
import { agentFlag } from "./agent-flag.js";

const parseRoot = (args: ReadonlyArray<string>) =>
  Command.runWith(rootCommand, { version: TEST_VERSION })(args).pipe(
    Effect.provide(baseLayer),
    Effect.result,
  );

const errorTag = (error: unknown): string | undefined =>
  typeof error === "object" && error !== null && "_tag" in error && typeof error._tag === "string"
    ? error._tag
    : undefined;

// The product runtime registers the help built-in, so the parser reports a
// parse failure as ShowHelp carrying the underlying errors.
const parseFailureTags = (result: {
  readonly _tag: string;
  readonly failure?: unknown;
}): ReadonlyArray<string> => {
  if (result._tag !== "Failure") return [];
  const failure = result.failure;
  if (
    errorTag(failure) === "ShowHelp" &&
    typeof failure === "object" &&
    failure !== null &&
    "errors" in failure &&
    Array.isArray(failure.errors)
  ) {
    return failure.errors.flatMap((error) => {
      const tag = errorTag(error);
      return tag === undefined ? [] : [tag];
    });
  }
  const tag = errorTag(failure);
  return tag === undefined ? [] : [tag];
};

describe("agentFlag", () => {
  it.effect("collects every repeated catalog identifier", () =>
    Effect.gen(function* () {
      let seen: ReadonlyArray<string> = [];
      const probe = Command.make("probe", { agent: agentFlag }, ({ agent }) =>
        Effect.sync(() => {
          seen = agent;
        }),
      );
      yield* Command.runWith(probe, { version: TEST_VERSION })([
        "--agent",
        "claude-code",
        "--agent",
        "cursor",
      ]).pipe(Effect.provide(baseLayer));
      expect(seen).toEqual(["claude-code", "cursor"]);
    }),
  );

  it.effect("defaults to no selection when the flag is absent", () =>
    Effect.gen(function* () {
      let seen: ReadonlyArray<string> | undefined;
      const probe = Command.make("probe", { agent: agentFlag }, ({ agent }) =>
        Effect.sync(() => {
          seen = agent;
        }),
      );
      yield* Command.runWith(probe, { version: TEST_VERSION })([]).pipe(Effect.provide(baseLayer));
      expect(seen).toEqual([]);
    }),
  );

  it.effect("rejects an identifier outside the supported catalog before any handler runs", () =>
    Effect.gen(function* () {
      for (const path of [
        ["setup", "--scope", "project", "--yes", "--non-interactive"],
        ["skills", "list"],
        ["subagents", "list"],
      ]) {
        const result = yield* parseRoot([...path, "--agent", "not-an-agent"]);
        expect(parseFailureTags(result), path.join(" ")).toContain("InvalidValue");
      }
    }),
  );

  it.effect("is not accepted by commands that create or update one extension", () =>
    Effect.gen(function* () {
      for (const path of [
        ["skills", "new", "example"],
        ["subagents", "new", "example"],
        ["skills", "update"],
        ["subagents", "update"],
      ]) {
        const result = yield* parseRoot([...path, "--agent", "claude-code"]);
        expect(parseFailureTags(result), path.join(" ")).toContain("UnrecognizedOption");
      }
    }),
  );
});
