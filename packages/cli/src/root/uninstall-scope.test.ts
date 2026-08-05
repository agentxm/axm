import * as Effect from "effect/Effect";
import { CliOutput, Command } from "effect/unstable/cli";
import { describe, expect, it } from "vitest";

import { rootCommand } from "../app.js";
import { makeAxmFormatter } from "../formatter.js";
import { baseLayer } from "../runtime.js";

const captureHelp = (path: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    let output = "";
    const formatter = makeAxmFormatter();
    yield* Command.runWith(rootCommand, { version: "0.0.0-test" })([...path, "--help"]).pipe(
      Effect.provide(baseLayer),
      Effect.provideService(CliOutput.Formatter, {
        ...formatter,
        formatHelpDoc: (doc) => {
          output = formatter.formatHelpDoc(doc);
          return output;
        },
      }),
    );
    return output;
  });

describe("mcps install flags", () => {
  it("documents --env as repeatable", async () => {
    const output = await Effect.runPromise(captureHelp(["mcps", "install"]));
    expect(output).toContain("--env");
    expect(output).toContain("repeatable");
  });

  it("does not declare a per-command --non-interactive", async () => {
    // A global --non-interactive still parses; the per-command duplicate was
    // never read by the install operation.
    const output = await Effect.runPromise(captureHelp(["mcps", "install"]));
    expect(output).not.toContain("prompting for MCP inputs");
  });
});

describe("uninstall --scope parity", () => {
  // Every install counterpart already accepts --scope; without it these verbs
  // could only ever uninstall from the project workspace.
  it.each([["skills"], ["commands"], ["mcps"], ["subagents"], ["hooks"]])(
    "%s uninstall accepts --scope",
    async (group) => {
      const output = await Effect.runPromise(captureHelp([group, "uninstall"]));
      expect(output).toContain("--scope");
      expect(output).toContain("choices: project, user");
    },
  );
});
