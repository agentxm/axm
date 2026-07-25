import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Argument, Command } from "effect/unstable/cli";
import { AGENTS, installable, type Agent } from "@agentxm/client-core/unstable/agent-capabilities";
import { makeAppError, type AppError } from "@agentxm/client-core/unstable/app-error";
import {
  CliRenderer,
  registerEntity,
  type TableView,
} from "@agentxm/client-core/unstable/cli-renderer";
import {
  HOOK_MANIFEST_FILENAME,
  HookManifestSchema,
  type HookManifest,
} from "@agentxm/client-core/unstable/hooks";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { withRuntime } from "../../runtime.js";

interface HookPortabilityItem {
  readonly agent: string;
  readonly status: "installable" | "excluded";
  readonly reason: string;
}

const HookPortabilityTable = {
  columns: {
    agent: { header: "Agent" },
    status: { header: "Status" },
    reason: { header: "Reason" },
  },
} as const satisfies TableView<HookPortabilityItem>;

registerEntity<HookPortabilityItem>("hook-portability", {
  list: {
    columns: HookPortabilityTable.columns,
    emptyMessage: "No hook portability results",
    singularLabel: "hook portability result",
    pluralLabel: "hook portability results",
  },
});

const decodeHookManifest = Schema.decodeUnknownEffect(HookManifestSchema);

const manifestPathFor = (path: Path.Path, input: string): string =>
  input.endsWith(HOOK_MANIFEST_FILENAME) ? input : path.join(input, HOOK_MANIFEST_FILENAME);

const readManifest = (
  input: string,
): Effect.Effect<HookManifest, AppError, FileSystem.FileSystem | Path.Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manifestPath = manifestPathFor(path, input);
    const raw = yield* fs.readFileString(manifestPath).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "validation",
          detail: `Failed to read ${manifestPath}`,
          cause: error,
        }),
      ),
    );
    const parsed = yield* Effect.try({
      try: (): unknown => JSON.parse(raw),
      catch: (error) =>
        makeAppError({
          code: "validation",
          detail: `Failed to parse ${manifestPath}`,
          cause: error,
        }),
    });
    return yield* decodeHookManifest(parsed).pipe(
      Effect.mapError((error) =>
        makeAppError({
          code: "validation",
          detail: `Failed to decode ${manifestPath}`,
          cause: error,
        }),
      ),
    );
  });

const portabilityForAgent = (agent: Agent, manifest: HookManifest): HookPortabilityItem => {
  for (const binding of manifest.bindings) {
    const verdict = installable(agent, binding);
    if (!verdict.installable) {
      return {
        agent: agent.name,
        status: "excluded",
        reason: verdict.reason,
      };
    }
  }
  return {
    agent: agent.name,
    status: "installable",
    reason: "All bindings are supported.",
  };
};

export const handleHookInfo = Effect.fn("HookInfo.handle")(function* (input: string) {
  const renderer = yield* CliRenderer;
  const manifest = yield* readManifest(input);
  const items = AGENTS.map((agent) => portabilityForAgent(agent, manifest)).sort((left, right) =>
    left.agent.localeCompare(right.agent),
  );

  if (
    yield* renderer.list("hook-portability", {
      items,
      count: items.length,
    })
  ) {
    return;
  }

  yield* renderer.table(items, HookPortabilityTable, "Hook portability");
});

const infoConfig = {
  path: Argument.string("path").pipe(
    Argument.withDescription("Path to a hook package directory or hook.json"),
  ),
} as const;

export const infoCommand = Command.make("info", infoConfig, ({ path }) =>
  handleHookInfo(path).pipe(withRuntime("hooks info")),
).pipe(
  withArgvTracking(infoConfig),
  Command.withDescription("Show hook portability by agent"),
  Command.withExamples([
    {
      command: "axm hooks info .axm/extensions/@acme/hooks/block-secrets",
      description: "Show which agents can install a local hook package",
    },
  ]),
);
