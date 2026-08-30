import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { CliRenderer } from "../cli-renderer/index.js";
import type { SuggestedAction } from "@agentxm/registry-protocol/unstable/suggested-action";
import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";

export const LoginResultSchema = Schema.Struct({
  status: Schema.Literal("logged-in"),
  registryHost: Schema.String,
  handle: Schema.optional(Schema.String),
});

const LoginDocumentFields = {
  result: LoginResultSchema,
} satisfies Schema.Struct.Fields;
export const LoginDocumentSchema = Schema.Struct(LoginDocumentFields);
export type LoginResult = typeof LoginResultSchema.Type;
export type LoginDocument = typeof LoginDocumentSchema.Type;

const LoginSuccessSuggestions = [
  { description: "Check active account", cmd: "axm whoami" },
  { description: "Create an API token", cmd: "axm token create --name <name>" },
] satisfies ReadonlyArray<SuggestedAction>;

export const emitLoginSuccess = (registryUrl: string, handle: Option.Option<Handle>) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const registryHost = new URL(registryUrl).host;
    const result: LoginResult = Option.match(handle, {
      onNone: () => ({
        status: "logged-in",
        registryHost,
      }),
      onSome: (userHandle) => ({
        status: "logged-in",
        registryHost,
        handle: userHandle,
      }),
    });

    if (
      yield* renderer.result({ result }, LoginDocumentSchema, {
        suggestions: LoginSuccessSuggestions,
      })
    ) {
      return;
    }

    yield* Option.match(handle, {
      onNone: () =>
        renderer.success(`Logged in to ${registryHost}.`, {
          suggestions: LoginSuccessSuggestions,
        }),
      onSome: (userHandle) =>
        renderer.success(`Logged in to ${registryHost} as ${userHandle}.`, {
          suggestions: LoginSuccessSuggestions,
        }),
    });
  });
