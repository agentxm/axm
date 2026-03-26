import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

interface SampleSkill {
  readonly name: string;
  readonly source: string;
  readonly version: string;
  readonly enabled: boolean;
}

const sampleSkills: ReadonlyArray<SampleSkill> = [
  { name: "pr-review", source: "acme/tools", version: "1.2.0", enabled: true },
  { name: "test-gen", source: "acme/tools", version: "1.2.0", enabled: true },
  { name: "doc-writer", source: "local/path", version: "0.5.1", enabled: false },
  { name: "code-explain", source: "acme/utils", version: "2.0.0", enabled: true },
];

const tableConfig = {
  caption: Flag.string("caption").pipe(Flag.withDescription("Table caption"), Flag.optional),
} as const;

export const tableCommand = Command.make("table", tableConfig, (config) =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      yield* renderer.table(
        sampleSkills,
        [
          {
            key: "name",
            header: "Name",
            value: (s: SampleSkill) => s.name,
            priority: 1,
            align: "left" as const,
            width: "auto" as const,
          },
          {
            key: "source",
            header: "Source",
            value: (s: SampleSkill) => s.source,
            priority: 2,
            align: "left" as const,
            width: "auto" as const,
          },
          {
            key: "version",
            header: "Version",
            value: (s: SampleSkill) => s.version,
            priority: 3,
            align: "left" as const,
            width: "auto" as const,
          },
          {
            key: "enabled",
            header: "Enabled",
            value: (s: SampleSkill) => (s.enabled ? "yes" : "no"),
            priority: 4,
            align: "left" as const,
            width: "auto" as const,
          },
        ],
        Option.getOrUndefined(config.caption),
      );
    }),
    { command: "outputs table" },
  ),
).pipe(Command.withDescription("Demo table data display"));
