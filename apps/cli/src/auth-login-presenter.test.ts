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
import { OutputWriteFailed, Screen, paragraphDoc } from "./screen/index.js";
import { waitDoc } from "./screen/wait/view.js";
import { deviceCodeFallbackNote, handoffWaitView } from "./root/auth/view.js";

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

const signInPage = {
  description: "Open the sign-in page",
  url: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
};

const codeEntryPage = {
  description: "Or open the sign-in page without the code and enter it",
  url: "https://auth.agentxm.ai/device",
};

const waitForSignIn = {
  description: "Wait for the sign-in to finish",
  cmd: "axm login --device-code --wait-for-human 300 --json",
};

const pendingSuggestions = [signInPage, codeEntryPage, waitForSignIn];

/** The brief a terminal sign-in prints once, as a person reads it. */
const terminalSignInBrief = [
  "To sign in, open this link in a browser:",
  "https://auth.agentxm.ai/device?user_code=ABCD-1234",
  "Make sure it shows the code ABCD-1234.",
];

const deviceHandoff = {
  _tag: "DeviceLogin",
  registryHost: "registry.agentxm.ai",
  verificationUriComplete: "https://auth.agentxm.ai/device?user_code=ABCD-1234",
  verificationUri: "https://auth.agentxm.ai/device",
  userCode: "ABCD-1234",
  expiresAtMs: Date.parse("2099-01-01T00:00:00.000Z"),
  browserOpened: true,
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
  const copied: Array<string> = [];
  const dependencies = Layer.merge(
    renderer.layer,
    Layer.succeed(DeviceLoginInteraction, {
      ...noInteraction,
      copyToClipboard: (text) =>
        Effect.sync(() => {
          copied.push(text);
          return true;
        }),
    }),
  );
  return {
    layer: Layer.provideMerge(AuthLoginPresenterLive, dependencies),
    state: renderer.state,
    logs: logsByTag(renderer.state),
    copied,
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
  it.effect("asks a person to open the link and check the code, as the browser does", () => {
    const { layer, state, logs } = makeHuman();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      const settled = yield* presenter.awaitHuman(deviceHandoff, Effect.succeed("approved"));

      expect(settled).toBe("approved");
      expect(logs.info).toEqual(terminalSignInBrief);
      // The link a person opens stands on its own line; the clean page for
      // typing the code by hand is the one action that follows.
      expect(state.suggestions).toEqual([codeEntryPage]);
    }).pipe(Effect.provide(layer));
  });

  it("sets the link apart and shows the code in bold", () => {
    const view = handoffWaitView(deviceHandoff);
    expect(view.brief).toEqual([
      { _tag: "paragraph", text: "To sign in, open this link in a browser:" },
      { _tag: "blank" },
      {
        _tag: "paragraph",
        inset: true,
        text: [{ text: "https://auth.agentxm.ai/device?user_code=ABCD-1234", copyable: true }],
      },
      { _tag: "blank" },
      {
        _tag: "paragraph",
        text: [
          { text: "Make sure it shows the code " },
          { text: "ABCD-1234", bold: true },
          { text: "." },
        ],
      },
      { _tag: "blank" },
      { _tag: "next", actions: [codeEntryPage] },
    ]);
  });

  it("says it is waiting for the person to sign in, and how long the code has left", () => {
    const view = handoffWaitView(deviceHandoff);
    expect(view.status).toBe("Waiting for you to sign in");
    expect(view.label).toBe("Terminal sign-in");
    expect(
      waitDoc(view, { open: true, copy: true }, { nowMs: deviceHandoff.expiresAtMs - 292_000 }),
    ).toEqual([
      {
        _tag: "wait",
        status: "Waiting for you to sign in",
        remaining: "4:52 left",
        chips: [
          { key: "o", word: "open" },
          { key: "c", word: "copy" },
          { key: "esc", word: "stop" },
        ],
      },
    ]);
  });

  it.effect("copies the pre-filled link, not the code, only when the person asks", () => {
    const { layer, state, copied } = makeHuman();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      yield* presenter.awaitHuman(deviceHandoff, Effect.void);
      expect(copied).toEqual([]);

      state.waitScript.actions.push(["copy"]);
      yield* presenter.awaitHuman(deviceHandoff, Effect.void);
      expect(copied).toEqual(["https://auth.agentxm.ai/device?user_code=ABCD-1234"]);
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
      expect(startedUnits(state)).toEqual(["Terminal sign-in"]);
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
      // The guidance offers the page for typing the code; the outcome adds
      // only the command that keeps waiting.
      expect(state.suggestions).toEqual([codeEntryPage, waitForSignIn]);
      expect(logs.info).toEqual(terminalSignInBrief);
      expect(logs.warn).toEqual(["Sign-in is waiting for you in the browser."]);
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

  it.effect("emits the signed-in account's email in the machine login document", () => {
    const { layer, state } = makeMachine();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      yield* presenter.emitLoginSuccess({
        status: "logged-in",
        registryHost: "registry.agentxm.ai",
        handle: "@alice",
        email: "alice@example.test",
      });

      expect(state.results[0]?.data).toEqual({
        result: {
          status: "logged-in",
          registryHost: "registry.agentxm.ai",
          handle: "@alice",
          email: "alice@example.test",
        },
      });
    }).pipe(Effect.provide(layer));
  });

  it.effect("names the account by email, else by handle, else not at all", () => {
    const { layer, state, logs } = makeHuman();

    return Effect.gen(function* () {
      const presenter = yield* AuthLoginPresenter;
      yield* presenter.emitLoginSuccess({
        status: "logged-in",
        registryHost: "registry.agentxm.ai",
        handle: "@alice",
        email: "alice@example.test",
      });
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
        "Signed in to registry.agentxm.ai as alice@example.test",
        "Signed in to registry.agentxm.ai as @alice",
        "Signed in to registry.agentxm.ai",
      ]);
      expect(state.suggestions).toEqual([
        ...loginSuccessSuggestions,
        ...loginSuccessSuggestions,
        ...loginSuccessSuggestions,
      ]);
    }).pipe(Effect.provide(layer));
  });

  it("says why sign-in uses a code", () => {
    expect(deviceCodeFallbackNote("remote-or-headless").doc).toEqual(
      paragraphDoc("This environment appears to be remote or headless; signing in with a code."),
    );
    expect(deviceCodeFallbackNote("loopback-bind-failed").doc).toEqual(
      paragraphDoc("Could not start a local callback server; signing in with a code instead."),
    );
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
        "sign-in code from registry.agentxm.ai",
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
