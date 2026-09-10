import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import { AuthLoginPresenter } from "./login-presenter.js";

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

export const makeLoginResult = (
  registryUrl: string,
  handle: Option.Option<Handle>,
): LoginResult => {
  const registryHost = new URL(registryUrl).host;
  return Option.match(handle, {
    onNone: (): LoginResult => ({
      status: "logged-in",
      registryHost,
    }),
    onSome: (userHandle): LoginResult => ({
      status: "logged-in",
      registryHost,
      handle: userHandle,
    }),
  });
};

export const emitLoginSuccess = (registryUrl: string, handle: Option.Option<Handle>) =>
  Effect.gen(function* () {
    const presenter = yield* AuthLoginPresenter;
    yield* presenter.emitLoginSuccess(makeLoginResult(registryUrl, handle));
  });
