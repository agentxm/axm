import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { Handle } from "@agentxm/extension-model/unstable/extensions/handle";
import { AuthLoginPresenter } from "./login-presenter.js";

export const LoginResultSchema = Schema.Struct({
  status: Schema.Literal("logged-in"),
  registryHost: Schema.String,
  handle: Schema.optional(Schema.String),
  /** The signed-in account's email address, when the Registry has one. */
  email: Schema.optional(Schema.String),
});

const LoginDocumentFields = {
  result: LoginResultSchema,
} satisfies Schema.Struct.Fields;
export const LoginDocumentSchema = Schema.Struct(LoginDocumentFields);
export type LoginResult = typeof LoginResultSchema.Type;
export type LoginDocument = typeof LoginDocumentSchema.Type;

/** Who a sign-in signed in as, read from the Registry once credentials are issued. */
export interface LoginIdentity {
  readonly handle: Handle;
  readonly email: string | null;
}

export const makeLoginResult = (
  registryUrl: string,
  identity: Option.Option<LoginIdentity>,
): LoginResult => {
  const registryHost = new URL(registryUrl).host;
  return Option.match(identity, {
    onNone: (): LoginResult => ({
      status: "logged-in",
      registryHost,
    }),
    onSome: ({ handle, email }): LoginResult => ({
      status: "logged-in",
      registryHost,
      handle,
      ...(email === null ? {} : { email }),
    }),
  });
};

export const emitLoginSuccess = (registryUrl: string, identity: Option.Option<LoginIdentity>) =>
  Effect.gen(function* () {
    const presenter = yield* AuthLoginPresenter;
    yield* presenter.emitLoginSuccess(makeLoginResult(registryUrl, identity));
  });
