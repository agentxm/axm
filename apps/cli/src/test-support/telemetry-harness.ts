/**
 * Telemetry-slice fixtures.
 *
 * Drives one real command through the production CLI envelope with a
 * delivering telemetry reporter, so a specification can compare the outcome
 * and the workspace against the same command run without telemetry, and read
 * every payload the transport was handed.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/http/HttpClient";
import type * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import { CommandArgv, withCliErrorHandling } from "../cli-runtime/index.js";
import { handleInstall } from "../root/install/handler.js";
import { TelemetryClientLive, type TelemetryClientOptions } from "../telemetry/index.js";
import { makeSpecWorkspace, writeLocalSkillPackage } from "./install-harness.js";
import { writeWorkspaceFiles } from "./test-stubs.js";
import { snapshotTree } from "@agentxm/test-support";
import { readContainerReceipts, type ContainerIdentity } from "@agentxm/workspace-kernel/locations";

// Each trial recreates the same paths as new filesystem objects. Compare the
// complete receipt meaning while leaving incarnation checks to location specs.
const comparableIdentity = (identity: ContainerIdentity) => {
  const attributes = (entry: ContainerIdentity["entry"]) => ({
    device: entry.device,
    mode: entry.mode,
  });
  return {
    ...identity,
    entry: attributes(identity.entry),
    owner: { ...identity.owner, identity: attributes(identity.owner.identity) },
    root: { ...identity.root, identity: attributes(identity.root.identity) },
    parents: identity.parents.map((parent) => ({
      ...parent,
      identity: attributes(parent.identity),
    })),
  };
};

export const sensitiveSentinels = [
  "SYNTHETIC_EXTENSION_CONTENT_71",
  "SYNTHETIC_AUTHORED_INSTRUCTION_72",
  "SYNTHETIC_KNOWLEDGE_CONTENT_73",
  "SYNTHETIC_CREDENTIAL_74",
  "SYNTHETIC_RESOLVED_SECRET_75",
] as const;

const reportEventId = (body: unknown): unknown =>
  typeof body === "object" && body !== null && "eventId" in body ? body.eventId : undefined;

/**
 * The ingest service's answer to one captured request: a receipt naming the
 * report's event identity for an error report, an empty acceptance for a
 * usage event batch.
 */
export const telemetryIngestResponse = (
  request: HttpClientRequest.HttpClientRequest,
  body: unknown,
): HttpClientResponse.HttpClientResponse =>
  request.url.endsWith("/v1/errors")
    ? HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify({ eventId: reportEventId(body), receipt: "received" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
    : HttpClientResponse.fromWeb(request, new Response("", { status: 202 }));

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
      return telemetryIngestResponse(request, body);
    });
  });
  return { requests, client };
};

/**
 * A user home whose telemetry directory cannot be created: the home is a
 * regular file, so identity storage is unavailable to every reporter that
 * resolves its installation identity there.
 */
export const makeUnavailableIdentityStorage = () => {
  const directory = fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-telemetry-identity-"));
  const userHome = nodePath.join(directory, "home");
  fs.writeFileSync(userHome, "not a directory\n");
  return {
    userHome,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
};

/** A delivering reporter over the given transport, as the process entry builds it. */
export const telemetryReporterLayer = (options: {
  readonly client: HttpClient.HttpClient;
  readonly reporter: TelemetryClientOptions;
  readonly environment?: Readonly<Record<string, string>>;
}) =>
  Layer.provide(
    TelemetryClientLive(options.reporter),
    Layer.mergeAll(
      NodeServices.layer,
      Layer.succeed(HttpClient.HttpClient, options.client),
      ConfigProvider.layer(ConfigProvider.fromEnv({ env: { ...options.environment } })),
    ),
  );

/** The production command envelope and install handler share controlled ports. */
export const makeTelemetryOperation = () => {
  const workspace = makeSpecWorkspace({ machine: true, flags: { json: true } });
  const identityStorage = makeUnavailableIdentityStorage();
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
    readonly mode?: "all" | "errors" | "off";
    readonly fail?: boolean;
    readonly preview?: boolean;
    readonly collectionFailure?: boolean;
    /** Resolve identity from storage that cannot hold one, instead of a fixed identity. */
    readonly identityFailure?: boolean;
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
          type: Option.none(),
          source: Option.some(options.fail === true ? `${source}/missing` : source),
          selectors: {},
          all: true,
          force: false,
          preview: options.preview === true,
          bind: [],
          bindEnv: [],
          localName: Option.none(),
          bundled: false,
        }),
        { command: "install", format: "json" },
      ).pipe(
        Effect.provideService(CommandArgv, {
          value: argv,
          paramKinds: { source: "argument", env: "flag", authorization: "flag", force: "flag" },
        }),
        // The delivering reporter replaces the workspace's disabled one.
        Effect.provide(
          Layer.mergeAll(
            workspace.layer,
            telemetryReporterLayer({
              client: options.client,
              reporter: {
                mode: options.mode ?? "all",
                client: { name: "cli", version: "1.2.3" },
                // The repository's own test run suppresses delivery; a telemetry
                // specification observes it, so it asks for delivery explicitly.
                deliverInTest: true,
                eventIdFactory: () => "00000000-0000-4000-8000-000000000002",
                ...(options.identityFailure === true
                  ? {}
                  : { installationId: "00000000-0000-4000-8000-000000000001" }),
              },
              ...(options.identityFailure === true
                ? { environment: { AXM_USER_HOME: identityStorage.userHome } }
                : {}),
            }),
          ),
        ),
        Effect.exit,
      );
      const exitCode = Exit.isSuccess(exit) ? exit.value.exitCode : undefined;
      const receipts = yield* readContainerReceipts(nodePath.join(workspace.root, ".axm")).pipe(
        Effect.provide(NodeServices.layer),
      );
      return {
        exit,
        exitCode,
        files: Object.fromEntries(
          Object.entries(snapshotTree(workspace.root)).filter(
            ([relative]) => relative !== ".axm/projection-containers.json",
          ),
        ),
        receipts: {
          ...receipts,
          entries: receipts.entries
            .map((entry) => ({ ...entry, identity: comparableIdentity(entry.identity) }))
            .sort(
              (left, right) =>
                left.unit.localeCompare(right.unit) ||
                left.kind.localeCompare(right.kind) ||
                left.identity.physicalPath.localeCompare(right.identity.physicalPath),
            ),
          createdDirectories: receipts.createdDirectories
            .map(comparableIdentity)
            .sort((left, right) => left.physicalPath.localeCompare(right.physicalPath)),
        },
        docs: JSON.stringify(workspace.rendererState.docs),
        settings: workspace.readFile("axm.json"),
        lock: workspace.exists("axm-lock.yaml") ? workspace.readFile("axm-lock.yaml") : null,
        native: workspace.exists(".claude/skills/review/SKILL.md")
          ? workspace.readFile(".claude/skills/review/SKILL.md")
          : null,
        results: workspace.rendererState.results.map(({ data, ok }) => ({ data, ok })),
      };
    });
  return {
    run,
    cleanup: () => {
      identityStorage.cleanup();
      workspace.cleanup();
    },
  };
};
