import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";

import { login, selectedRegistry } from "@agentxm/registry-auth";
import { Screen, successDoc } from "../../screen/index.js";
import { isNonInteractive, jsonFlag } from "../../cli-flags/index.js";
import { withArgvTracking } from "../../cli-runtime/index.js";
import {
  preapprovalCapabilityFlag,
  withCommandCapabilities,
  type CommandCapabilities,
} from "../shared/command-capabilities.js";
import { type SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import { PromptCancelled } from "../../prompt/prompt-cancelled.js";
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
    purpose: "Start a new sign-in without prompting when a valid session already exists",
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
    readonly wait?: boolean;
    readonly timeoutSeconds?: number;
    readonly scopes: ReadonlyArray<string>;
  }) {
    const screen = yield* Screen;
    const registry = yield* selectedRegistry;
    const machineOutput = Option.getOrElse(yield* jsonFlag, () => false);
    const nonInteractive = yield* isNonInteractive;

    const outcome = yield* withLiveOperation(
      { command: "auth.login", name: `Sign in to ${registry.host}`, mode: "apply" },
      login(
        {
          yes: options.yes,
          deviceCode: options.deviceCode,
          restart: options.restart ?? false,
          wait: options.wait ?? false,
          ...(options.timeoutSeconds === undefined
            ? {}
            : { timeoutSeconds: options.timeoutSeconds }),
          scopes: options.scopes,
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
    if (
      yield* screen.document({ result }, LoginNoOpDocumentSchema, {
        suggestions: LoginNoOpSuggestions,
      })
    ) {
      return;
    }
    yield* screen.result(
      successDoc(`Already logged in to ${result.registryHost} as ${result.handle}.`, {
        suggestions: LoginNoOpSuggestions,
      }),
    );
  },
  // A person who abandoned the replace-session question cancelled the command.
  Effect.catchTag("AuthInteractionAbandoned", (abandoned) =>
    Effect.fail(new PromptCancelled({ message: abandoned.message })),
  ),
  Effect.mapError(coerceAuthFailure),
  Effect.asVoid,
);

const loginConfig = {
  yes: preapprovalCapabilityFlag(loginCapabilities),
  deviceCode: Flag.Boolean("device-code").pipe(
    Flag.withDescription(
      "Use OAuth device-code sign-in; recommended for SSH and headless environments",
    ),
    Flag.withDefault(false),
  ),
  wait: Flag.Boolean("wait").pipe(
    Flag.withDescription("Resume and wait for a pending device sign-in"),
    Flag.withDefault(false),
  ),
  restart: Flag.Boolean("restart").pipe(
    Flag.withDescription("Replace an existing pending device sign-in intentionally"),
    Flag.withDefault(false),
  ),
  timeout: Flag.Int("timeout").pipe(
    Flag.withDescription("Maximum seconds to wait for device approval; requires --wait"),
    Flag.optional,
  ),
  scope: Flag.String("scope").pipe(
    Flag.withDescription("Registry scope to request; repeatable"),
    Flag.atLeast(0),
  ),
} as const;

export const loginCommand = Command.make(
  "login",
  loginConfig,
  ({ yes, deviceCode, wait, restart, timeout, scope }) =>
    handleLogin({
      yes,
      deviceCode,
      wait,
      restart,
      ...Option.match(timeout, {
        onNone: () => ({}),
        onSome: (timeoutSeconds) => ({ timeoutSeconds }),
      }),
      scopes: scope,
    }).pipe(withRuntime("auth login")),
).pipe(
  withArgvTracking(loginConfig),
  withCommandCapabilities(loginCapabilities),
  Command.withDescription("Sign in to a registry"),
  Command.withExamples([
    { command: "axm login", description: "Sign in with a local browser" },
    { command: "axm login --device-code", description: "Sign in from SSH or a headless machine" },
    { command: "axm login --wait", description: "Resume a pending device sign-in" },
    {
      command: "axm login --wait --timeout 300",
      description: "Wait up to 300 seconds for a pending device sign-in",
    },
  ]),
);
