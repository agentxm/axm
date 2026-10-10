import { withParameterDefault, withParameterDescription } from "../../cli-parameters.js";
import { registryFlag } from "../../cli-flags/index.js";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/cli";

import { login, selectedRegistry } from "@agentxm/registry-access/authentication";
import { emitResult, Screen, successDoc } from "../../screen/index.js";
import { jsonFlag } from "../../cli-flags/index.js";
import { waitForHumanOption } from "./wait-for-human.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import {
  preapprovalCapabilityFlag,
  withCommandCapabilities,
  type CommandCapabilities,
} from "../shared/command-capabilities.js";
import { type SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { QuestionCancelled } from "../../screen/index.js";
import { coerceAuthFailure } from "../../feature-errors.js";
import { withRuntime } from "../../runtime.js";
import { withLiveOperation } from "../../operation-lifecycle.js";

export const LoginNoOpResultSchema = Schema.Struct({
  status: Schema.Literal("already-logged-in"),
  registryHost: Schema.String,
  handle: Schema.String,
});

const LoginNoOpDocumentFields = {
  result: LoginNoOpResultSchema,
} satisfies Schema.Struct.Fields;
export const LoginNoOpDocumentSchema = Schema.Struct(LoginNoOpDocumentFields);
export type LoginNoOpResult = typeof LoginNoOpResultSchema.Type;
export type LoginNoOpDocument = typeof LoginNoOpDocumentSchema.Type;

const LoginNoOpSuggestions = [
  { description: "Check active account", cmd: "axm whoami" },
  { description: "Log out", cmd: "axm logout" },
  { description: "Sign in again with a different account", cmd: "axm login --yes" },
] satisfies ReadonlyArray<SuggestedAction>;

/**
 * Login writes credentials directly; the one confirmation it can approve in
 * advance is replacing a session that is still valid.
 */
const loginCapabilities = {
  preview: false,
  preapproval: {
    purpose: "starting a new sign-in when a valid session already exists",
  },
  trust: [],
  inputs: "explicit-or-documented-defaults",
  effect: "credentials",
} satisfies CommandCapabilities;

export const handleLogin = Effect.fn("AuthLogin.handle")(
  function* (options: {
    readonly yes: boolean;
    readonly deviceCode: boolean;
    readonly restart?: boolean;
    readonly waitForHumanSeconds?: number;
  }) {
    const registry = yield* selectedRegistry;
    const machineOutput = Option.getOrElse(yield* jsonFlag, () => false);
    const nonInteractive = !(yield* (yield* Screen).canAsk);

    const outcome = yield* withLiveOperation(
      { command: "auth.login", name: `Sign in to ${registry.host}`, mode: "apply" },
      login(
        {
          yes: options.yes,
          deviceCode: options.deviceCode,
          restart: options.restart ?? false,
          ...(options.waitForHumanSeconds === undefined
            ? {}
            : { waitForHumanSeconds: options.waitForHumanSeconds }),
          nonInteractive,
          machineOutput,
        },
        registry.url,
      ),
    );

    if (outcome._tag !== "SessionRetained") return;
    const result: LoginNoOpResult = {
      status: "already-logged-in",
      registryHost: outcome.registryHost,
      handle: outcome.handle,
    };
    yield* emitResult(
      { result },
      LoginNoOpDocumentSchema,
      () =>
        successDoc(`Already logged in to ${result.registryHost} as ${result.handle}.`, {
          suggestions: LoginNoOpSuggestions,
        }),
      {
        suggestions: LoginNoOpSuggestions,
      },
    );
  },
  // A person who abandoned the replace-session question cancelled the command.
  Effect.catchTag("AuthInteractionAbandoned", (abandoned) =>
    Effect.fail(new QuestionCancelled({ message: abandoned.message })),
  ),
  Effect.mapError(coerceAuthFailure),
  Effect.asVoid,
);

const loginConfig = {
  registry: registryFlag,
  yes: preapprovalCapabilityFlag(loginCapabilities),
  deviceCode: Flag.Boolean("device-code").pipe(
    withParameterDescription("Sign in with a code; recommended for SSH and headless environments"),
    withParameterDefault(false),
  ),
  waitForHuman: waitForHumanOption,
  restart: Flag.Boolean("restart").pipe(
    withParameterDescription(
      "Replace an existing pending device sign-in intentionally; only with --device-code",
    ),
    withParameterDefault(false),
  ),
} as const;

export const loginCommand = Command.make(
  "login",
  loginConfig,
  ({ yes, deviceCode, waitForHuman, restart, registry }) =>
    handleLogin({
      yes,
      deviceCode,
      restart,
      ...Option.match(waitForHuman, {
        onNone: () => ({}),
        onSome: (waitForHumanSeconds) => ({ waitForHumanSeconds }),
      }),
    }).pipe(withRuntime("auth login", { registry })),
).pipe(
  withArgvTracking(loginConfig),
  withCommandCapabilities(loginCapabilities),
  Command.withDescription("Sign in to a registry"),
  Command.withExamples([
    { command: "axm login", description: "Sign in with a local browser" },
    { command: "axm login --device-code", description: "Sign in from SSH or a headless machine" },
    {
      command: "axm login --device-code --wait-for-human 300 --json",
      description: "Start or resume sign-in with a code and wait up to 300 seconds",
    },
  ]),
);
