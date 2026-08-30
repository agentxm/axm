import * as Effect from "effect/Effect";
import { CliOutput, Command } from "effect/unstable/cli";
import { describe, expect, it } from "@effect/vitest";

import { rootCommand } from "../../app.js";
import { makeAxmFormatter } from "../../formatter.js";
import { baseLayer } from "../../runtime.js";
import { CATALOG_EXTENSION_TYPES } from "@agentxm/extension-model/unstable/extension-types";

const ANSI_ESCAPE = String.fromCharCode(27);
const ANSI_PATTERN = new RegExp(`${ANSI_ESCAPE}\\[[0-?]*[ -/]*[@-~]`, "g");

describe("root sync command help", () => {
  it.effect("documents the one-shot release-age bypass", () =>
    Effect.gen(function* () {
      let output = "";
      const baseFormatter = makeAxmFormatter();
      const formatter: CliOutput.Formatter = {
        ...baseFormatter,
        formatHelpDoc: (doc) => {
          output = baseFormatter.formatHelpDoc(doc);
          return output;
        },
      };

      yield* Command.runWith(rootCommand, { version: "0.0.0-test" })(["sync", "--help"]).pipe(
        Effect.provide(baseLayer),
        Effect.provideService(CliOutput.Formatter, formatter),
      );

      const normalized = output.replace(ANSI_PATTERN, "").replace(/\s+/gu, " ");
      expect(normalized).toContain("--ignore-release-age");
      expect(normalized).toContain(`choices: ${CATALOG_EXTENSION_TYPES.join(", ")}`);
      expect(normalized).not.toContain(
        "choices: skill, mcp-server, subagent, rule, hook, knowledge, pack",
      );
    }),
  );
});
