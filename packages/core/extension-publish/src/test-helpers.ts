/**
 * Driving the publish use case from this package's own tests and
 * specifications.
 *
 * A publish is the one operation whose effect leaves the workspace, so the
 * world it runs in is real: a throwaway project with authored packages on
 * disk, the production workspace-state services over it, and a `file://`
 * Registry whose every upload lands as an observable file. The transport is
 * offline unless an example supplies one, so a publish that passes here is
 * simultaneously evidence that the exercised path never opened a socket.
 *
 * Every helper resolves a request through the same two calls the application
 * makes — `PublishExtensions.prepare` then `previewOrApply` — so an example
 * observes the use case rather than a rehearsal of it.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";
import { inflateRawSync } from "node:zlib";

import { expect } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";

import type { GitDirectoryComparisonService } from "@agentxm/extension-sources";
import { GitDirectoryComparisonTest } from "@agentxm/extension-sources/testing";
import {
  AuthClientTest,
  AuthLoginPresenterTest,
  CredentialStoreTest,
  DeviceLoginInteractionTest,
  PendingPublishAuthorizationStoreTest,
} from "@agentxm/registry-auth/testing";
import { RegistryUrlTest, testRegistryUrl } from "@agentxm/registry-client/testing";
import type { CreatePublishAuthorizationRequestParams } from "@agentxm/registry-auth";
import { validateArchive } from "@agentxm/extension-content";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { formatFqn } from "@agentxm/extension-model/unstable/extensions";
import {
  publicationDescriptorDigest,
  publicationSetDigest,
} from "@agentxm/registry-protocol/unstable/registry";
import {
  applyPlanExecution,
  previewPlanExecution,
  type PlanExecution,
  type PlanPolicyId,
} from "@agentxm/workspace-operations";
import {
  PlanInvocationTest,
  ResolvePlanInteractionTest,
} from "@agentxm/workspace-operations/testing";
import { layer as WorkspaceStateLayer } from "@agentxm/workspace-state/live";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { normalizePublishResult, type PublishResult } from "./publish/result.js";
import type { PublishRequest } from "./publish/model.js";
import { PublishExtensions, type PublishOutcome } from "./publish/use-case.js";
import { PublishFailed } from "./errors.js";
import {
  makePublishTarget,
  publishRequest,
  writeAuthoredExtension,
  type AuthoredExtensionFixture,
} from "./testing.js";

/** One mutating call the recording file system observed. */
export interface FileSystemWriteEvent {
  readonly operation:
    | "chmod"
    | "chown"
    | "copy"
    | "copyFile"
    | "link"
    | "makeDirectory"
    | "open"
    | "remove"
    | "rename"
    | "symlink"
    | "truncate"
    | "utimes"
    | "writeFile";
  /** Every path the call could change. */
  readonly paths: ReadonlyArray<string>;
}

/**
 * A file system that delegates every call and reports each mutating one, so
 * a preview shown to leave protected state unchanged is also shown never to
 * have attempted a write beneath it. Reads and existence checks are not
 * reported.
 */
