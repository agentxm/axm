import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command } from "effect/unstable/cli";

import { jsonFlag } from "@axm.sh/core/unstable/cli-flags";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

const sampleData = {
  name: "axm-spike",
  version: "0.0.1",
  skills: ["pr-review", "test-gen", "doc-writer"],
};

const rawConfig = {} as const;

export const rawCommand = Command.make("raw", rawConfig, () =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      const json = Option.getOrElse(yield* jsonFlag, () => false);

      if (json) {
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
