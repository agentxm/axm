import * as Effect from "effect/Effect";
import { Command, Flag } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

const sampleData = {
  name: "axm-spike",
  version: "0.0.1",
  skills: ["pr-review", "test-gen", "doc-writer"],
};

const rawConfig = {
  json: Flag.boolean("json").pipe(Flag.withDescription("Output as JSON")),
} as const;

export const rawCommand = Command.make("raw", rawConfig, (config) =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;

      if (config.json) {
        yield* renderer.json(sampleData);
      } else {
        yield* renderer.raw(
          [
            `Name: ${sampleData.name}`,
            `Version: ${sampleData.version}`,
            `Skills: ${sampleData.skills.join(", ")}`,
          ].join("\n"),
        );
      }
    }),
    { command: "outputs raw" },
  ),
).pipe(Command.withDescription("Demo raw and JSON output"));
