import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { Command } from "effect/unstable/cli";

import { jsonFlag } from "@axm.sh/core/unstable/cli-flags";
import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

const SkillResult = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  source: Schema.String,
  enabled: Schema.Boolean,
});

const sampleData = {
  name: "pr-review",
  version: "1.2.0",
  source: "acme/tools",
  enabled: true,
};

const sampleStreamData = [
  { name: "pr-review", version: "1.2.0", source: "acme/tools", enabled: true },
  { name: "test-gen", version: "1.2.0", source: "acme/tools", enabled: true },
  { name: "doc-writer", version: "0.5.1", source: "local/path", enabled: false },
];

const resultConfig = {} as const;

export const resultCommand = Command.make("result", resultConfig, () =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      const json = Option.getOrElse(yield* jsonFlag, () => false);

      if (json) {
        yield* renderer.result(sampleData, SkillResult);
        yield* renderer.resultStream(Stream.fromIterable(sampleStreamData), SkillResult);
      } else {
        yield* renderer.success(`Skill: ${sampleData.name} v${sampleData.version}`);
        yield* renderer.info(`Source: ${sampleData.source}`);
        yield* renderer.info(`Enabled: ${sampleData.enabled ? "yes" : "no"}`);
        yield* renderer.info("--- Stream items ---");
        yield* Effect.forEach(sampleStreamData, (item) =>
          renderer.info(`  ${item.name} v${item.version} (${item.source})`),
        );
      }
    }),
    { command: "outputs result" },
  ),
).pipe(Command.withDescription("Demo structured result output"));