const recordingFileSystemLayer = (
  onWrite: (event: FileSystemWriteEvent) => void,
): Layer.Layer<FileSystem.FileSystem, never, FileSystem.FileSystem> =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.map(FileSystem.FileSystem, (fileSystem) => {
      const record = (operation: FileSystemWriteEvent["operation"], paths: ReadonlyArray<string>) =>
        Effect.sync(() => onWrite({ operation, paths }));
      const opensForWriting = (flag: string | undefined): boolean =>
        flag !== undefined && /[wa+]/u.test(flag);
      return FileSystem.make({
        ...fileSystem,
        chmod: (path, mode) =>
          record("chmod", [path]).pipe(Effect.andThen(fileSystem.chmod(path, mode))),
        chown: (path, uid, gid) =>
          record("chown", [path]).pipe(Effect.andThen(fileSystem.chown(path, uid, gid))),
        copy: (fromPath, toPath, options) =>
          record("copy", [toPath]).pipe(Effect.andThen(fileSystem.copy(fromPath, toPath, options))),
        copyFile: (fromPath, toPath) =>
          record("copyFile", [toPath]).pipe(Effect.andThen(fileSystem.copyFile(fromPath, toPath))),
        link: (fromPath, toPath) =>
          record("link", [toPath]).pipe(Effect.andThen(fileSystem.link(fromPath, toPath))),
        makeDirectory: (path, options) =>
          record("makeDirectory", [path]).pipe(
            Effect.andThen(fileSystem.makeDirectory(path, options)),
          ),
        open: (path, options) =>
          (opensForWriting(options?.flag) ? record("open", [path]) : Effect.void).pipe(
            Effect.andThen(fileSystem.open(path, options)),
          ),
        remove: (path, options) =>
          record("remove", [path]).pipe(Effect.andThen(fileSystem.remove(path, options))),
        rename: (oldPath, newPath) =>
          record("rename", [oldPath, newPath]).pipe(
            Effect.andThen(fileSystem.rename(oldPath, newPath)),
          ),
        symlink: (fromPath, toPath) =>
          record("symlink", [toPath]).pipe(Effect.andThen(fileSystem.symlink(fromPath, toPath))),
        truncate: (path, length) =>
          record("truncate", [path]).pipe(Effect.andThen(fileSystem.truncate(path, length))),
        utimes: (path, atime, mtime) =>
          record("utimes", [path]).pipe(Effect.andThen(fileSystem.utimes(path, atime, mtime))),
        writeFile: (path, data, options) =>
          record("writeFile", [path]).pipe(
            Effect.andThen(fileSystem.writeFile(path, data, options)),
          ),
      });
    }),
  );

/** The workspace state a preview of a publishing command must not touch. */
export const WORKSPACE_PROTECTED_STATE: ReadonlyArray<string> = [
  "axm.json",
  "axm-lock.yaml",
  "agent_extensions",
  "skills",
  "subagents",
  "mcps",
  "rules",
  "hooks",
  "knowledge",
  "packs",
  ".claude",
  ".agents",
  ".mcp.json",
  "AGENTS.md",
  "CLAUDE.md",
];

/** Publish also protects the target Registry it would upload to. */
export const PUBLISH_PROTECTED_STATE: ReadonlyArray<string> = [
  ...WORKSPACE_PROTECTED_STATE,
  "registry",
];

export type ProtectedStateSnapshot = Readonly<Record<string, Readonly<Record<string, string>>>>;

const snapshotDirectory = (root: string): Readonly<Record<string, string>> => {
  const entries: Array<readonly [string, string]> = [];
  const walk = (directory: string, relativeDirectory: string): void => {
    for (const entry of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, "en"))) {
      const relative =
        relativeDirectory.length === 0 ? entry.name : `${relativeDirectory}/${entry.name}`;
      const target = nodePath.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        entries.push([relative, `symlink:${fs.readlinkSync(target)}`]);
      } else if (entry.isDirectory()) {
        entries.push([relative, "directory"]);
        walk(target, relative);
      } else {
        entries.push([relative, `file:${Buffer.from(fs.readFileSync(target)).toString("base64")}`]);
      }
    }
  };
  walk(root, "");
  return Object.fromEntries(entries);
};

const snapshotPath = (absolute: string): Readonly<Record<string, string>> => {
  if (!fs.existsSync(absolute)) return {};
  const entry = fs.lstatSync(absolute);
  if (entry.isSymbolicLink()) return { ".": `symlink:${fs.readlinkSync(absolute)}` };
  if (entry.isDirectory()) return snapshotDirectory(absolute);
  return { ".": `file:${Buffer.from(fs.readFileSync(absolute)).toString("base64")}` };
};

