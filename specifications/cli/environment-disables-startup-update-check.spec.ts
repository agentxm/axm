import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Layer from "effect/Layer";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import { afterEach, describe, expect, it } from "@effect/vitest";
import { vi } from "vitest";
import { decodeStableChannelDocumentSync } from "@agentxm/extension-model/unstable/release-channel";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  UpdateCheck,
  UpdateCheckLive,
  withUpdateCheck,
  TestRenderer,
} from "axm.sh/specification-harness";
import { stableChannelDocument } from "../support/release-channel-fixture.js";
import { snapshotWorkspaceContent } from "../support/workspace-fixtures.js";

afterEach(() => vi.unstubAllEnvs());
export const specification = defineSpecification({
  requirement: "cli/environment-disables-startup-update-check",
  title: "The environment can disable the startup update check",
  statement:
    "When AXM_NO_UPDATE_CHECK is 1, AXM shall omit the informational startup update notification and its release requests regardless of output or interaction mode, while allowing an explicitly invoked command to perform its required network operations.",
  class: "functional",
  role: "interface",
  goals: ["machine-automation", "safe-repetition"],
  methods: ["decision-table", "example"],
  derivedFrom: [
    "packages/cli/help/topics/environment.md",
    "packages/cli/help/topics/upgrade.md",
    "packages/cli/src/update-check-startup.internal.test.ts",
    "packages/cli/src/update-check/update-check.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Must agent sessions always skip startup checks when AXM_NO_UPDATE_CHECK is not 1? Earlier environment help said they skip, but the current runtime and its internal test permit agent checks even without a TTY.",
    "Does suppression also prohibit reading an existing update cache, beyond the absence of requests and notifications promised here?",
  ],
  limitations: [
    {
      limitation:
        "The primary decision table uses a populated fresh cache and a controlled HTTP port; it establishes notification suppression and command-network independence, but does not by itself establish the absence of a background refresh when a cache is missing or stale.",
      retirementCondition:
        "Add a scheduler-coordinated missing/stale-cache control that observes the live startup wrapper's detached request and completion without wall-clock sleeps or leaked fibers.",
    },
  ],
});

describe("Startup update suppression", () => {
  for (const disabled of [true, false])
    for (const json of [false, true])
      for (const nonInteractive of [false, true])
        for (const tty of [false, true])
          for (const agent of [false, true]) {
            if (!disabled && (json || nonInteractive || !tty || agent)) continue;
            it.effect(
              `disabled=${disabled}, JSON=${json}, unattended=${nonInteractive}, TTY=${tty}, agent=${agent}`,
              () => {
                vi.stubEnv("AXM_NO_UPDATE_CHECK", disabled ? "1" : "0");
                const home = fs.mkdtempSync(path.join(os.tmpdir(), "axm-startup-env-"));
                const requests: string[] = [];
                const notes: string[] = [];
                const platform = Layer.mergeAll(
                  NodeServices.layer,
                  ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home } })),
                );
                const renderer = TestRenderer.make();
                const http = HttpClient.make((request) =>
                  Effect.sync(() => {
                    requests.push(request.url);
                    return HttpClientResponse.fromWeb(request, new Response("command response"));
                  }),
                );
                const services = Layer.mergeAll(
                  platform,
                  renderer.layer,
                  Layer.succeed(HttpClient.HttpClient, http),
                  UpdateCheckLive.pipe(Layer.provide(platform)),
                );
                return Effect.gen(function* () {
                  const cache = yield* UpdateCheck;
                  yield* cache.writeCache(
                    decodeStableChannelDocumentSync(stableChannelDocument("2.0.0")),
                    null,
                  );
                  const before = snapshotWorkspaceContent(home);
                  const result = yield* withUpdateCheck(
                    Effect.gen(function* () {
                      const client = yield* HttpClient.HttpClient;
                      return yield* (yield* client.get(
                        "https://command.example.test/required-operation",
                      )).text;
                    }),
                    {
                      localVersion: "1.0.0",
                      inputs: {
                        args: ["view", "@acme/skills/review"],
                        isJsonOutput: json,
                        isNonInteractive: nonInteractive,
                        isStderrTTY: tty,
                        isAgentSession: agent,
                      },
                      printNotification: (message) =>
                        Effect.sync(() => {
                          notes.push(message);
                        }),
                    },
                  );
                  expect(result).toBe("command response");
                  if (disabled) expect(notes).toEqual([]);
                  else {
                    expect(notes).toHaveLength(1);
                    expect(notes[0]).toContain("2.0.0");
                  }
                  expect(requests).toEqual(["https://command.example.test/required-operation"]);
                  expect(snapshotWorkspaceContent(home)).toEqual(before);
                }).pipe(
                  Effect.provide(services),
                  Effect.ensuring(
                    Effect.sync(() => fs.rmSync(home, { recursive: true, force: true })),
                  ),
                );
              },
            );
          }
  it.effect("without suppression, a missing cache reaches the real startup request path", () => {
    vi.stubEnv("AXM_NO_UPDATE_CHECK", "0");
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "axm-startup-positive-"));
    const requests: string[] = [];
    return Effect.gen(function* () {
      const observed = yield* Deferred.make<void>();
      const platform = Layer.mergeAll(
        NodeServices.layer,
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home } })),
      );
      const http = HttpClient.make((request) =>
        Effect.gen(function* () {
          requests.push(request.url);
          // No cache write follows a refused HTTP response, keeping the observed
          // detached refresh free of a subsequent asynchronous storage lifetime.
          const response = HttpClientResponse.fromWeb(request, new Response(null, { status: 503 }));
          yield* Deferred.succeed(observed, undefined);
          return response;
        }),
      );
      const renderer = TestRenderer.make();
      const services = Layer.mergeAll(
        platform,
        renderer.layer,
        Layer.succeed(HttpClient.HttpClient, http),
        UpdateCheckLive.pipe(Layer.provide(platform)),
      );
      yield* withUpdateCheck(Deferred.await(observed), {
        localVersion: "1.0.0",
        inputs: {
          args: ["view", "@acme/skills/review"],
          isJsonOutput: false,
          isNonInteractive: false,
          isStderrTTY: true,
          isAgentSession: false,
        },
      }).pipe(Effect.provide(services));
      expect(requests).toEqual(["https://releases.axm.sh/v1/channels/stable.json"]);
    }).pipe(Effect.ensuring(Effect.sync(() => fs.rmSync(home, { recursive: true, force: true }))));
  });
});
