import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withRuntime } from "../../runtime.js";

interface SampleSkillDetail {
  readonly name: string;
  readonly source: string;
  readonly version: string;
  readonly enabled: boolean;
  readonly installedAt: string;
  readonly scope: string;
}

const sampleItem: SampleSkillDetail = {
  name: "pr-review",
  source: "acme/tools",
  version: "1.2.0",
  enabled: true,
  installedAt: "2026-03-20T10:30:00Z",
  scope: "project",
};

const detailConfig = {
  title: Flag.string("title").pipe(Flag.withDescription("Detail view title"), Flag.optional),
} as const;

export const detailCommand = Command.make("detail", detailConfig, (config) =>
  withRuntime(
    Effect.gen(function* () {
      const renderer = yield* CliRenderer;
      yield* renderer.detail(
        sampleItem,
        [
          {
            key: "name",
            header: "Name",
            value: (s: SampleSkillDetail) => s.name,
            priority: 1,
            align: "left" as const,
            width: "auto" as const,
          },
          {
            key: "source",
            header: "Source",
            value: (s: SampleSkillDetail) => s.source,
            priority: 2,
            align: "left" as const,
            width: "auto" as const,
          },
          {
            key: "version",
            header: "Version",
            value: (s: SampleSkillDetail) => s.version,
            priority: 3,
            align: "left" as const,
            width: "auto" as const,
          },
          {
            key: "enabled",
            header: "Enabled",
            value: (s: SampleSkillDetail) => (s.enabled ? "yes" : "no"),
            priority: 4,
            align: "left" as const,
            width: "auto" as const,
          },
          {
            key: "installedAt",
            header: "Installed At",
            value: (s: SampleSkillDetail) => s.installedAt,
            priority: 5,
            align: "left" as const,
            width: "auto" as const,
          },
          {
            key: "scope",
            header: "Scope",
            value: (s: SampleSkillDetail) => s.scope,
            priority: 6,
            align: "left" as const,
            width: "auto" as const,
          },
        ],
        Option.getOrUndefined(config.title),
      );
    }),
    { command: "outputs detail" },
  ),
).pipe(Command.withDescription("Demo detail key-value display"));