const isWithin = (root: string, candidate: string): boolean => {
  const relative = nodePath.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !nodePath.isAbsolute(relative));
};

export interface PublishWorldOptions {
  /** Settings document for the project, written as authored. */
  readonly settings?: Readonly<Record<string, unknown>>;
  /** Git worktree comparison; the default reports no enclosing worktree. */
  readonly compare?: GitDirectoryComparisonService["compare"];
  /** Registry answers for the auth client; defaults to the client's own. */
  readonly auth?: Parameters<typeof AuthClientTest>[0];
  /** Device-login interaction; the default never opens a browser. */
  readonly deviceLogin?: Parameters<typeof DeviceLoginInteractionTest>[0];
  /**
   * The transport the publish reaches the Registry through. Omitted, every
   * request dies, which is what a `file://` target example wants.
   */
  readonly httpClient?: HttpClient.HttpClient;
  /** The default Registry endpoint, when a request names no override. */
  readonly registryUrl?: string;
}

/**
 * A throwaway project workspace with the production workspace services over
 * it and a `file://` Registry to publish into.
 */
export const makePublishWorld = (options: PublishWorldOptions = {}) => {
  const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-publish-")));
  fs.mkdirSync(nodePath.join(root, ".axm"), { recursive: true });
  const writeSettings = (settings: Readonly<Record<string, unknown>>): void => {
    fs.writeFileSync(nodePath.join(root, "axm.json"), JSON.stringify(settings, null, 2));
  };
  const readSettings = (): Readonly<Record<string, unknown>> => {
    const parsed: unknown = JSON.parse(fs.readFileSync(nodePath.join(root, "axm.json"), "utf8"));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("Expected axm.json to contain an object");
    }
    return Object.fromEntries(Object.entries(parsed));
  };
  writeSettings({ owner: "@acme", agents: [], ...options.settings });
  // JSON is valid YAML, so the lockfile fixture needs no emitter.
  fs.writeFileSync(
    nodePath.join(root, "axm-lock.yaml"),
    JSON.stringify({ lockfileVersion: 7, skills: {} }),
  );

  const target = makePublishTarget(root);
  const writes: Array<FileSystemWriteEvent> = [];
  const transport =
    options.httpClient === undefined
      ? HttpClient.make(() => Effect.die(new Error("No HTTP request in this publish fixture")))
      : options.httpClient;

  const platform = Layer.provideMerge(
    recordingFileSystemLayer((event) => void writes.push(event)),
    NodeServices.layer,
  );
  const interaction = ResolvePlanInteractionTest();
  const services = Layer.provideMerge(
    Layer.mergeAll(
      WorkspaceStateLayer({ scope: "project", projectRoot: decodeAbsolutePathSync(root) }),
      AuthClientTest(options.auth),
      AuthLoginPresenterTest().layer,
      DeviceLoginInteractionTest(
        options.deviceLogin ?? {
          openBrowser: () => Effect.die(new Error("This publish fixture opens no browser")),
        },
      ).layer,
      PendingPublishAuthorizationStoreTest(),
      // No stored credential: a remote publish therefore has to acquire exact
      // authorization rather than inheriting a session.
      CredentialStoreTest(),
      GitDirectoryComparisonTest(options.compare),
      RegistryUrlTest(options.registryUrl ?? testRegistryUrl),
      Layer.succeed(HttpClient.HttpClient, transport),
      PlanInvocationTest,
      interaction.layer,
    ),
    platform,
  );

  return {
    /** Absolute project root of the temporary workspace. */
    root,
    /** The `file://` Registry a publish uploads into. */
    target,
    readSettings,
    writeSettings,
    /**
     * Adds a workspace lint severity override to `axm.json`: the configurable
     * local policy `axm lint` honors and the fixed publication gate ignores.
     */
    setLintRule: (ruleId: string, severity: "off" | "info" | "warn" | "error"): void => {
      writeSettings({ ...readSettings(), lint: { rules: { [ruleId]: severity } } });
    },
    /** Writes one workspace-authored package as its `new` command leaves it. */
    write: (
      type: Parameters<typeof writeAuthoredExtension>[1],
      fixture: AuthoredExtensionFixture,
    ) => writeAuthoredExtension(root, type, fixture),
    /** Every mutating file-system call the run made. */
    writes,
    /** What the plan interaction port was asked to present and confirm. */
    interactionState: () => interaction.state,
    /** Exact content of every declared protected path, missing ones as empty. */
    snapshotProtectedState: (
      protectedPaths: ReadonlyArray<string> = PUBLISH_PROTECTED_STATE,
    ): ProtectedStateSnapshot =>
      Object.fromEntries(
        protectedPaths.map((relative) => [relative, snapshotPath(nodePath.join(root, relative))]),
      ),
    /** Every recorded write whose target lies beneath a protected path. */
    protectedWrites: (
      protectedPaths: ReadonlyArray<string> = PUBLISH_PROTECTED_STATE,
    ): ReadonlyArray<FileSystemWriteEvent> =>
      writes.filter((event) =>
        event.paths.some((path) =>
          protectedPaths.some((relative) =>
            isWithin(nodePath.join(root, relative), nodePath.resolve(path)),
          ),
        ),
      ),
    /** Exact content of the whole Registry, for a "nothing changed" comparison. */
    snapshotRegistry: (): Readonly<Record<string, string>> => snapshotDirectory(target.root),
    /** The bytes the Registry actually holds for one published version. */
    archive: (name: string, version = "1.0.0", plural = "skills"): Uint8Array =>
      fs.readFileSync(
        nodePath.join(target.root, "extensions", "@acme", plural, name, `${version}.zip`),
      ),
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(services)),
    cleanup: (): void => {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
};

