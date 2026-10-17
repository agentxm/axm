import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import { defineSpecification } from "@agentxm/specification-metadata";
import {
  AuthClient,
  AuthLoginPresenter,
  AuthInteractionAbandoned,
  DeviceLoginDenied,
  PendingDeviceLoginStore,
} from "@agentxm/registry-access/authentication";
import { CredentialStore, credentialKey } from "@agentxm/registry-access/credentials";
import { decodeHttpRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { Screen, OutputWriteFailed } from "../../screen/index.js";
import { makeLoginSpecContext, LOGIN_REGISTRY_URL } from "../../test-support/login-harness.js";
import { writeExpectedCliError } from "../../cli-runtime/runtime-envelope.js";
import { handleLogin } from "./login.js";

export const specification = defineSpecification({
  requirement: "cli/login/settles-before-terminal-result",
  title: "Login settles and drains progress before delivering its terminal result",
  statement:
    "For retained sessions, successful approval, pending initiation, elapsed or stopped waits, and terminal authorization failures, login shall settle its operation and drain its progress before invoking its single terminal result writer.",
  class: "functional",
  role: "experience",
  goals: ["machine-automation", "actionable-diagnostics"],
  methods: ["example"],
  derivedFrom: ["apps/cli/src/root/auth/login.ts", "apps/cli/src/operation-lifecycle.ts"],
  supersedes: [],
  assumptions: [
    "The Screen service records writer invocation; independent OS pipe scheduling is not an ordering assertion.",
  ],
  openQuestions: [],
});

describe("Login terminal delivery", () => {
  for (const scenario of [
    "retained",
    "approved",
    "pending",
    "elapsed",
    "stopped",
    "denied",
  ] as const) {
    it.effect(`delivers exactly once after settlement for ${scenario}`, () => {
      const context = makeLoginSpecContext({
        machine: true,
        validSession: scenario === "retained",
      });
      return Effect.gen(function* () {
        const screen = yield* Screen;
        const auth = yield* AuthClient;
        const presenter = yield* AuthLoginPresenter;
        const writes: Array<number> = [];
        const beforeWrite = Effect.sync(() => {
          const events = context.rendererState.events;
          expect(events.at(-1)?._tag).toBe("OperationSettled");
          writes.push(events.length);
        });
        const recordingScreen = {
          ...screen,
          document: (data, schema, options) =>
            beforeWrite.pipe(Effect.andThen(screen.document(data, schema, options))),
          result: (doc) => beforeWrite.pipe(Effect.andThen(screen.result(doc))),
        } satisfies typeof Screen.Service;
        const invocation = handleLogin({
          yes: false,
          deviceCode: true,
          ...(scenario === "pending" || scenario === "retained" ? {} : { waitForHumanSeconds: 1 }),
        }).pipe(
          Effect.provideService(AuthClient, {
            ...auth,
            pollDeviceToken:
              scenario === "elapsed"
                ? () => Effect.never
                : scenario === "denied"
                  ? () => Effect.fail(new DeviceLoginDenied())
                  : auth.pollDeviceToken,
          }),
          Effect.provideService(
            AuthLoginPresenter,
            scenario === "stopped"
              ? {
                  ...presenter,
                  awaitHuman: () =>
                    Effect.fail(new AuthInteractionAbandoned({ message: "Stopped waiting." })),
                }
              : presenter,
          ),
          Effect.catchTag("AppError", (error) => writeExpectedCliError(error, "json")),
          Effect.provideService(Screen, recordingScreen),
        );
        if (scenario === "elapsed") {
          const waiting = yield* invocation.pipe(Effect.forkChild);
          yield* TestClock.adjust("2 seconds");
          yield* Fiber.join(waiting);
        } else {
          yield* invocation;
        }
        expect(writes).toEqual([context.rendererState.events.length]);
        expect(
          context.rendererState.events.filter((event) => event._tag === "OperationSettled"),
        ).toHaveLength(1);
      }).pipe(context.provide);
    });
  }
  for (const approved of [false, true]) {
    it.effect(
      `preserves authorization state when terminal delivery fails (approved=${String(approved)})`,
      () => {
        const context = makeLoginSpecContext({ machine: true });
        return Effect.gen(function* () {
          const screen = yield* Screen;
          const cause = new OutputWriteFailed({ channel: "stdout", reason: "EPIPE" });
          const failure = yield* handleLogin({
            yes: false,
            deviceCode: true,
            ...(approved ? { waitForHumanSeconds: 1 } : {}),
          }).pipe(
            Effect.provideService(Screen, { ...screen, document: () => Effect.fail(cause) }),
            Effect.flip,
          );
          expect(failure).toBe(cause);
          expect(context.rendererState.events.at(-1)?._tag).toBe("OperationSettled");
          const credentials = yield* (yield* CredentialStore).load(
            credentialKey(decodeHttpRegistryEndpointSync(LOGIN_REGISTRY_URL)),
          );
          const pending = yield* (yield* PendingDeviceLoginStore).load();
          expect(Option.isSome(credentials)).toBe(approved);
          expect(Option.isSome(pending)).toBe(!approved);
        }).pipe(context.provide);
      },
    );
  }
});
