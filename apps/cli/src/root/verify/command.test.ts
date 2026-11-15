import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";
import { afterEach } from "vitest";

import { normalizeHandle } from "@agentxm/extension-model/unstable/extensions";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { CredentialStoreTest } from "@agentxm/registry-access/testing";
import { RegistryRequestFailed } from "@agentxm/registry-client";
import {
  makeFileRegistry,
  makeRecordedRegistryTransport,
  RegistryContextTest,
} from "@agentxm/registry-client/testing";
import { ReleaseVerificationDocumentSchema } from "@agentxm/workspace-features/publishing";

import { ExecutionDirectory } from "../../execution-directory.js";
import { makeCliTestContext } from "../../test-support/test-helpers.js";
import { handleVerify, selectReleaseVerification } from "./command.js";

const isDocument = Schema.is(ReleaseVerificationDocumentSchema);

/** The emitted result, which the machine renderer records as the in-memory document. */
const decodeDocument = (data: unknown) => {
  if (!isDocument(data)) throw new Error("Expected one release verification document");
  return data;
};

/** The handler's input for exact references, through the same pre-runtime selector. */
const referencesOf = (...extension: ReadonlyArray<string>) =>
  selectReleaseVerification({
    extension,
    integrity: Option.none(),
    publishResult: Option.none(),
  });

/** A Registry that returns no metadata for any selected extension. */
const unavailableRegistry = () =>
  makeRecordedRegistryTransport(({ body }) => {
    const items = Schema.decodeUnknownSync(
      Schema.Struct({ items: Schema.Array(Schema.Struct({ key: Schema.String })) }),
    )(body).items;
    return {
      body: {
        schemaVersion: 2,
        purpose: "select",
        selectionPolicyVersion: "1",
        observedAt: "2026-11-14T10:00:00Z",
        results: items.map(({ key }) => ({ key, outcome: "unavailable" })),
      },
    };
  });

/** A credential store signed in to the test context's default HTTP Registry. */
const signedInStore = CredentialStoreTest("restricted-file", {
  version: 1,
  registries: {
    "https://registry.example.com": {
      accounts: {
        [normalizeHandle("@alice")]: {
          access_token: "axm_ses_verify_fixture",
          refresh_token: "axm_ref_verify_fixture",
          expires_at: DateTime.makeUnsafe("2099-01-01"),
          active: true,
        },
      },
    },
  },
});

const settledOutcomes = (events: ReadonlyArray<{ readonly _tag: string }>) =>
  events.flatMap((event) =>
    event._tag === "OperationSettled" && "outcome" in event ? [event.outcome] : [],
  );