export type PublishWorld = ReturnType<typeof makePublishWorld>;

/** The request every publish route builds, with this world's Registry as target. */
export const requestFor = (
  world: Pick<PublishWorld, "target">,
  overrides: Partial<PublishRequest> = {},
): PublishRequest => publishRequest(world.target.url, overrides);

/**
 * The execution one request asks for: a preview, or an apply whose
 * preapprovable confirmations are already approved and whose accepted
 * policies carry the source-state acceptance the request expressed.
 */
const executionFor = (request: PublishRequest): PlanExecution =>
  request.preview
    ? previewPlanExecution
    : applyPlanExecution({
        approval: "preapproved",
        acceptedPolicies: new Set<PlanPolicyId>(request.acceptWarnings ? ["accept-warnings"] : []),
        recovery: { command: [], arguments: [] },
      });

/**
 * Resolve one publish request the way the application does: prepare, then
 * preview or apply. Selection stays interruptible while the resolution settles
 * an interruption into an outcome behind its own control, so an interrupted
 * run still records what it resolved — pass `record` to read that outcome,
 * because the fiber itself still terminates as interrupted.
 */
export const runPublish = (request: PublishRequest, record?: Array<PublishOutcome>) =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const preparation = yield* restore(PublishExtensions.prepare(request));
      const outcome =
        preparation._tag === "Settled"
          ? preparation.outcome
          : yield* PublishExtensions.previewOrApply(preparation.candidate, executionFor(request));
      record?.push(outcome);
      return outcome;
    }),
  );

/** The `publish-result-v3` document one outcome reports. */
export const publishDocument = (outcome: PublishOutcome): PublishResult =>
  normalizePublishResult({
    mode: outcome.mode,
    ...(outcome.preconditions === undefined ? {} : { preconditions: outcome.preconditions }),
    ...(outcome.riskConditions === undefined ? {} : { riskConditions: outcome.riskConditions }),
    selection: outcome.selection,
    publicationSet: outcome.publicationSet,
    results: outcome.results,
    ...(outcome.failure === undefined ? {} : { failure: outcome.failure }),
    ...(outcome.interruption === undefined ? {} : { interruption: outcome.interruption }),
  });

