/**
 * How deriving the repository visibility intent reads the workspace documents.
 *
 * The accepted canonical observation and the workspace publication default
 * read the same project settings and lockfile; one document phase reads each
 * of them once. The authored manifest stays a live read, the phase ends
 * before the Registry is asked anything, and a workspace that cannot declare
 * repository intent is refused before any document is read.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import {
  AuthClientTest,
  AuthLoginInteractionTest,
  AuthLoginPresenterTest,
  CredentialStoreTest,
} from "@agentxm/registry-access/testing";
import {
  RegistryClientFactoryTest,
  RegistryContextTest,
  testRegistryUrl,
} from "@agentxm/registry-client/testing";
import { FileSystemRecorder, layerRecordingFileSystem } from "@agentxm/test-support";
import { NativePlatformTest, workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { WorkspaceFileWriteLocksLive } from "@agentxm/workspace-kernel/settlement/live";
import { layer as WorkspaceStateLayer } from "@agentxm/workspace-kernel/workspace-state/live";
import { describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Tracer from "effect/Tracer";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import { afterEach } from "vitest";

import { reconcile, status } from "./visibility.js";
import { jsonRegistryResponse, observedRevision, registryTarget } from "../test-helpers.js";
import {
  makeVisibilityWorld,
  visibilityEvaluation,
  visibilityIntent,
  type VisibilityRequest,
  type VisibilityWorldOptions,
} from "../visibility/test-helpers.js";

const isObservationPhase = (span: Tracer.NativeSpan) => span.name === "axm.observation.phase";

describe("Repository visibility intent document reads", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  /**
   * Run one visibility operation over a project workspace whose production
   * workspace-state services read through the recorded filesystem, against a
   * Registry that answers with `evaluation`. Document work is counted, and
   * so are the read phases still open when each Registry request is sent.
   */
  const measured = <A, E, R>(
    operation: Effect.Effect<A, E, R>,
    options: VisibilityWorldOptions & {
      readonly evaluation: ReturnType<typeof visibilityEvaluation>;
      readonly target?: string;
    },
  ) => {
    const target = options.target ?? registryTarget;
    const spans: Array<Tracer.NativeSpan> = [];
    const phasesOpenAtRequest: Array<number> = [];
    // The visibility world supplies the authored workspace on disk.
    const world = makeVisibilityWorld(() => jsonRegistryResponse(null), options);
    cleanups.push(world.cleanup);
    const home = fs.realpathSync(
      fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-visibility-reads-home-")),
    );
    cleanups.push(() => fs.rmSync(home, { recursive: true, force: true }));

    const requests: Array<VisibilityRequest> = [];
    const transport = HttpClient.make((request) =>
      Effect.sync(() => {
        phasesOpenAtRequest.push(
          spans.filter((span) => isObservationPhase(span) && span.status._tag === "Started").length,
        );
        const url = new URL(request.url);
        for (const [key, value] of request.urlParams)
          url.searchParams.append(key, Redacted.isRedacted(value) ? Redacted.value(value) : value);
        requests.push({
          method: request.method,
          url,
          ifMatch: request.headers["if-match"],
          body:
            request.body._tag === "Uint8Array"
              ? JSON.parse(new TextDecoder().decode(request.body.body))
              : undefined,
        });
        return HttpClientResponse.fromWeb(
          request,
          request.method === "GET"
            ? jsonRegistryResponse({ ...options.evaluation, target })
            : jsonRegistryResponse({
                target,
                before: "public",
                after: "private",
                authority: {
                  kind: "repository",
                  source: "manifest",
                  fingerprint: visibilityIntent("manifest", "private").fingerprint,
                },
                result: "changed",
                revision: "opaque-new-revision",
              }),
        );
      }),
    );
    // The recorded filesystem replaces the native one beneath every service.
    const platform = Layer.provideMerge(
      layerRecordingFileSystem(NativePlatformTest),
      NativePlatformTest,
    );
    const services = Layer.provideMerge(
      Layer.mergeAll(
        WorkspaceStateLayer({
          scope: "project",
          projectRoot: decodeAbsolutePathSync(world.root),
        }).pipe(
          Layer.provideMerge(
            RegistryClientFactoryTest(Layer.succeed(HttpClient.HttpClient, transport)),
          ),
        ),
        AuthClientTest(),
        AuthLoginInteractionTest().layer,
        AuthLoginPresenterTest().layer,
        CredentialStoreTest(),
        RegistryContextTest(testRegistryUrl),
        Layer.succeed(HttpClient.HttpClient, transport),
      ),
      Layer.merge(
        Layer.provideMerge(WorkspaceFileWriteLocksLive, platform),
        ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home } })),
      ),
    );
    const tracer = Tracer.make({
      span(spanOptions) {
        const span = new Tracer.NativeSpan(spanOptions);
        spans.push(span);
        return span;
      },
    });
    return Effect.gen(function* () {
      const recording = yield* FileSystemRecorder;
      // Layer construction reads the workspace root; only the operation is measured.
      recording.reset();
      const observations = workObservations(false);
      const exit = yield* operation.pipe(
        observations.provide,
        Effect.withTracer(tracer),
        Effect.exit,
      );
      const kinds = observations.facts.map((fact) => fact.kind);
      const manifest = recording.counts(
        nodePath.join(world.root, "skills", "review", "skill.json"),
      );
      return {
        exit,
        documents: {
          settingsReads: recording.contentReads(nodePath.join(world.root, "axm.json")),
          settingsParses: kinds.filter((kind) => kind === "axm.parse.settings").length,
          lockfileReads: recording.contentReads(nodePath.join(world.root, "axm.lock")),
          lockfileParses: kinds.filter((kind) => kind === "axm.parse.lockfile").length,
          manifestReads: manifest.readFile ?? 0,
          manifestAccess: manifest.access ?? 0,
          phases: spans.filter(isObservationPhase).length,
        },
        phasesOpenAtRequest,
        requests,
      };
    }).pipe(Effect.provide(services));
  };

  it.effect("status reads the project settings and lockfile once for a declared package", () =>
    Effect.gen(function* () {
      const run = yield* measured(status(registryTarget), {
        manifest: "private",
        workspace: "public",
        evaluation: visibilityEvaluation(visibilityIntent("manifest", "private")),
      });
      expect(Exit.isSuccess(run.exit)).toBe(true);
      expect(run.requests[0]?.url.searchParams.get("intentSource")).toBe("manifest");
      expect(run.documents).toEqual({
        settingsReads: 1,
        settingsParses: 1,
        lockfileReads: 1,
        lockfileParses: 1,
        manifestReads: 1,
        manifestAccess: 0,
        phases: 1,
      });
      // The phase has ended before the Registry is asked for its evaluation.
      expect(run.phasesOpenAtRequest).toEqual([0]);
    }),
  );

  it.effect("reconcile reads the documents once and asks the Registry after the phase", () =>
    Effect.gen(function* () {
      const run = yield* measured(reconcile({ target: registryTarget }), {
        manifest: "private",
        workspace: "public",
        evaluation: visibilityEvaluation(visibilityIntent("manifest", "private")),
      });
      expect(Exit.isSuccess(run.exit)).toBe(true);
      expect(run.requests.map(({ method }) => method)).toEqual(["GET", "PATCH"]);
      expect(run.requests[1]).toMatchObject({
        ifMatch: observedRevision,
        body: { visibility: "private", authority: { kind: "repository", source: "manifest" } },
      });
      expect(run.documents).toMatchObject({
        settingsReads: 1,
        settingsParses: 1,
        lockfileReads: 1,
        lockfileParses: 1,
        phases: 1,
      });
      expect(run.phasesOpenAtRequest).toEqual([0, 0]);
    }),
  );

  it.effect("status reads the documents once for an undeclared target", () =>
    Effect.gen(function* () {
      const target = "@acme/skills/absent";
      const run = yield* measured(status(target), {
        workspace: "private",
        target,
        evaluation: visibilityEvaluation(visibilityIntent("workspace", "private")),
      });
      expect(Exit.isSuccess(run.exit)).toBe(true);
      expect(run.requests[0]?.url.searchParams.get("intentSource")).toBe("workspace");
      expect(run.documents).toEqual({
        settingsReads: 1,
        settingsParses: 1,
        lockfileReads: 1,
        lockfileParses: 1,
        manifestReads: 0,
        manifestAccess: 0,
        phases: 1,
      });
      expect(run.phasesOpenAtRequest).toEqual([0]);
    }),
  );

  it.effect(
    "status reads the documents once when neither manifest nor settings declare visibility",
    () =>
      Effect.gen(function* () {
        const run = yield* measured(status(registryTarget), {
          evaluation: visibilityEvaluation(null),
        });
        expect(Exit.isSuccess(run.exit)).toBe(true);
        expect(Object.fromEntries(run.requests[0]?.url.searchParams ?? [])).toEqual({});
        expect(run.documents).toEqual({
          settingsReads: 1,
          settingsParses: 1,
          lockfileReads: 1,
          lockfileParses: 1,
          manifestReads: 1,
          manifestAccess: 0,
          phases: 1,
        });
        expect(run.phasesOpenAtRequest).toEqual([0]);
      }),
  );

  it.effect("a later status observes settings and manifest changes made after an earlier one", () =>
    Effect.gen(function* () {
      const world = makeVisibilityWorld(
        (request) =>
          jsonRegistryResponse(
            visibilityEvaluation(
              request.url.searchParams.get("intentSource") === "manifest"
                ? visibilityIntent("manifest", "public")
                : visibilityIntent("workspace", "private"),
            ),
          ),
        { workspace: "public" },
      );
      cleanups.push(world.cleanup);
      const intentOf = (index: number) =>
        Object.fromEntries(world.requests[index]?.url.searchParams ?? []);

      yield* world.provide(
        Effect.gen(function* () {
          yield* status(registryTarget);
          const settingsPath = nodePath.join(world.root, "axm.json");
          fs.writeFileSync(
            settingsPath,
            fs
              .readFileSync(settingsPath, "utf8")
              .replace('"defaultVisibility": "public"', '"defaultVisibility": "private"'),
          );
          yield* status(registryTarget);
          fs.writeFileSync(
            nodePath.join(world.root, "skills", "review", "skill.json"),
            JSON.stringify({
              owner: "@acme",
              type: "skill",
              name: "review",
              version: "1.0.0",
              publish: { visibility: "public" },
            }),
          );
          yield* status(registryTarget);
        }),
      );

      expect([intentOf(0), intentOf(1), intentOf(2)]).toEqual([
        {
          intentVisibility: "public",
          intentSource: "workspace",
          intentFingerprint: visibilityIntent("workspace", "public").fingerprint,
        },
        {
          intentVisibility: "private",
          intentSource: "workspace",
          intentFingerprint: visibilityIntent("workspace", "private").fingerprint,
        },
        {
          intentVisibility: "public",
          intentSource: "manifest",
          intentFingerprint: visibilityIntent("manifest", "public").fingerprint,
        },
      ]);
    }),
  );

  it.effect("a user workspace is refused before any document is read", () =>
    Effect.gen(function* () {
      const world = makeVisibilityWorld(() => jsonRegistryResponse(visibilityEvaluation(null)), {
        scope: "user",
      });
      cleanups.push(world.cleanup);
      const spans: Array<Tracer.NativeSpan> = [];
      const tracer = Tracer.make({
        span(spanOptions) {
          const span = new Tracer.NativeSpan(spanOptions);
          spans.push(span);
          return span;
        },
      });
      const observations = workObservations(false);
      const exit = yield* world.provide(
        status(registryTarget).pipe(observations.provide, Effect.withTracer(tracer), Effect.exit),
      );
      expect(exit).toMatchObject({
        _tag: "Failure",
        cause: {
          reasons: [
            {
              error: {
                detail: "Repository visibility can be configured only for project workspaces.",
              },
            },
          ],
        },
      });
      expect(world.requests).toHaveLength(0);
      const kinds = observations.facts.map((fact) => fact.kind);
      expect({
        settingsParses: kinds.filter((kind) => kind === "axm.parse.settings").length,
        lockfileParses: kinds.filter((kind) => kind === "axm.parse.lockfile").length,
        phases: spans.filter(isObservationPhase).length,
      }).toEqual({ settingsParses: 0, lockfileParses: 0, phases: 0 });
    }),
  );
});
