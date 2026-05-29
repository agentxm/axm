import { Argument, Command, Flag } from "effect/unstable/cli";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { CliRenderer } from "@agentxm/client-core/unstable/cli-renderer";
import { forceFlag, previewFlag, yesFlag } from "@agentxm/client-core/unstable/cli-flags";
import { withArgvTracking } from "@agentxm/client-core/unstable/cli-runtime";
import { buildInstallOperation } from "@agentxm/client-core/unstable/extensions";
import { DocsManager } from "@agentxm/client-core/unstable/docs";
import { previewOrApplyPlan, type Plan } from "@agentxm/client-core/unstable/plan";
import { resolveConfiguredDocs, WorkspaceMutations } from "@agentxm/client-core/unstable/workspace";
import { emitNoOpResult, emitPlanResolutionResult } from "../../json-output.js";
import { scopeFlag } from "../../cli-flags.js";
import { withRuntime, withWorkspace } from "../../runtime.js";

export const handleEnableDocs = Effect.fn("EnableDocs.handle")(function* (args: {
  readonly name: string;
  readonly yes: boolean;
  readonly force: boolean;
  readonly preview: boolean;
}) {
  const ws = yield* WorkspaceMutations;
  const renderer = yield* CliRenderer;
  const docsManager = yield* DocsManager;
  const configured = yield* ws.getConfiguredDocsEntries();
  const entry = configured[args.name];
  if (entry === undefined) {
    yield* renderer.warn(`docs package "${args.name}" is not configured`);
    return;
  }
  if (entry.enabled) {
    yield* emitNoOpResult("docs.enable", {
      planName: "Enable docs",
      message: `docs package "${args.name}" is already enabled`,
    });
    return;
  }

  const { ref, versionRange } = yield* resolveConfiguredDocs(args.name, entry.source);
  const plan: Plan = {
    _tag: "Plan",
    name: "Enable docs",
    description: Option.some(`Enable docs package ${args.name}`),
    jobs: [
      {
        concurrency: 1,
        steps: [
          buildInstallOperation(docsManager, {
            ref,
            versionRange,
          }),
        ],
      },
    ],
  };
  const resolution = yield* previewOrApplyPlan(plan, args);
  yield* emitPlanResolutionResult("docs.enable", resolution);
});

const enableConfig = {
  name: Argument.string("name").pipe(Argument.withDescription("Name of the docs package")),
  scope: scopeFlag.pipe(
    Flag.withDescription("Enable in project (default) or user-level configuration"),
  ),
  yes: yesFlag.pipe(Flag.withDescription("Enable without confirmation")),
  force: forceFlag.pipe(Flag.withDescription("Enable even if there are warnings")),
  preview: previewFlag.pipe(Flag.withDescription("Show what would change without enabling")),
} as const;

export const enableCommand = Command.make(
  "enable",
  enableConfig,
  ({ name, scope, yes, force, preview }) =>
    handleEnableDocs({ name, yes, force, preview }).pipe(
      withWorkspace(scope),
      withRuntime("docs enable"),
    ),
).pipe(
  withArgvTracking(enableConfig),
  Command.withDescription("Enable a docs package"),
  Command.withExamples([
    {
      command: "axm docs enable workspace-baseline",
      description: "Enable a configured docs package",
    },
  ]),
);