/**
 * The typed failure a run that could not complete terminated with. Reading it
 * through this helper keeps an example from silently passing on a run that
 * unexpectedly succeeded.
 */
export const publishFailureOf = (outcome: PublishOutcome): PublishFailed => {
  expect(outcome.disposition._tag).toBe("Failed");
  if (outcome.disposition._tag !== "Failed") {
    throw new Error(`Expected a failed publish, not ${outcome.disposition._tag}`);
  }
  return outcome.disposition.failure;
};

/** The feature's typed failure, when a run refused before it settled anything. */
export const expectPublishFailed = (failure: unknown): PublishFailed => {
  expect(failure).toBeInstanceOf(PublishFailed);
  if (!(failure instanceof PublishFailed)) {
    throw new Error(`Expected a PublishFailed, not ${String(failure)}`);
  }
  return failure;
};

/** A JSON Registry response, as the Registry sends one. */
export const jsonRegistryResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** A problem-details Registry rejection with the given code and status. */
export const registryProblem = (code: string, status: number): Response =>
  jsonRegistryResponse(
    {
      type: `https://agentxm.ai/problems/${code}`,
      title: "Request rejected",
      status,
      detail: "Synthetic Registry rejection",
      code,
    },
    status,
  );

/** Inspect the real ZIP's central directory and independently decompress each entry. */
export const archiveContents = (bytes: Uint8Array) =>
  Effect.gen(function* () {
    const entries = yield* validateArchive(bytes);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return Object.fromEntries(
      entries.map((entry) => {
        const offset = entry.localHeaderOffset;
        const start =
          offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
        const compressed = bytes.subarray(start, start + entry.compressedSize);
        const content =
          entry.compressionMethod === 0 ? Buffer.from(compressed) : inflateRawSync(compressed);
        return [entry.fileName, content] as const;
      }),
    );
  });

/** The remote Registry a publication authorization and its uploads address. */
export const remotePublicationRegistry = "https://registry.example.test";
/** The condition the reviewed publication set binds every upload to. */
export const publicationCondition = '"pv2-reviewed"';
/** The capability the Registry grants for the reviewed publication set. */
export const publicationCapability = "SYNTHETIC_PUBLICATION_CAPABILITY";

/** The visibility a reviewed publication resolves to in the remote fixture. */
const reviewedVisibility = {
  value: "private",
  disposition: "establish",
  source: "explicit",
} as const;

export interface RemotePublishWorldOptions {
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly compare?: GitDirectoryComparisonService["compare"];
  /** Answer one archive upload; the default acknowledges the reviewed bytes. */
  readonly upload?: (
    request: HttpClientRequest.HttpClientRequest,
    index: number,
    success: (request: HttpClientRequest.HttpClientRequest) => Response,
  ) => Effect.Effect<Response>;
  /** Run before the Registry records the authorization request. */
  readonly beforeAuthorization?: Effect.Effect<void>;
  /** Answer an owner lookup; the default reports every owner as existing. */
  readonly ownerResponse?: (owner: string) => Response;
}

/**
 * A publish world whose target is a remote Registry: the publication set is
 * reviewed and approved without a browser, and every upload is observed as
 * the actual HTTP request the Registry would receive.
 */
