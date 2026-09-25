/**
 * Unit tests for the renderer-backed auth login presenter.
 *
 * Owns the wording, suggestion-set, spinner-label, and machine-document
 * coverage relocated from the auth feature tests.
 */

import { describe, expect, it } from "@effect/vitest";
import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  AuthLoginPresenter,
  DeviceLoginInteraction,
  type DeviceLoginPendingResult,
  type HumanHandoff,
} from "@agentxm/registry-access/authentication";
import {
  TestMachineRenderer,
  TestRenderer,
  logsByTag,
  startedUnits,
} from "./test-support/presenter-test.js";
import { withLiveOperation } from "./operation-lifecycle.js";
import { AuthLoginPresenterLive } from "./auth-login-presenter.js";
import { OutputWriteFailed, Screen } from "./screen/index.js";

const pendingResult: DeviceLoginPendingResult = {
  status: "pending-human",
  blockedOn: "human",
  retryable: true,
  flow: "started",
  registryHost: "registry.agentxm.ai",
  verificationUri: "https://auth.agentxm.ai/device",
  verificationUriComplete: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
  userCode: "ABCD-1234",
  expiresAt: "2099-01-01T00:00:00.000Z",
  interval: 5,
  resume: "axm login --device-code --wait-for-human 300 --json",
  action: {
    kind: "open-url",
    purpose: "login",
    requestRef: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
    registryUrl: "https://registry.agentxm.ai",
    intervalSeconds: 5,
    url: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
    fallbackUrl: "https://auth.agentxm.ai/device",
    code: "ABCD-1234",
    expiresAt: "2099-01-01T00:00:00.000Z",
    resume: "axm login --device-code --wait-for-human 300 --json",
  },
};

const pendingSuggestions = [
  {
    description: "Open the AXM device authorization page",
    url: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
  },
  {
    description: "Open the clean fallback page and enter the code",
    url: "https://auth.agentxm.ai/device",
  },
  {
    description: "Resume after approval",
    cmd: "axm login --device-code --wait-for-human 300 --json",
  },
];

const deviceHandoff = {
  _tag: "DeviceLogin",
  registryHost: "registry.agentxm.ai",
  verificationUriComplete: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
  verificationUri: "https://auth.agentxm.ai/device",
  userCode: "ABCD-1234",
  expiresAtMs: Date.parse("2099-01-01T00:00:00.000Z"),
  browserOpened: true,
  copiedToClipboard: true,
} as const satisfies HumanHandoff;

const loopbackHandoff = {
  _tag: "LoopbackLogin",
  registryHost: "registry.agentxm.ai",
  authorizeUrl: "https://agentxm.ai/oauth/authorize?state=s1",
  redirectUri: "http://127.0.0.1:3999/callback",
  expiresAtMs: Date.parse("2099-01-01T00:00:00.000Z"),
  browserOpened: true,
} as const satisfies HumanHandoff;

const noInteraction = {
  openBrowser: () => Effect.succeed(false),
  copyToClipboard: () => Effect.succeed(false),
};

const loginSuccessSuggestions = [
  { description: "Check active account", cmd: "axm whoami" },
  {
    description: "Create an API token in web settings",
    url: "https://agentxm.ai/u/settings/tokens",
  },
];

const makeHuman = () => {
  const renderer = TestRenderer.make();
  const dependencies = Layer.merge(
    renderer.layer,
    Layer.succeed(DeviceLoginInteraction, noInteraction),
  );
  return {
    layer: Layer.provideMerge(AuthLoginPresenterLive, dependencies),
    state: renderer.state,
    logs: logsByTag(renderer.state),
  };
};

const makeMachine = () => {
  const renderer = TestMachineRenderer.make();
  const dependencies = Layer.merge(
    renderer.layer,
    Layer.succeed(DeviceLoginInteraction, noInteraction),
  );
  return {
    layer: Layer.provide(AuthLoginPresenterLive, dependencies),
    state: renderer.state,
    logs: logsByTag(renderer.state),
  };
};

