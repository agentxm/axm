import { withParameterDefault, withParameterDescription } from "../../cli-parameters.js";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/cli";
import { TestHook } from "@agentxm/workspace-features/authoring";
import { HookTestResultSchema, observeUnit } from "@agentxm/workspace-kernel/operations";
import { withLiveOperation } from "../../operation-lifecycle.js";
import { withRuntime, withWorkspace } from "../../runtime.js";
import { withArgvTracking, processOutcome } from "../../cli-runtime/index.js";
import { failureToAppError } from "../../app-error/conversions.js";
import { emitResult, headlineDoc, tableDoc } from "../../screen/index.js";
import { scopeFlag } from "../../cli-flags/scope-flag.js";
import {
  directWriteCapabilities,
  withCommandCapabilities,
} from "../shared/command-capabilities.js";
import { parseHookConfiguration } from "./configuration-input.js";

export const handleHookTest = Effect.fn("Hooks.test")(function* (args: {
  readonly directory: string;
  readonly configuration: string;
  readonly fixture: ReadonlyArray<string>;
}) {
  const configuration = yield* parseHookConfiguration(args.configuration);
  const result = yield* withLiveOperation(
    { command: "hooks.test", name: "Test hook extension fixtures", mode: "apply" },
    observeUnit(
      { id: "fixtures", label: "declared hook extension fixtures" },
      TestHook.run({
        directory: args.directory,
        configuration,
        ...(args.fixture.length === 0 ? {} : { fixtures: args.fixture }),
      }).pipe(Effect.mapError(failureToAppError)),
    ),
  );
  yield* emitResult(
    result,
    HookTestResultSchema,
    () => [
      ...headlineDoc(
        result.passed ? "ok" : "error",
        result.passed ? "Hook extension fixtures passed" : "Hook extension fixtures failed",
      ),
      ...tableDoc(
        result.fixtures,
        [
          { header: "Fixture", value: (row) => row.fixture },
          { header: "Protocol", value: (row) => row.protocol },
          { header: "Result", value: (row) => row.outcome },
          { header: "Detail", value: (row) => row.detail },
        ],
        { caption: "Explicit package execution; native host invocation was not observed" },
      ),
    ],
    { ok: result.passed },
  );
  return processOutcome(result.passed ? 0 : 1);
});
const config = {
  directory: Argument.String("directory").pipe(
    withParameterDescription(
      "Hook extension directory containing hook.json; executes package code",
    ),
  ),
  configuration: Flag.String("configuration").pipe(
    withParameterDefault("{}"),
    withParameterDescription(
      "Test consumer values as a JSON object; {env: NAME} references a secret",
    ),
  ),
  fixture: Flag.String("fixture").pipe(
    Flag.atLeast(0),
    withParameterDescription("Run only named fixtures"),
  ),
  scope: scopeFlag,
} as const;
export const testCommand = Command.make("test", config, (args) =>
  handleHookTest(args).pipe(
    withWorkspace({ scope: args.scope, allowUninitialized: true }),
    withRuntime("hooks test"),
  ),
).pipe(
  withArgvTracking(config),
  withCommandCapabilities(directWriteCapabilities("workspace")),
  Command.withDescription(
    "Execute declared fixtures and record evidence; execution is not sandboxed",
  ),
  Command.withShortDescription("Run hook extension fixtures without a sandbox"),
  Command.withExamples([
    {
      command: "axm hooks test hooks/tool-audit",
      description: "Execute a package's declared fixtures",
    },
  ]),
);