export const makeRemotePublishWorld = (options: RemotePublishWorldOptions = {}) => {
  let authorizationRequest: CreatePublishAuthorizationRequestParams | undefined;
  const requests: Array<HttpClientRequest.HttpClientRequest> = [];
  const uploads: Array<HttpClientRequest.HttpClientRequest> = [];
  const authorized = (): CreatePublishAuthorizationRequestParams => {
    if (authorizationRequest === undefined) {
      throw new Error("Expected a publication authorization request");
    }
    return authorizationRequest;
  };
  // The construction lives outside `Effect.sync` so a fixture invariant it
  // cannot satisfy throws where the rule expects a thrown failure to live.
  const reviewedExchange = () => {
    const candidates = authorized().publicationSet.candidates;
    const setDigest = publicationSetDigest(candidates);
    return {
      status: "admitted" as const,
      preview: {
        contract: "publication-set-v2" as const,
        publicationSetDigest: setDigest,
        status: "admitted" as const,
        candidates: candidates.map((candidate) => ({
          kind: "resolved" as const,
          target: candidate.target,
          participation: candidate.participation,
          descriptorDigest: publicationDescriptorDigest(candidate),
          visibility: {
            target: formatFqn(candidate.target),
            intent: candidate.visibility.intent,
            request: candidate.visibility.request,
            resolved: reviewedVisibility,
            actual: null,
            comparison: "not-established" as const,
            findings: [],
          },
          condition: publicationCondition,
        })),
        packs: candidates.flatMap((candidate) =>
          candidate.pack === undefined
            ? []
            : [
                {
                  target: candidate.target,
                  status: "admitted" as const,
                  findings: [],
                  resolutions: candidate.pack.dependencies.map((dependency) => {
                    const selected = candidates.find(
                      (item) => formatFqn(item.target) === formatFqn(dependency),
                    );
                    if (selected === undefined) {
                      throw new Error(
                        "The remote publication fixture requires an authored selected dependency",
                      );
                    }
                    return { dependency, effectiveVersion: selected.target.version };
                  }),
                },
              ],
        ),
      },
      grants: candidates
        .filter((candidate) => candidate.participation === "publish")
        .map((candidate) => ({
          accessToken: publicationCapability,
          expiresAt: DateTime.makeUnsafe("2099-01-01T00:15:00.000Z"),
          scope: "extensions:publish:new",
          publishRequestId: "pubreq_01h455vb4pexka56gq5w2r7cpc",
          visibilityContract: "v2" as const,
          visibility: reviewedVisibility,
          condition: publicationCondition,
          publicationSetDigest: setDigest,
          publicationDescriptorDigest: publicationDescriptorDigest(candidate),
        })),
    };
  };
  const exchangeApproved = () => Effect.sync(reviewedExchange);
  const success = (request: HttpClientRequest.HttpClientRequest): Response => {
    const url = Option.getOrThrow(HttpClientRequest.toUrl(request));
    const candidate = authorized().publicationSet.candidates.find((item) =>
      url.pathname.endsWith(`/${item.target.name}/${item.target.version}`),
    );
    if (candidate === undefined || request.body._tag !== "Uint8Array") {
      throw new Error("Expected an authorized archive upload");
    }
    return jsonRegistryResponse(
      {
        ...candidate.target,
        integrity: `sha512-${createHash("sha512").update(request.body.body).digest("base64")}`,
        sha256_hex: createHash("sha256").update(request.body.body).digest("hex"),
        published_at: "2026-08-11T00:00:00.000Z",
        publish_status: "available",
        visibility: reviewedVisibility,
        warnings: [],
        links: { html: `https://agentxm.ai/${formatFqn(candidate.target)}` },
      },
      201,
    );
  };
  const httpClient = HttpClient.make((request) =>
    Effect.gen(function* () {
      requests.push(request);
      if (request.method === "PUT") {
        uploads.push(request);
        return HttpClientResponse.fromWeb(
          request,
          options.upload === undefined
            ? success(request)
            : yield* options.upload(request, uploads.length - 1, success),
        );
      }
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname.startsWith("/v1/owners/")) {
        return HttpClientResponse.fromWeb(
          request,
          options.ownerResponse?.(url.pathname.slice("/v1/owners/".length)) ??
            jsonRegistryResponse({ displayName: "Acme" }),
        );
      }
      return HttpClientResponse.fromWeb(request, registryProblem("not_found", 404));
    }),
  );
  const world = makePublishWorld({
    ...(options.settings === undefined ? {} : { settings: options.settings }),
    ...(options.compare === undefined ? {} : { compare: options.compare }),
    httpClient,
    registryUrl: remotePublicationRegistry,
    auth: {
      createPublishAuthorizationRequest: (request) =>
        Effect.gen(function* () {
          authorizationRequest = request;
          if (options.beforeAuthorization !== undefined) yield* options.beforeAuthorization;
          return {
            requestId: "pubreq_01h455vb4pexka56gq5w2r7cpc",
            authorizationUrl:
              "https://agentxm.ai/publish/authorize/pubreq_01h455vb4pexka56gq5w2r7cpc",
            interval: 2,
            expiresAt: DateTime.makeUnsafe("2099-01-01T00:10:00.000Z"),
          };
        }),
      exchangePublishAuthorizationCode: exchangeApproved,
      exchangePublishAuthorization: exchangeApproved,
      pollPublishAuthorization: () =>
        Effect.succeed({
          purpose: "publish",
          status: "approved",
          expires_at: DateTime.makeUnsafe("2099-01-01T00:10:00.000Z"),
          interval: 2,
          publication_set_digest: publicationSetDigest(authorized().publicationSet.candidates),
        }),
    },
  });
  return {
    ...world,
    /** Every Registry request the run issued, in order. */
    requests,
    /** Every archive upload the run dispatched, in order. */
    uploads,
    /** The authorization request the Registry recorded. */
    authorized,
    /** Whether a publication authorization was requested at all. */
    authorizationCount: (): number => (authorizationRequest === undefined ? 0 : 1),
  };
};

