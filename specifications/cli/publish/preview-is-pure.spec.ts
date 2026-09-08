import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { handleRootPublish } from "axm.sh/specification-harness";

import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecWorkspace } from "../../support/install-harness.js";
import { probeFlag } from "../../support/parser-probe.js";
import {
  WORKSPACE_PROTECTED_STATE,
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../../support/preview-purity.js";
import {
  makeFileRegistry,
  makePublishLayer,
  publishArgs,
  writeAuthoredSkill,
} from "../../support/publish-harness.js";

export const specification = defineSpecification({
  requirement: "cli/publish/preview-is-pure",
  title: "Publish preview reports the admitted publication set without distributing anything",
  statement:
    "When publish runs in preview mode, AXM shall report the admitted publication set or identify missing exact-publication authorization with a next action for the same selection, without creating authorization, uploading anything to the target registry, or changing settings, the lockfile, or authored content.",
  class: "functional",
  role: "experience",
  goals: ["safe-repetition", "trustworthy-distribution"],
  methods: ["example"],
  derivedFrom: ["cli/publish/preview-is-pure-and-gate-is-fixed"],
  supersedes: ["cli/publish/preview-is-pure-and-gate-is-fixed"],
  assumptions: [],
  openQuestions: [],
});

/** Publish protects the workspace and the target registry it would upload to. */
const PUBLISH_PROTECTED_STATE = [...WORKSPACE_PROTECTED_STATE, "registry"];

describe("Publish preview purity", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  const authoredWorkspace = (fixture: { readonly withSkillMd?: boolean } = {}) => {
    const workspace = makeSpecWorkspace({
      machine: true,
      flags: { json: true },
      recordWrites: true,
      settings: { skills: { review: "workspace" } },
    });
    cleanups.push(workspace.cleanup);
    writeAuthoredSkill(workspace.root, { name: "review", ...fixture });
    const registry = makeFileRegistry(workspace.root);
    const before = snapshotProtectedState(workspace.root, PUBLISH_PROTECTED_STATE);
    workspace.writes.splice(0);
    workspace.rendererState.results.splice(0);
    return { workspace, registry, before };
  };

  it.effect("an unauthenticated preview directs the same selection to publication approval", () =>
    Effect.gen(function* () {
      const { workspace, before } = authoredWorkspace();
      const httpClient = HttpClient.make((request) => {
        if (request.method !== "GET") {
          return Effect.die(new Error("Preview must not create authority or upload"));
        }
        const ownerRead = new URL(request.url).pathname === "/v1/owners/@acme";
        return Effect.succeed(
          HttpClientResponse.fromWeb(
            request,
            new Response(
              JSON.stringify(
                ownerRead
                  ? { displayName: "Acme" }
                  : {
                      type: "about:blank",
                      title: "Not Found",
                      status: 404,
                      detail: "Extension not found",
                      code: "not_found",
                    },
              ),
              { status: ownerRead ? 200 : 404, headers: { "content-type": "application/json" } },
            ),
          ),
        );
      });

      const execution = yield* handleRootPublish(
        publishArgs("https://registry.example.test", {
          selectors: ["@acme/skills/review"],
          visibility: Option.some("private"),
        }),
      ).pipe(
        Effect.provide(
          Layer.merge(
            makePublishLayer(workspace),
            Layer.succeed(HttpClient.HttpClient, httpClient),
          ),
        ),
        Effect.exit,
      );

      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
        protectedPaths: PUBLISH_PROTECTED_STATE,
      });
      const output = workspace.rendererState.results[0]?.data;
      expect(output).toMatchObject({
        mode: "preview",
        publicationSet: { status: "unavailable" },
        execution: {
          status: "not-run",
          preconditions: [
            {
              status: "unmet",
              blockedOn: "human",
              label: "Publication authorization",
              detail:
                "Apply the same publish selection to request approval for this exact publication set.",
            },
          ],
        },
        counts: { selected: 1, published: 0 },
      });
      expect(JSON.stringify(output)).not.toContain("axm login");
      expect(Exit.isSuccess(execution)).toBe(true);
    }),
  );

  it.effect(
    "a preview reports the admitted publication set without uploading or changing state",
    () =>
      Effect.gen(function* () {
        const { workspace, registry, before } = authoredWorkspace();

        yield* handleRootPublish(
          publishArgs(registry.url, { selectors: ["@acme/skills/review"], preview: true }),
        ).pipe(Effect.provide(makePublishLayer(workspace)));

        expectProtectedStateUntouched({
          root: workspace.root,
          before,
          writes: workspace.writes,
          protectedPaths: PUBLISH_PROTECTED_STATE,
        });
        expect(registry.storedFiles()).toEqual([]);
        expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
        const [entry] = workspace.rendererState.results;
        expect(entry?.data).toMatchObject({
          contract: "publish-result-v3",
          mode: "preview",
          publicationSet: { status: "admitted" },
          execution: { status: "not-run" },
          counts: { selected: 1, published: 0 },
        });
      }),
  );

  it.effect("a preview that fails the fixed publication gate reports it and changes nothing", () =>
    Effect.gen(function* () {
      const { workspace, registry, before } = authoredWorkspace({ withSkillMd: false });

      const exit = yield* handleRootPublish(
        publishArgs(registry.url, { selectors: ["@acme/skills/review"], preview: true }),
      ).pipe(Effect.provide(makePublishLayer(workspace)), Effect.exit);

      expect(Exit.isFailure(exit)).toBe(true);
      expectProtectedStateUntouched({
        root: workspace.root,
        before,
        writes: workspace.writes,
        protectedPaths: PUBLISH_PROTECTED_STATE,
      });
      expect(registry.storedFiles()).toEqual([]);
      expect(workspace.resolvePlanState.confirmApplyChangesCalls).toEqual([]);
      const [entry] = workspace.rendererState.results;
      expect(entry?.ok).toBe(false);
      expect(entry?.data).toMatchObject({
        mode: "preview",
        publicationSet: { status: "unavailable", items: [] },
        execution: {
          status: "not-run",
          outcomes: [{ id: "@acme/skills/review", status: "failed", reason: "candidate_invalid" }],
        },
        counts: { selected: 1, published: 0, failed: 1 },
      });
    }),
  );

  it.effect("the route offers preview and rejects preapproval it cannot use", () =>
    Effect.gen(function* () {
      expect(yield* probeFlag(["publish"], "--preview")).toBe("accepted");
      expect(yield* probeFlag(["publish"], "--yes")).toBe("unrecognized");
      expect(yield* probeFlag(["publish"], "-y")).toBe("unrecognized");
    }),
  );
});
