/**
 * Telemetry-slice fixtures.
 *
 * Drives one real command through the production CLI envelope with telemetry
 * delivery turned on explicitly, so a specification can compare the outcome
 * and the workspace against the same command run without telemetry, and read
 * every payload the transport was handed.
 */

import * as fs from "node:fs";

import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import { CommandArgv, withCliErrorHandling } from "../cli-runtime/index.js";
import { handleInstall } from "../root/install/handler.js";
import type { TelemetryHostObservation } from "../telemetry/index.js";
import { makeSpecWorkspace, writeLocalSkillPackage } from "./install-harness.js";
import { writeWorkspaceFiles } from "./test-stubs.js";
import { snapshotWorkspaceContent } from "./workspace-fixtures.js";

export const sensitiveSentinels = [
  "SYNTHETIC_EXTENSION_CONTENT_71",
  "SYNTHETIC_AUTHORED_INSTRUCTION_72",
  "SYNTHETIC_KNOWLEDGE_CONTENT_73",
  "SYNTHETIC_CREDENTIAL_74",
  "SYNTHETIC_RESOLVED_SECRET_75",
] as const;

export const captureTelemetry = () => {
  const requests: Array<{ readonly url: string; readonly body: unknown }> = [];
  const client = HttpClient.make((request) => {
    const payload = request.body;
    // A telemetry request that is not a JSON body is a fixture invariant
    // violation, not an outcome this harness models.
    if (payload._tag !== "Uint8Array") {
      return Effect.die(new Error("Expected a JSON telemetry request"));
    }
    return Effect.sync(() => {
      const body: unknown = JSON.parse(new TextDecoder().decode(payload.body));
      requests.push({ url: request.url, body });
      return HttpClientResponse.fromWeb(request, new Response("", { status: 202 }));
    });
  });
  return { requests, client };
};

/** Host identity that cannot be observed, so the failure is a port failure. */
export const unobservableHost: TelemetryHostObservation = {
  hostname: () => {
    throw new Error("synthetic host observation failure");
  },
  osRelease: () => {
    throw new Error("synthetic host observation failure");
  },
};

/** The production command envelope and install handler share controlled ports. */
export const makeTelemetryOperation = () => {
  const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
  const reset = () => {
    fs.rmSync(workspace.root, { recursive: true, force: true });
    fs.mkdirSync(workspace.root, { recursive: true });
    writeWorkspaceFiles(workspace.root);
    workspace.rendererState.results.length = 0;
    workspace.rendererState.docs.length = 0;
    return writeLocalSkillPackage(workspace.root, {
      name: "review",
      body: sensitiveSentinels.join("\n"),
    });
  };
  const run = (options: {
    readonly client: HttpClient.HttpClient;
    readonly mode?: "all" | "off";
    readonly fail?: boolean;
    readonly collectionFailure?: boolean;
    readonly host?: TelemetryHostObservation;
  }) =>
    Effect.gen(function* () {
      const source = reset();
      const argv: Record<string, unknown> =
        options.collectionFailure === true
          ? Object.defineProperty({}, "source", {
              enumerable: true,
              get: () => {
                throw new Error("telemetry collection failed");
              },
            })
          : { source, env: sensitiveSentinels, authorization: sensitiveSentinels[3], force: false };
      const exit = yield* withCliErrorHandling(
        handleInstall({
          source: Option.some(options.fail === true ? `${source}/missing` : source),
          force: false,
          preview: false,
        }),
        {
          command: "install",
          format: "json",
          telemetryConfig: {
            mode: options.mode ?? "all",
            client: { name: "cli", version: "1.2.3" },
            // The repository's own test run suppresses delivery; a telemetry
            // specification observes it, so it asks for delivery explicitly.
            deliverInTest: true,
            ...(options.host === undefined ? {} : { host: options.host }),
          },
        },
      ).pipe(
        Effect.provideService(CommandArgv, {
          value: argv,
          paramKinds: { source: "argument", env: "flag", authorization: "flag", force: "flag" },
        }),
        Effect.provideService(HttpClient.HttpClient, options.client),
        Effect.provide(workspace.layer),
        Effect.exit,
      );
      const failure = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined;
      const exitCode = Exit.isSuccess(exit)
        ? 0
        : typeof failure === "object" && failure !== null && "exitCode" in failure
          ? failure.exitCode
          : undefined;
      return {
        exit,
        exitCode,
        files: snapshotWorkspaceContent(workspace.root),
        docs: JSON.stringify(workspace.rendererState.docs),
        settings: workspace.readFile("axm.json"),
        lock: workspace.exists("axm-lock.yaml") ? workspace.readFile("axm-lock.yaml") : null,
        native: workspace.exists(".claude/skills/review/SKILL.md")
          ? workspace.readFile(".claude/skills/review/SKILL.md")
          : null,
        results: workspace.rendererState.results.map(({ data, ok }) => ({ data, ok })),
      };
    });
  return { run, cleanup: workspace.cleanup };
};