/** The request a remote publish builds: reviewed, unattended, private. */
export const remoteRequest = (overrides: Partial<PublishRequest> = {}): PublishRequest =>
  publishRequest(remotePublicationRegistry, {
    preview: false,
    unattended: true,
    waitForHumanSeconds: 60,
    visibility: Option.some("private"),
    ...overrides,
  });

/** The published extension a lifecycle example addresses. */
export const registryTarget = "@acme/skills/review";
/** The Registry path that extension's guidance lives under. */
export const registryTargetPath = `/v1/extensions/${registryTarget}`;
/** The revision a guidance read observes and the following write is conditioned on. */
export const observedRevision = "opaque-observed-revision";

/** One Registry request a published-extension lifecycle write issued. */
export interface RegistryManagementRequest {
  readonly method: string;
  readonly url: URL;
  readonly ifMatch: string | undefined;
  readonly body: unknown;
}

/**
 * The Registry boundary a published-extension lifecycle write addresses:
 * every request is recorded with the condition it carried and the document it
 * sent, and answered from `respond`. Nothing leaves the process, so the
 * recorded list is the complete account of what the run asked for — including
 * a refusal that happened before any request at all.
 */
export const makeRegistryManagementWorld = (
  respond: (request: RegistryManagementRequest, index: number) => Response,
) => {
  const requests: Array<RegistryManagementRequest> = [];
  const httpClient = HttpClient.make((request) =>
    Effect.sync(() => {
      const url = new URL(request.url);
      for (const [key, value] of request.urlParams) url.searchParams.append(key, value);
      const observed: RegistryManagementRequest = {
        method: request.method,
        url,
        ifMatch: request.headers["if-match"],
        body:
          request.body._tag === "Uint8Array"
            ? JSON.parse(new TextDecoder().decode(request.body.body))
            : undefined,
      };
      requests.push(observed);
      return HttpClientResponse.fromWeb(request, respond(observed, requests.length - 1));
    }),
  );
  const services = Layer.mergeAll(
    Layer.succeed(HttpClient.HttpClient, httpClient),
    RegistryUrlTest(testRegistryUrl),
  );
  return {
    requests,
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.provide(services)),
  };
};