describe("AuthLoginPresenterLive", () => {
  it.effect("propagates a failed pending document as a registry-access failure", () =>
    Effect.gen(function* () {
      const renderer = TestMachineRenderer.make();
      const screen = yield* Screen.pipe(Effect.provide(renderer.layer));
      const cause = new OutputWriteFailed({ channel: "stdout", reason: "EPIPE" });
      const dependencies = Layer.merge(
        Layer.succeed(Screen, { ...screen, document: () => Effect.fail(cause) }),
        Layer.succeed(DeviceLoginInteraction, noInteraction),
      );
      const failure = yield* Effect.gen(function* () {
        const presenter = yield* AuthLoginPresenter;
        return yield* presenter.tryEmitPendingDeviceLogin(pendingResult);
      }).pipe(Effect.provide(Layer.provide(AuthLoginPresenterLive, dependencies)), Effect.flip);
      expect(failure).toMatchObject({ _tag: "RegistryAccessFailed", category: "internal", cause });
    }),
  );

  it.effect("distinguishes failed session-replacement output from prompt cancellation", () =>
    Effect.gen(function* () {
      const renderer = TestRenderer.make();
      const screen = yield* Screen.pipe(Effect.provide(renderer.layer));
      const cause = new OutputWriteFailed({ channel: "stderr", reason: "EPIPE" });
      const dependencies = Layer.merge(
        Layer.succeed(Screen, { ...screen, ask: () => Effect.fail(cause) }),
        Layer.succeed(DeviceLoginInteraction, noInteraction),
      );
      const failure = yield* Effect.gen(function* () {
        const presenter = yield* AuthLoginPresenter;
        return yield* presenter.confirmSessionReplacement();
      }).pipe(Effect.provide(Layer.provide(AuthLoginPresenterLive, dependencies)), Effect.flip);
      expect(failure).toMatchObject({ _tag: "RegistryAccessFailed", category: "internal", cause });
    }),
  );
  it.effect("keeps unavailable interaction configuration distinct from cancellation", () =>
    Effect.gen(function* () {
      const renderer = TestRenderer.make();
      const screen = yield* Screen.pipe(Effect.provide(renderer.layer));
      const sourceError = new ConfigProvider.SourceError({ message: "private source detail" });
      const configError = yield* Config.String("CI").pipe(
        Effect.provide(ConfigProvider.layer(ConfigProvider.make(() => Effect.fail(sourceError)))),
        Effect.flip,
      );
      const dependencies = Layer.merge(
        Layer.succeed(Screen, {
          ...screen,
          ask: () => Effect.fail(configError),
          wait: () => Effect.fail(configError),
        }),
        Layer.succeed(DeviceLoginInteraction, noInteraction),
      );
      yield* Effect.gen(function* () {
        const presenter = yield* AuthLoginPresenter;
        for (const effect of [
          presenter.confirmSessionReplacement().pipe(Effect.asVoid),
          presenter.awaitHuman(deviceHandoff, Effect.void),
        ]) {
          const failure = yield* Effect.flip(effect);
          expect(failure).toMatchObject({
            _tag: "RegistryAccessFailed",
            category: "internal",
            cause: configError,
          });
          if (failure._tag === "RegistryAccessFailed")
            expect(failure.detail).not.toContain(sourceError.message);
        }
      }).pipe(Effect.provide(Layer.provide(AuthLoginPresenterLive, dependencies)));
    }),
  );
  it.effect("parks on the device handoff with its code, both links, and its warnings", () => {
    const { layer, state, logs } = makeHuman();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      const settled = yield* presenter.awaitHuman(deviceHandoff, Effect.succeed("approved"));

      expect(settled).toBe("approved");
      expect(logs.info).toEqual([
        "Sign in to AgentXM.ai with a one-time code.",
        "One-time code: ABCD-1234",
        "The code was copied to your clipboard.",
        "Only continue if you started this sign-in with AXM.",
        "Never enter a code that another person or website gave you. If that happened, cancel.",
      ]);
      // Both pages travel as suggestions, so an agent reaches what a person does.
      expect(state.suggestions).toEqual([
        {
          description: "Open the AXM device authorization page",
          url: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
        },
        {
          description: "Open the clean fallback page and enter the code",
          url: "https://auth.agentxm.ai/device",
        },
      ]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("omits the clipboard line when that side effect did not happen", () => {
    const { layer, logs } = makeHuman();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      yield* presenter.awaitHuman(
        { ...deviceHandoff, browserOpened: false, copiedToClipboard: false },
        Effect.void,
      );

      expect(logs.info).not.toContain("The code was copied to your clipboard.");
      expect(logs.info).toContain("Only continue if you started this sign-in with AXM.");
    }).pipe(Effect.provide(layer));
  });

  it.effect("parks the unit the handoff names, and releases it when the wait ends", () => {
    const { layer, state } = makeHuman();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      yield* withLiveOperation(
        { command: "auth.login", name: "Sign in", mode: "apply" },
        presenter.awaitHuman(deviceHandoff, Effect.void),
      );

      const waiting = state.events.filter(
        (event) => event._tag === "Waiting" || event._tag === "WaitEnded",
      );
      expect(waiting).toMatchObject([
        { _tag: "Waiting", subject: "device-authorization" },
        { _tag: "WaitEnded", subject: "device-authorization" },
      ]);
      expect(startedUnits(state)).toEqual(["Device sign-in"]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("emits the pending document with suggestions in machine mode", () => {
    const { layer, state, logs } = makeMachine();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      const consumed = yield* presenter.tryEmitPendingDeviceLogin(pendingResult);

      expect(consumed).toBe(true);
      expect(state.results[0]?.data).toEqual({ result: pendingResult });
      expect(state.suggestions).toEqual(pendingSuggestions);
      expect(logs.info).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("does not consume the pending document in human mode", () => {
    const { layer, state } = makeHuman();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      const consumed = yield* presenter.tryEmitPendingDeviceLogin(pendingResult);

      expect(consumed).toBe(false);
      expect(state.suggestions).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("presents pending approval with resume suggestions", () => {
    const { layer, state, logs } = makeHuman();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      yield* presenter.notePendingApproval(pendingResult);

      expect(logs.success).toEqual([]);
      // The guidance offers the two pages; the outcome adds only the resume.
      expect(state.suggestions).toEqual(pendingSuggestions);
      expect(logs.info).toContain("One-time code: ABCD-1234");
    }).pipe(Effect.provide(layer));
  });

  it.effect("emits the structured login document in machine mode", () => {
    const { layer, state, logs } = makeMachine();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      yield* presenter.emitLoginSuccess({
        status: "logged-in",
        registryHost: "registry.agentxm.ai",
        handle: "@alice",
      });

      expect(state.results[0]?.data).toEqual({
        result: {
          status: "logged-in",
          registryHost: "registry.agentxm.ai",
          handle: "@alice",
        },
      });
      expect(state.suggestions).toEqual(loginSuccessSuggestions);
      expect(logs.success).toEqual([]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("reports login success with and without a handle in human mode", () => {
    const { layer, state, logs } = makeHuman();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      yield* presenter.emitLoginSuccess({
        status: "logged-in",
        registryHost: "registry.agentxm.ai",
        handle: "@alice",
      });
      yield* presenter.emitLoginSuccess({
        status: "logged-in",
        registryHost: "registry.agentxm.ai",
      });

      expect(logs.success).toEqual([
        "Logged in to registry.agentxm.ai as @alice.",
        "Logged in to registry.agentxm.ai.",
      ]);
      expect(state.suggestions).toEqual([...loginSuccessSuggestions, ...loginSuccessSuggestions]);
    }).pipe(Effect.provide(layer));
  });

  it.effect("publishes each sign-in phase as one lifecycle unit", () => {
    const { layer, state } = makeHuman();
    const registryHost = "registry.agentxm.ai";

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      yield* withLiveOperation(
        { command: "auth.login", name: "Sign in", mode: "apply" },
        Effect.gen(function* () {
          yield* presenter.withProgress(
            { _tag: "StartingDeviceAuthorization", registryHost },
            () => Effect.void,
          );
          yield* presenter.withProgress(
            { _tag: "SavingCredentials", registryHost },
            () => Effect.void,
          );
          yield* presenter.withProgress(
            { _tag: "CompletingSignIn", registryHost },
            () => Effect.void,
          );
        }),
      );

      expect(startedUnits(state)).toEqual([
        "device authorization on registry.agentxm.ai",
        "credentials for registry.agentxm.ai",
        "sign-in to registry.agentxm.ai",
      ]);
      expect(state.events.at(-1)).toMatchObject({ _tag: "OperationSettled", outcome: "completed" });
    }).pipe(Effect.provide(layer));
  });

  it.effect("parks on the loopback handoff, naming the browser that was opened", () => {
    const { layer, state, logs } = makeHuman();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      yield* presenter.awaitHuman(loopbackHandoff, Effect.void);

      expect(logs.info).toEqual([
        "Authorize AXM in the browser that just opened.",
        "Sign-in returns to http://127.0.0.1:3999/callback. On a remote or headless machine, run `axm login --device-code`.",
      ]);
      expect(state.suggestions).toEqual([
        { description: "Authorize AXM", url: "https://agentxm.ai/oauth/authorize?state=s1" },
      ]);
    }).pipe(Effect.provide(layer));
  });
  it.effect("names a browser a person must open themselves", () => {
    const { layer, logs } = makeHuman();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      yield* presenter.awaitHuman({ ...loopbackHandoff, browserOpened: false }, Effect.void);

      expect(logs.info[0]).toBe("Authorize AXM in a browser.");
    }).pipe(Effect.provide(layer));
  });

  it.effect("parks publish authorization on the shared human wait", () => {
    const { layer, state, logs } = makeHuman();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      yield* presenter.awaitHuman(
        {
          _tag: "PublishAuthorization",
          candidateCount: 2,
          authorizationUrl: "https://agentxm.ai/publish/authorize/pubreq_2",
          expiresAtMs: Date.now() + 60_000,
        },
        Effect.void,
      );

      expect(logs.info).toContain("Review 2 publish candidates in the browser.");
      expect(state.suggestions).toEqual([]);
    }).pipe(Effect.provide(layer));
  });
});