describe("axm verify handler", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("completes a positive verification with exit 0 and the declared result", () => {
    const registry = makeFileRegistry();
    cleanups.push(registry.cleanup);
    registry.writeSkill("review", [{ version: "1.2.0", body: "Review." }]);
    const context = makeCliTestContext({ machine: true });
    return Effect.gen(function* () {
      const selection = yield* referencesOf("@acme/skills/review@1.2.0");
      const outcome = yield* handleVerify({ registry: Option.none(), selection });
      expect(outcome.exitCode).toBe(0);
      const document = decodeDocument(context.rendererState.results[0]?.data);
      expect(document.verdict).toEqual({ ok: true, reasons: [] });
      expect(document.releases[0]).toMatchObject({
        presence: { conclusion: "satisfied" },
        identity: { conclusion: "not-applicable" },
        archive: { conclusion: "satisfied" },
      });
      expect(settledOutcomes(context.rendererState.events)).toEqual(["completed"]);
      expect(context.rendererState.suggestions).toEqual([]);
    }).pipe(
      // The file Registry replaces the context's default one.
      Effect.provide(Layer.merge(context.baseLayer, RegistryContextTest(registry.url))),
    );
  });

  it.effect(
    "completes a negative verification with exit 1 and offers sign-in to a signed-out caller",
    () => {
      const transport = unavailableRegistry();
      const context = makeCliTestContext({ machine: true, httpClient: transport.httpClient });
      return Effect.gen(function* () {
        const selection = yield* referencesOf("@acme/skills/private@1.0.0");
        const outcome = yield* handleVerify({ registry: Option.none(), selection });
        expect(outcome.exitCode).toBe(1);
        const document = decodeDocument(context.rendererState.results[0]?.data);
        expect(document.verdict.ok).toBe(false);
        expect(document.releases[0]?.presence.finding).toBe("extension-unavailable");
        expect(settledOutcomes(context.rendererState.events)).toEqual(["completed"]);
        expect(context.rendererState.suggestions).toContainEqual({
          description: "Sign in if this extension is private.",
          cmd: "axm login",
        });
        // One selection exchange; nothing listed, so nothing is admitted or downloaded.
        expect(transport.requests.map(({ method, url }) => `${method} ${url}`)).toEqual([
          "POST https://registry.example.com/v1/resolutions",
        ]);
      }).pipe(Effect.provide(context.baseLayer));
    },
  );

  it.effect("offers no sign-in to a caller already signed in to the HTTP Registry", () => {
    const transport = unavailableRegistry();
    const context = makeCliTestContext({ machine: true, httpClient: transport.httpClient });
    return Effect.gen(function* () {
      const selection = yield* referencesOf("@acme/skills/private@1.0.0");
      const outcome = yield* handleVerify({ registry: Option.none(), selection });
      expect(outcome.exitCode).toBe(1);
      const document = decodeDocument(context.rendererState.results[0]?.data);
      expect(document.releases[0]?.presence.finding).toBe("extension-unavailable");
      expect(context.rendererState.suggestions).toEqual([]);
    }).pipe(Effect.provide(Layer.merge(context.baseLayer, signedInStore)));
  });

  it.effect("offers no sign-in for an extension a file Registry does not hold", () => {
    // A file Registry has no visibility rules, so signing in cannot change its answer.
    const registry = makeFileRegistry();
    cleanups.push(registry.cleanup);
    registry.writeSkill("review", [{ version: "1.2.0", body: "Review." }]);
    const context = makeCliTestContext({ machine: true });
    return Effect.gen(function* () {
      const selection = yield* referencesOf("@acme/skills/absent@1.0.0");
      const outcome = yield* handleVerify({ registry: Option.none(), selection });
      expect(outcome.exitCode).toBe(1);
      const document = decodeDocument(context.rendererState.results[0]?.data);
      expect(document.releases[0]?.presence.finding).toBe("extension-unavailable");
      expect(context.rendererState.suggestions).toEqual([]);
    }).pipe(Effect.provide(Layer.merge(context.baseLayer, RegistryContextTest(registry.url))));
  });

  it.effect(
    "reads a relative publish result from the execution directory, not the process's",
    () => {
      const directory = fs.realpathSync(
        fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-verify-execution-directory-")),
      );
      cleanups.push(() => fs.rmSync(directory, { recursive: true, force: true }));
      // Present only under the execution directory, and not a publish result.
      fs.writeFileSync(nodePath.join(directory, "publish.json"), "{");
      const context = makeCliTestContext({ machine: true });
      return Effect.gen(function* () {
        const failure = yield* Effect.flip(
          handleVerify({
            registry: Option.none(),
            selection: { mode: "publish-result", path: "publish.json" },
          }),
        );
        expect(failure).toMatchObject({
          code: "validation",
          detail: `The publish result at ${nodePath.join(directory, "publish.json")} is not valid JSON.`,
        });
      }).pipe(
        Effect.provideService(ExecutionDirectory, { path: decodeAbsolutePathSync(directory) }),
        Effect.provide(context.baseLayer),
      );
    },
  );

  it.effect("maps an unreadable publish result to the validation error before any request", () => {
    const transport = makeRecordedRegistryTransport(() => ({ status: 500, body: {} }));
    const context = makeCliTestContext({ machine: true, httpClient: transport.httpClient });
    return Effect.gen(function* () {
      const failure = yield* Effect.flip(
        handleVerify({
          registry: Option.none(),
          selection: { mode: "publish-result", path: "verify-missing-publish-result.json" },
        }),
      );
      expect(failure).toMatchObject({ code: "validation" });
      expect(transport.requests).toEqual([]);
      expect(settledOutcomes(context.rendererState.events)).toEqual(["failed"]);
      expect(context.rendererState.results).toEqual([]);
    }).pipe(Effect.provide(context.baseLayer));
  });

  it.effect("keeps the network error contract when no release yields an observation", () => {
    const requests: Array<string> = [];
    const httpClient = HttpClient.make((request) => {
      requests.push(request.url);
      return Effect.fail(
        new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({
            request,
            cause: new RegistryRequestFailed({
              reason: "network-required",
              category: "network",
              detail:
                "network-required: This operation requires network access, which --offline prohibits.",
            }),
            description: "Network access is disabled.",
          }),
        }),
      );
    });
    const context = makeCliTestContext({ machine: true, httpClient });
    return Effect.gen(function* () {
      const selection = yield* referencesOf("@acme/skills/review@1.2.0");
      const failure = yield* Effect.result(handleVerify({ registry: Option.none(), selection }));
      expect(Result.isFailure(failure) && failure.failure).toMatchObject({ code: "network" });
      expect(context.rendererState.results).toEqual([]);
      expect(requests.every((url) => !url.endsWith("/archive"))).toBe(true);
    }).pipe(Effect.provide(context.baseLayer));
  });
});
