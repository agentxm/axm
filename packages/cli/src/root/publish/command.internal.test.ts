import { startedUnits } from "../../screen/index.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeHttp from "node:http";
import { pathToFileURL } from "node:url";
import { type CreatePublishAuthorizationRequestParams } from "@agentxm/registry-auth";
import { AuthClientTest, DeviceLoginInteractionTest } from "@agentxm/registry-auth/testing";
import {
  CommandSemanticPropertiesLive,
  getCommandSemanticProperties,
  isEffectCliExit,
} from "../../cli-runtime/index.js";
import { StepFailure, renderConfirmationRecoveryCommand } from "@agentxm/workspace-operations";
import {
  extensionTypes,
  extensionTypeToPlural,
  formatFqn,
} from "@agentxm/extension-model/unstable/extensions";
import { applyPlan, type JobStepResult } from "@agentxm/workspace-operations";
import {
  archiveSha256Hex,
  publicationDescriptorDigest,
  publicationSetDigest,
} from "@agentxm/registry-protocol/unstable/registry";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { makeAppError } from "../../app-error/index.js";
import { RegistryAuthFailed } from "@agentxm/registry-auth";
import { GitDirectoryComparisonLive } from "@agentxm/extension-sources/live";

import {
  at,
  expectPublishResult,
  expectRecord,
  getAppError,
  makeEffectProvide,
  makeWorkspaceHandlerTestContext,
  property,
} from "../../test-helpers.js";
import { exactVersion, extensionName, handle, versionRange } from "../../test-stubs.js";
import { emitPublishResult, type PublishResultItem } from "./result.js";
import {
  buildPublishJobs,
  exactPublishUploadBinding,
  findPackPublishDivergenceFindings,
  isPublishableType,
  previewPublishUploadBinding,
  publishAuthenticationPreconditions,
  publishRecoverySelection,
  validatePublishOwners,
  PUBLISHABLE_TYPES,
} from "@agentxm/extension-publish";
import {
  aggregatePublishFailure,
  handleRootPublish,
  makeExactPublishRecovery,
  publicPublishCause,
  type RootPublishHandlerArgs,
} from "./command.js";

describe("pack publish resolution divergence", () => {
  const packCandidate = {
    fqn: "@acme/packs/reviewers",
    type: "pack" as const,
    authored: true,
    version: exactVersion("0.1.1"),
    dependencies: { "@acme/skills/review": versionRange("^0.0.4") },
  };
  const reachability = [
    {
      packFqn: "@acme/packs/reviewers",
      packAuthority: "workspace" as const,
      manifestPath: "packs/reviewers/pack.json",
      memberFqn: "@acme/skills/review",
      constraint: "^0.0.4",
      memberVersion: "0.0.5",
      memberAuthority: "workspace" as const,
      classification: "satisfying" as const,
    },
  ];

  it("does not warn when effective versions agree or the pack is not authored here", () => {
    const admittedPack = {
      target: {
        owner: handle("@acme"),
        type: "pack" as const,
        name: extensionName("reviewers"),
        version: exactVersion("0.1.1"),
      },
      status: "admitted" as const,
      findings: [],
      resolutions: [
        {
          dependency: {
            owner: handle("@acme"),
            type: "skill" as const,
            name: extensionName("review"),
            range: versionRange("^0.0.4"),
          },
          effectiveVersion: exactVersion("0.0.5"),
        },
      ],
    };
    expect(
      findPackPublishDivergenceFindings({
        candidates: [packCandidate],
        reachability,
        packs: [admittedPack],
      }).size,
    ).toBe(0);
    expect(
      findPackPublishDivergenceFindings({
        candidates: [{ ...packCandidate, authored: false }],
        reachability,
        packs: [
          {
            ...admittedPack,
            resolutions: [
              {
                dependency: {
                  owner: handle("@acme"),
                  type: "skill",
                  name: extensionName("review"),
                  range: versionRange("^0.0.4"),
                },
                effectiveVersion: exactVersion("0.0.4"),
              },
            ],
          },
        ],
      }).size,
    ).toBe(0);
  });
});

const args = (
  registryUrl: string,
  overrides?: Partial<RootPublishHandlerArgs>,
): RootPublishHandlerArgs => ({
  selectors: [],
  owners: [],
  types: [],
  excludes: [],
  registry: Option.none(),
  registryUrl: Option.some(registryUrl),
  onExisting: Option.none(),
  backfill: false,
  acceptWarnings: false,
  preview: true,
  scope: "project",
  visibility: Option.none(),
  includeDependencies: false,
  ...overrides,
});

describe("root publish", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axm-root-publish-test-"));
    fs.mkdirSync(path.join(tempDir, ".axm"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "registry"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, "axm.json"),
      JSON.stringify({ owner: "@acme", agents: [] }),
    );
    fs.writeFileSync(path.join(tempDir, "axm-lock.yaml"), "lockfileVersion: 7\nskills: {}\n");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeContext = (machine = true) => {
    const context = makeWorkspaceHandlerTestContext({
      machine,
      wsOptions: { projectRoot: tempDir },
    });
    const interaction = DeviceLoginInteractionTest();
    const gitDirectoryComparisonLayer = Layer.provide(
      GitDirectoryComparisonLive,
      context.fullLayer,
    );
    return {
      ...context,
      provide: makeEffectProvide(
        Layer.mergeAll(
          context.fullLayer,
          AuthClientTest(),
          interaction.layer,
          gitDirectoryComparisonLayer,
        ),
      ),
    };
  };

  const writeReviewSkill = () => {
    fs.writeFileSync(
      path.join(tempDir, "axm.json"),
      JSON.stringify({
        owner: "@acme",
        agents: [],
        skills: { review: "workspace" },
      }),
    );
    const skillDir = path.join(tempDir, "skills", "review");
    fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "skill.json"),
      JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" }),
    );
    fs.writeFileSync(
      path.join(skillDir, "src", "SKILL.md"),
      "---\nname: review\ndescription: Review code\n---\n\n# Review\n",
    );
  };

  const scheduleCallback = (url: string) => {
    setTimeout(() => {
      const request = NodeHttp.get(url, (response) => response.resume());
      request.on("error", () => undefined);
    }, 10);
  };

  it("reports authentication as a human-blocked preview precondition only when needed", () => {
    expect(
      publishAuthenticationPreconditions({
        preview: true,
        remoteRegistry: true,
        authenticated: false,
        hasPublishCandidates: true,
      }),
    ).toEqual([
      {
        id: "authentication",
        label: "Registry authentication",
        status: "unmet",
        detail:
          "Publishing requires human authorization before apply; authenticate before preparing a release workflow.",
        blockedOn: "human",
        command: "axm login --device-code --json",
      },
    ]);

    expect(
      [
        { preview: false, remoteRegistry: true, authenticated: false },
        { preview: true, remoteRegistry: false, authenticated: false },
        { preview: true, remoteRegistry: true, authenticated: true },
      ].map((options) =>
        publishAuthenticationPreconditions({ ...options, hasPublishCandidates: true }),
      ),
    ).toEqual([[], [], []]);
  });

  it("maps the browser-reviewed exact binding into the upload request", () => {
    const publicationSetDigestValue = archiveSha256Hex(new TextEncoder().encode("set"));
    const publicationDescriptorDigestValue = archiveSha256Hex(
      new TextEncoder().encode("descriptor"),
    );
    const baseCapability = {
      accessToken: "axm_pub_capability",
      expiresAt: DateTime.makeUnsafe("2099-01-01T00:15:00.000Z"),
      scope: "extensions:publish:new",
      publishRequestId: "pubreq_test",
      visibilityContract: "v2" as const,
      condition: '"pv2-reviewed"',
      publicationSetDigest: publicationSetDigestValue,
      publicationDescriptorDigest: publicationDescriptorDigestValue,
    };

    expect(
      exactPublishUploadBinding(
        {
          ...baseCapability,
          visibility: {
            value: "private",
            disposition: "establish",
            source: "explicit",
          },
        },
        { intent: null, request: "private" },
      ),
    ).toEqual({
      accessToken: "axm_pub_capability",
      condition: '"pv2-reviewed"',
      visibility: { value: "private", disposition: "establish", source: "explicit" },
      visibilityInput: { intent: null, request: "private" },
      publicationSetDigest: publicationSetDigestValue,
      publicationDescriptorDigest: publicationDescriptorDigestValue,
    });

    for (const visibility of [
      { value: "private", disposition: "establish", source: "account" },
      { value: "private", disposition: "preserve", source: "existing" },
    ] as const) {
      expect(
        exactPublishUploadBinding(
          { ...baseCapability, visibility },
          { intent: null, request: null },
        ),
      ).toEqual({
        accessToken: "axm_pub_capability",
        condition: '"pv2-reviewed"',
        ...(visibility.disposition === "establish" ? { visibility } : {}),
        publicationSetDigest: publicationSetDigestValue,
        publicationDescriptorDigest: publicationDescriptorDigestValue,
        visibilityInput: { intent: null, request: null },
      });
    }

    expect(
      previewPublishUploadBinding({
        condition: '"pv2-existing"',
        publicationSetDigest: publicationSetDigestValue,
        publicationDescriptorDigest: publicationDescriptorDigestValue,
        visibility: { value: "public", disposition: "preserve", source: "existing" },
        visibilityInput: { intent: null, request: null },
      }),
    ).toEqual({
      condition: '"pv2-existing"',
      publicationSetDigest: publicationSetDigestValue,
      publicationDescriptorDigest: publicationDescriptorDigestValue,
      visibilityInput: { intent: null, request: null },
    });
    expect(
      previewPublishUploadBinding({
        condition: '"pv2-explicit"',
        publicationSetDigest: publicationSetDigestValue,
        publicationDescriptorDigest: publicationDescriptorDigestValue,
        visibility: { value: "private", disposition: "establish", source: "explicit" },
        visibilityInput: { intent: null, request: "private" },
      }),
    ).toEqual({
      condition: '"pv2-explicit"',
      visibility: { value: "private", disposition: "establish", source: "explicit" },
      publicationSetDigest: publicationSetDigestValue,
      publicationDescriptorDigest: publicationDescriptorDigestValue,
      visibilityInput: { intent: null, request: "private" },
    });
  });

  it.effect("does not create exact authority during an unauthenticated preview", () => {
    writeReviewSkill();
    const context = makeWorkspaceHandlerTestContext({
      machine: true,
      wsOptions: { projectRoot: tempDir },
    });
    let authorizationRequests = 0;
    const httpClient = HttpClient.make((request) =>
      Effect.sync(() => {
        const url = new URL(request.url);
        if (request.method === "GET" && url.pathname === "/v1/owners/@acme") {
          return HttpClientResponse.fromWeb(
            request,
            new Response(JSON.stringify({ displayName: "Acme" }), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
          );
        }
        return HttpClientResponse.fromWeb(
          request,
          new Response(
            JSON.stringify({
              type: "about:blank",
              title: "Not Found",
              status: 404,
              detail: "Extension not found",
              code: "not_found",
            }),
            { status: 404, headers: { "content-type": "application/json" } },
          ),
        );
      }),
    );
    const authClient = AuthClientTest({
      createPublishAuthorizationRequest: () => {
        authorizationRequests += 1;
        return Effect.fail(
          new RegistryAuthFailed({
            category: "internal",
            detail: "Preview must not create publish authority",
          }),
        );
      },
    });
    const provide = makeEffectProvide(
      Layer.mergeAll(
        context.fullLayer,
        authClient,
        DeviceLoginInteractionTest().layer,
        Layer.succeed(HttpClient.HttpClient, httpClient),
        Layer.provide(GitDirectoryComparisonLive, context.fullLayer),
      ),
    );

    return provide(
      Effect.gen(function* () {
        yield* handleRootPublish(
          args("https://registry.example.com", { visibility: Option.some("private") }),
        );

        expect(authorizationRequests).toBe(0);
        const result = expectPublishResult(at(context.rendererState.results, 0).data, {
          mode: "preview",
          count: 1,
        });
        const preconditions = property(
          expectRecord(property(result, "execution")),
          "preconditions",
        );
        if (!Array.isArray(preconditions)) throw new Error("Expected preview preconditions");
        expect(expectRecord(at(preconditions, 0))).toMatchObject({
          id: "authentication",
          status: "unmet",
        });
      }),
    );
  });

  it.effect("aborts before upload when material changes during exact authorization", () => {
    writeReviewSkill();
    const context = makeWorkspaceHandlerTestContext({
      machine: true,
      wsOptions: { projectRoot: tempDir },
    });
    const registryUrl = "https://registry.example.com";
    let authorizationRequest: CreatePublishAuthorizationRequestParams | undefined;
    let uploadCount = 0;
    let revokeCount = 0;
    const httpClient = HttpClient.make((request) =>
      Effect.sync(() => {
        const url = new URL(request.url);
        if (request.method === "GET" && url.pathname === "/v1/owners/@acme") {
          return HttpClientResponse.fromWeb(
            request,
            new Response(JSON.stringify({ displayName: "Acme" }), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
          );
        }
        if (request.method === "PUT") uploadCount += 1;
        return HttpClientResponse.fromWeb(
          request,
          new Response(
            JSON.stringify({
              type: "about:blank",
              title: "Not Found",
              status: 404,
              detail: "Extension not found",
              code: "not_found",
            }),
            { status: 404, headers: { "content-type": "application/json" } },
          ),
        );
      }),
    );
    const authClient = AuthClientTest({
      createPublishAuthorizationRequest: (request) => {
        authorizationRequest = request;
        return Effect.succeed({
          requestId: "pubreq_stale",
          authorizationUrl: "https://agentxm.ai/publish/authorize/pubreq_stale",
          expiresAt: DateTime.makeUnsafe("2099-01-01T00:10:00.000Z"),
        });
      },
      exchangePublishAuthorizationCode: () =>
        Effect.gen(function* () {
          const request = authorizationRequest;
          if (request === undefined) {
            return yield* new RegistryAuthFailed({
              category: "internal",
              detail: "Missing auth request",
            });
          }
          const descriptor = request.publicationSet.candidates[0];
          if (descriptor === undefined) {
            return yield* new RegistryAuthFailed({
              category: "internal",
              detail: "Missing descriptor",
            });
          }
          const setDigest = publicationSetDigest(request.publicationSet.candidates);
          return {
            status: "admitted" as const,
            preview: {
              contract: "publication-set-v2" as const,
              publicationSetDigest: setDigest,
              status: "admitted" as const,
              candidates: [
                {
                  kind: "resolved" as const,
                  target: descriptor.target,
                  participation: descriptor.participation,
                  descriptorDigest: publicationDescriptorDigest(descriptor),
                  visibility: {
                    target: formatFqn(descriptor.target),
                    intent: descriptor.visibility.intent,
                    request: descriptor.visibility.request,
                    resolved: {
                      value: "public" as const,
                      disposition: "establish" as const,
                      source: "platform" as const,
                    },
                    actual: null,
                    comparison: "not-established" as const,
                    findings: [],
                  },
                  condition: '"pv2-stale"',
                },
              ],
              packs: [],
            },
            grants: [
              {
                accessToken: "axm_pub_stale",
                expiresAt: DateTime.makeUnsafe("2099-01-01T00:15:00.000Z"),
                scope: "extensions:publish:new",
                publishRequestId: "pubreq_stale",
                visibilityContract: "v2" as const,
                visibility: {
                  value: "public" as const,
                  disposition: "establish" as const,
                  source: "platform" as const,
                },
                condition: '"pv2-stale"',
                publicationSetDigest: setDigest,
                publicationDescriptorDigest: publicationDescriptorDigest(descriptor),
              },
            ],
          };
        }),
      revokeToken: () =>
        Effect.sync(() => {
          revokeCount += 1;
        }),
    });
    const interaction = DeviceLoginInteractionTest({
      openBrowser: () =>
        Effect.sync(() => {
          const request = authorizationRequest;
          if (request === undefined) return false;
          fs.appendFileSync(
            path.join(tempDir, "skills", "review", "src", "SKILL.md"),
            "\nChanged during authorization.\n",
          );
          const callback = new URL(request.redirectUri);
          callback.searchParams.set("code", "axm_pubac_code");
          callback.searchParams.set("state", request.state);
          callback.searchParams.set("iss", "https://agentxm.ai");
          scheduleCallback(callback.href);
          return true;
        }),
    });
    const provide = makeEffectProvide(
      Layer.mergeAll(
        context.fullLayer,
        authClient,
        interaction.layer,
        Layer.succeed(HttpClient.HttpClient, httpClient),
        Layer.provide(GitDirectoryComparisonLive, context.fullLayer),
      ),
    );

    return provide(
      Effect.gen(function* () {
        const exit = yield* handleRootPublish(args(registryUrl, { preview: false })).pipe(
          Effect.exit,
        );
        expect(Exit.isFailure(exit)).toBe(true);
        expect(uploadCount).toBe(0);
        expect(revokeCount).toBe(1);

        const result = expectPublishResult(at(context.rendererState.results, 0).data, {
          mode: "apply",
          count: 1,
        });
        const execution = expectRecord(property(result, "execution"));
        expect(expectRecord(property(execution, "failure"))).toMatchObject({
          code: "conflict",
          message: expect.stringContaining("changed after authorization"),
        });
        const outcomes = property(execution, "outcomes");
        if (!Array.isArray(outcomes)) throw new Error("Expected publish outcomes");
        expect(expectRecord(at(outcomes, 0))).toMatchObject({
          status: "blocked",
          reason: "stale_material",
        });
      }),
    );
  });

  it.effect(
    "validates each unique publish owner and links missing owners to organization creation",
    () =>
      Effect.gen(function* () {
        const checked: Array<string> = [];
        const client = {
          ownerExists: (owner: ReturnType<typeof handle>) => {
            checked.push(owner);
            return Effect.succeed({ exists: owner !== "@missing" });
          },
        };

        const error = yield* Effect.flip(
          validatePublishOwners([handle("@acme"), handle("@acme"), handle("@missing")], client),
        );

        expect(checked.sort()).toEqual(["@acme", "@missing"]);
        expect(error.category).toBe("not_found");
        expect(error.detail).toContain("@missing");
        expect(error.suggestions).toEqual([
          {
            description: "Create the organization in AgentXM before publishing.",
            url: "https://agentxm.ai/orgs/new",
          },
        ]);
      }),
  );

  describe("human output", () => {
    it.effect("renders the published FQN and version after a successful apply", () => {
      writeReviewSkill();
      const { provide, logs, rendererState } = makeContext(false);
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          yield* handleRootPublish(args(registryUrl, { preview: false }));

          expect(
            logs.success.some((message) =>
              message.startsWith("Published @acme/skills/review@1.0.0"),
            ),
          ).toBe(true);
          expect(logs.success.join("\n")).toContain(
            "visibility: public (set from platform defaults)",
          );
          expect(startedUnits(rendererState)).toContain("publish registry");
          expect(startedUnits(rendererState)).toContain("publish candidates");
          // The apply phase reaches the observer as a typed lifecycle event.
          expect(
            rendererState.events.some(
              (event) => event._tag === "PhaseStarted" && event.phase === "apply",
            ),
          ).toBe(true);
        }),
      );
    });

    it.effect("renders an honest preview without claiming the extension was published", () => {
      writeReviewSkill();
      const { provide, logs } = makeContext(false);
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          yield* handleRootPublish(args(registryUrl));

          expect(
            logs.success.some((message) =>
              message.startsWith("Would publish @acme/skills/review@1.0.0"),
            ),
          ).toBe(true);
          expect(logs.success.join("\n")).toContain(
            "visibility: public (set from platform defaults)",
          );
          expect(logs.success.some((message) => message.startsWith("Published "))).toBe(false);
        }),
      );
    });

    it.effect("renders an explicit empty-selection outcome", () => {
      const { provide, logs } = makeContext(false);
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          yield* handleRootPublish(args(registryUrl, { preview: false }));

          expect(logs.success).toContain("No extensions selected for publishing");
        }),
      );
    });

    it.effect("surfaces the registry URL and browser suggestion", () => {
      const { provide, logs, rendererState } = makeContext(false);

      return provide(
        Effect.gen(function* () {
          yield* emitPublishResult("publish", {
            mode: "apply",
            results: [
              {
                id: "@acme/skills/review",
                owner: handle("@acme"),
                type: "skill",
                name: extensionName("review"),
                version: exactVersion("1.0.0"),
                action: "publish",
                phase: "upload_execution",
                status: "success",
                reason: "selected",
                links: { html: "https://agentxm.ai/acme/skills/review" },
              },
            ],
          });

          expect(logs.success).toContain(
            "Published @acme/skills/review@1.0.0\nhttps://agentxm.ai/acme/skills/review",
          );
          expect(rendererState.suggestions).toContainEqual({
            description: "View in browser",
            url: "https://agentxm.ai/acme/skills/review",
          });
        }),
      );
    });

    it.effect("renders retryable upload evidence and an exact continuation", () => {
      const { provide, logs, rendererState } = makeContext(false);
      const retryableCause = publicPublishCause(
        makeAppError({
          code: "unavailable",
          detail: "Registry upload is temporarily unavailable.",
          metadata: {
            response: { status: 503, requestId: "req_retry" },
            requestPolicy: {
              retryable: true,
              attemptCount: 1,
              maxAttempts: 1,
              exhausted: true,
              stoppedBy: "replay-unsafe",
              replaySafety: "mutation",
            },
          },
        }),
      );

      return provide(
        Effect.gen(function* () {
          yield* emitPublishResult("publish", {
            mode: "apply",
            results: [
              {
                id: "@acme/skills/review",
                owner: handle("@acme"),
                type: "skill",
                name: extensionName("review"),
                version: exactVersion("1.0.0"),
                action: "error",
                phase: "upload_execution",
                status: "failed",
                reason: "upload_failed",
                message: "Registry upload is temporarily unavailable.",
                cause: retryableCause,
              },
            ],
            recovery: {
              description: "Continue the failed items and their blocked dependents",
              cmd: "axm publish --on-existing verify @acme/skills/review",
              remainingItems: ["@acme/skills/review"],
              blockedDependents: [],
            },
          });

          expect(logs.error).toContain("Publish failed for @acme/skills/review@1.0.0");
          expect(logs.info.join("\n")).toContain("retryable; attempts exhausted: 1/1");
          expect(
            rendererState.suggestions.some(
              (suggestion) =>
                suggestion.cmd === "axm publish --on-existing verify @acme/skills/review",
            ),
          ).toBe(true);
        }),
      );
    });
  });

  describe("existing version policy", () => {
    const writeSkill = (name: string, version: string) => {
      const skillDir = path.join(tempDir, "skills", name);
      fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "skill.json"),
        JSON.stringify({ owner: "@acme", type: "skill", name, version }),
      );
      fs.writeFileSync(
        path.join(skillDir, "src", "SKILL.md"),
        `---\nname: ${name}\ndescription: Review code\n---\n\n# ${name}\n`,
      );
    };

    const writeSkillSettings = (names: ReadonlyArray<string>) => {
      fs.writeFileSync(
        path.join(tempDir, "axm.json"),
        JSON.stringify({
          owner: "@acme",
          agents: [],
          skills: Object.fromEntries(names.map((name) => [name, "workspace"])),
        }),
      );
      for (const name of names) writeSkill(name, "1.0.0");
    };

    it.effect("publishes one new version while verifying nineteen existing versions", () => {
      const existing = Array.from({ length: 19 }, (_, index) => `existing-${index + 1}`);
      writeSkillSettings(["new-release", ...existing]);
      const { provide, rendererState } = makeContext(false);
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          yield* handleRootPublish(args(registryUrl, { preview: false }));
          writeSkill("new-release", "1.1.0");
          yield* handleRootPublish(args(registryUrl, { preview: false }));

          const result = expectPublishResult(at(rendererState.results, 1).data, {
            mode: "apply",
            count: 20,
          });
          const counts = expectRecord(property(result, "counts"));
          expect(counts).toMatchObject({
            selected: 20,
            published: 1,
            alreadyPublished: 19,
            blocked: 0,
            failed: 0,
          });
        }),
      );
    });
  });

  describe("publish safety gates", () => {
    const skillDir = () => path.join(tempDir, "skills", "review");

    const writeReviewSkill = (version: string) => {
      fs.mkdirSync(path.join(skillDir(), "src"), { recursive: true });
      fs.writeFileSync(
        path.join(skillDir(), "skill.json"),
        JSON.stringify({ owner: "@acme", type: "skill", name: "review", version }),
      );
      fs.writeFileSync(
        path.join(skillDir(), "src", "SKILL.md"),
        "---\nname: review\ndescription: Review code\n---\n\n# Review\n",
      );
      fs.writeFileSync(
        path.join(tempDir, "axm.json"),
        JSON.stringify({
          owner: "@acme",
          agents: [],
          skills: { review: "workspace" },
        }),
      );
    };

    const explicit = (registryUrl: string, overrides?: Partial<RootPublishHandlerArgs>) =>
      args(registryUrl, {
        selectors: ["@acme/skills/review"],
        preview: false,
        ...overrides,
      });

    describe("version monotonicity", () => {
      it.effect("rejects a version below the highest published version", () => {
        const { provide } = makeContext(false);
        const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

        return provide(
          Effect.gen(function* () {
            writeReviewSkill("1.1.0");
            yield* handleRootPublish(args(registryUrl, { preview: false }));

            writeReviewSkill("1.0.5");
            const error = getAppError(
              yield* handleRootPublish(explicit(registryUrl)).pipe(Effect.flip),
            );

            expect(error.code).toBe("conflict");
            expect(error.detail).toContain("lower than the highest published version 1.1.0");
            const suggestions = error.suggestions ?? [];
            expect(
              suggestions.some(
                (suggestion) => suggestion.cmd === "axm version @acme/skills/review patch",
              ),
            ).toBe(true);
            expect(
              suggestions.some((suggestion) => suggestion.description.includes("--backfill")),
            ).toBe(true);
          }),
        );
      });
    });
  });

  describe("result versions", () => {
    const writeExternallySourcedExtensions = () => {
      fs.writeFileSync(
        path.join(tempDir, "axm.json"),
        JSON.stringify({
          owner: "@acme",
          agents: [],
          skills: { review: "@acme/skills/review@^1" },
          mcpServers: { review: "@acme/mcps/review@^1" },
          subagents: { review: "@acme/subagents/review@^1" },
          rules: { review: "@acme/rules/review@^1" },
          hooks: { review: "@acme/hooks/review@^1" },
          knowledge: { review: "@acme/knowledge/review@^1" },
          packs: { review: "@acme/packs/review@^1" },
        }),
      );
    };

    it.effect(
      "rejects every explicitly selected Registry extension before archive construction",
      () => {
        writeExternallySourcedExtensions();
        const { provide, rendererState } = makeContext();
        const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

        return provide(
          Effect.gen(function* () {
            const selectors = extensionTypes.map(
              (type) => `@acme/${extensionTypeToPlural[type]}/review`,
            );
            for (const [index, selector] of selectors.entries()) {
              const exit = yield* handleRootPublish(
                args(registryUrl, { preview: false, selectors: [selector] }),
              ).pipe(Effect.exit);

              const data = at(rendererState.results, index).data;
              const result = expectPublishResult(data, { mode: "apply", count: 1 });
              const results = property(result, "results");
              if (!Array.isArray(results)) throw new Error("Expected publish results");
              const item = expectRecord(at(results, 0));
              expect(property(item, "action")).toBe("error");
              expect(property(item, "reason")).toBe("not_authored");
              expect(property(item, "message")).toContain(`axm adopt ${selector}`);
              expect(property(item, "message")).toContain(`axm fork ${selector}`);
              expect(Object.keys(item)).not.toContain("version");
              expect(JSON.stringify(data)).not.toContain("0.0.0");
              expect(rendererState.results[index]?.ok).toBe(false);
              expect(Exit.isFailure(exit)).toBe(true);
              if (Exit.isFailure(exit)) {
                expect(isEffectCliExit(Cause.squash(exit.cause))).toBe(true);
              }
            }
            expect(rendererState.results).toHaveLength(selectors.length);
          }),
        );
      },
    );
  });

  describe("command telemetry", () => {
    const writeReviewSkill = (settings: Record<string, unknown> = {}) => {
      fs.writeFileSync(
        path.join(tempDir, "axm.json"),
        JSON.stringify({
          owner: "@acme",
          agents: [],
          skills: { review: "workspace" },
          ...settings,
        }),
      );
      const skillDir = path.join(tempDir, "skills", "review");
      fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "skill.json"),
        JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" }),
      );
      fs.writeFileSync(
        path.join(skillDir, "src", "SKILL.md"),
        "---\nname: review\ndescription: Review code\n---\n\n# Review\n",
      );
    };

    const semanticProperties = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        yield* effect;
        return yield* getCommandSemanticProperties;
      }).pipe(Effect.provide(CommandSemanticPropertiesLive));

    it.effect("reports a previewed outcome and the selected subject type", () => {
      writeReviewSkill();
      const { provide } = makeContext();
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          const properties = yield* semanticProperties(handleRootPublish(args(registryUrl)));

          expect(properties["cli.outcome"]).toBe("previewed");
          expect(properties["cli.subject_type"]).toBe("skill");
          expect(properties["cli.source_kind"]).toBe("workspace");
          expect(properties["cli.applied_count"]).toBe(0);
          expect(properties["cli.failed_count"]).toBe(0);
        }),
      );
    });

    it.effect("reports an applied outcome with the published count", () => {
      writeReviewSkill();
      const { provide } = makeContext();
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          const properties = yield* semanticProperties(
            handleRootPublish(args(registryUrl, { preview: false })),
          );

          expect(properties["cli.outcome"]).toBe("applied");
          expect(properties["cli.subject_type"]).toBe("skill");
          expect(properties["cli.applied_count"]).toBe(1);
          expect(properties["cli.failed_count"]).toBe(0);
        }),
      );
    });

    it.effect("reports a no-op outcome for an empty selection", () => {
      const { provide } = makeContext();
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          const properties = yield* semanticProperties(
            handleRootPublish(args(registryUrl, { preview: false })),
          );

          expect(properties["cli.outcome"]).toBe("no-op");
          expect(properties["cli.subject_type"]).toBe("unknown");
          expect(properties["cli.applied_count"]).toBe(0);
        }),
      );
    });

    it.effect("reports mixed subject types across a multi-type selection", () => {
      writeReviewSkill({ rules: { style: "workspace" } });
      const ruleDir = path.join(tempDir, "rules", "style");
      fs.mkdirSync(path.join(ruleDir, "src"), { recursive: true });
      fs.writeFileSync(
        path.join(ruleDir, "rule.json"),
        JSON.stringify({ owner: "@acme", type: "rule", name: "style", version: "1.0.0" }),
      );
      fs.writeFileSync(path.join(ruleDir, "src", "RULE.md"), "# Style\n\nUse tabs.\n");
      const { provide } = makeContext();
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          const properties = yield* semanticProperties(
            handleRootPublish(args(registryUrl, { preview: false })),
          );

          expect(properties["cli.subject_type"]).toBe("mixed");
          expect(properties["cli.applied_count"]).toBe(2);
        }),
      );
    });
  });
});

describe("aggregatePublishFailure", () => {
  it("preserves auth classification when every publish fails auth", () => {
    const error = aggregatePublishFailure(2, [
      makeAppError({ code: "auth", detail: "Invalid or expired token." }),
      makeAppError({ code: "auth", detail: "Invalid or expired token." }),
    ]);

    expect(error.code).toBe("auth");
    expect(error.detail).toContain("Invalid or expired token.");
  });

  it("uses internal classification for mixed publish failures", () => {
    const error = aggregatePublishFailure(2, [
      makeAppError({ code: "auth", detail: "Invalid or expired token." }),
      makeAppError({ code: "network", detail: "Registry unavailable." }),
    ]);

    expect(error.code).toBe("internal");
  });

  it("preserves an external classification for mixed retryable Registry failures", () => {
    const retryableMetadata = {
      requestPolicy: {
        retryable: true,
        attemptCount: 1,
        maxAttempts: 1,
        exhausted: true,
        stoppedBy: "replay-unsafe" as const,
        replaySafety: "mutation" as const,
      },
    };
    const error = aggregatePublishFailure(2, [
      makeAppError({ code: "network", metadata: retryableMetadata }),
      makeAppError({ code: "unavailable", metadata: retryableMetadata }),
    ]);

    expect(error.code).toBe("network");
  });
});

describe("publish recovery", () => {
  it("replays the exact admitted identities through the generic root command", () => {
    const recovery = makeExactPublishRecovery(
      {
        registry: Option.some("private"),
        registryUrl: Option.none(),
        backfill: false,
        acceptWarnings: false,
        visibility: Option.some("private"),
      },
      ["@acme/skills/review", "@acme/packs/toolkit"],
    );

    expect(renderConfirmationRecoveryCommand(recovery, { approval: "none" })).toBe(
      "axm publish --registry private --on-existing verify --visibility private @acme/skills/review @acme/packs/toolkit",
    );
  });

  it("selects only failed items and dependents blocked by them", () => {
    const base = {
      owner: handle("@acme"),
      type: "skill" as const,
      sourceType: "workspace" as const,
      authored: true,
      phase: "upload_execution" as const,
    };
    const items: ReadonlyArray<PublishResultItem> = [
      {
        ...base,
        id: "@acme/skills/published",
        name: extensionName("published"),
        action: "publish",
        reason: "selected",
        status: "success",
      },
      {
        ...base,
        id: "@acme/skills/review",
        name: extensionName("review"),
        action: "error",
        reason: "upload_failed",
        status: "failed",
      },
      {
        ...base,
        id: "@acme/packs/toolkit",
        type: "pack",
        name: extensionName("toolkit"),
        action: "error",
        phase: "dependency_execution",
        reason: "blocked_by_dependency",
        status: "blocked",
        blockedBy: ["@acme/skills/review"],
      },
    ];
    const selection = publishRecoverySelection(items);

    expect(selection).toEqual({
      remainingItems: ["@acme/skills/review", "@acme/packs/toolkit"],
      blockedDependents: ["@acme/packs/toolkit"],
    });
    expect(
      renderConfirmationRecoveryCommand(
        makeExactPublishRecovery(
          {
            registry: Option.some("private"),
            registryUrl: Option.none(),
            backfill: false,
            acceptWarnings: false,
            visibility: Option.none(),
          },
          selection.remainingItems,
        ),
        { approval: "none" },
      ),
    ).toBe(
      "axm publish --registry private --on-existing verify @acme/skills/review @acme/packs/toolkit",
    );
  });

  it.each([
    ["timeout", "deadline"],
    ["network", "replay-unsafe"],
    ["rate_limit", "replay-unsafe"],
    ["unavailable", "replay-unsafe"],
  ] as const)("projects exhausted %s failures as retryable publish causes", (code, stoppedBy) => {
    const cause = publicPublishCause(
      makeAppError({
        code,
        detail: "Transient Registry failure",
        metadata: {
          response: {
            status: code === "rate_limit" ? 429 : 503,
            requestId: "req_public",
            problemCode: "service_unavailable",
            body: { detail: "private upstream detail", secret: "must-not-leak" },
          },
          requestPolicy: {
            retryable: true,
            attemptCount: 1,
            maxAttempts: 1,
            exhausted: true,
            stoppedBy,
            replaySafety: "mutation",
          },
        },
      }),
    );

    expect(cause).toMatchObject({
      code,
      class: "external",
      retryable: true,
      attemptCount: 1,
      maxAttempts: 1,
      attemptsExhausted: true,
      retryStoppedBy: stoppedBy,
      requestId: "req_public",
      responseStatus: code === "rate_limit" ? 429 : 503,
      problemCode: "service_unavailable",
    });
    expect(cause).not.toHaveProperty("body");
  });

  it.each(["auth", "validation", "conflict", "internal"] as const)(
    "projects deterministic %s failures as terminal publish causes",
    (code) => {
      expect(publicPublishCause(makeAppError({ code }))).toMatchObject({
        code,
        retryable: false,
      });
    },
  );
});

describe("root publish dependency planning", () => {
  const success: JobStepResult = { result: "success", message: "Published" };
  const stepFor = (candidate: { readonly fqn: string }) => ({
    readiness: "ready" as const,
    label: `Publish ${candidate.fqn}`,
    run: Effect.succeed(success),
  });

  it("records selected pack dependencies as causal execution edges", () => {
    const dependency = {
      fqn: "@acme/skills/review",
      type: "skill",
    } as const;
    const pack = {
      fqn: "@acme/packs/toolkit",
      type: "pack",
      dependencies: { "@acme/skills/review": "^1.0.0" },
    } as const;

    const jobs = buildPublishJobs([dependency, pack], stepFor);

    expect(jobs).toHaveLength(1);
    expect(at(jobs, 0)).toMatchObject({
      concurrency: 4,
      executionPolicy: "best-effort",
    });
    expect(at(jobs, 0).steps.map((step) => step.label)).toEqual([
      "Publish @acme/skills/review",
      "Publish @acme/packs/toolkit",
    ]);
    expect(at(at(jobs, 0).steps, 1).dependsOn).toEqual(["@acme/skills/review"]);
  });

  it("does not broaden a pack-only selection", () => {
    const pack = {
      fqn: "@acme/packs/toolkit",
      type: "pack",
      dependencies: { "@acme/skills/review": "^1.0.0" },
    } as const;

    const jobs = buildPublishJobs([pack], stepFor);

    expect(jobs).toHaveLength(1);
    expect(at(jobs, 0).steps.map((step) => step.label)).toEqual(["Publish @acme/packs/toolkit"]);
  });

  it.effect("blocks packs when a selected dependency fails", () =>
    Effect.gen(function* () {
      const dependency = {
        fqn: "@acme/skills/review",
        type: "skill",
      } as const;
      const pack = {
        fqn: "@acme/packs/toolkit",
        type: "pack",
        dependencies: { "@acme/skills/review": "^1.0.0" },
      } as const;
      const jobs = buildPublishJobs([dependency, pack], (candidate) => ({
        readiness: "ready",
        label: `Publish ${candidate.fqn}`,
        run:
          candidate.type === "skill"
            ? Effect.fail(new StepFailure({ category: "conflict", detail: "Dependency failed" }))
            : Effect.succeed(success),
      }));

      const executed = yield* applyPlan({
        _tag: "Plan",
        name: "Publish extensions",
        description: Option.none(),
        jobs,
      });

      expect(at(at(executed.jobs, 0).steps, 0).result.result).toBe("error");
      expect(at(at(executed.jobs, 0).steps, 1)).toMatchObject({
        blockedBy: ["@acme/skills/review"],
        result: {
          result: "error",
          message: "blocked by failed dependency: @acme/skills/review",
        },
      });
    }),
  );

  it.effect("continues independent candidates after a dependency failure", () =>
    Effect.gen(function* () {
      const dependency = { fqn: "@acme/skills/review", type: "skill" } as const;
      const independent = { fqn: "@acme/skills/format", type: "skill" } as const;
      const pack = {
        fqn: "@acme/packs/toolkit",
        type: "pack",
        dependencies: { "@acme/skills/review": "^1.0.0" },
      } as const;
      const jobs = buildPublishJobs([dependency, pack, independent], (candidate) => ({
        readiness: "ready",
        label: `Publish ${candidate.fqn}`,
        run:
          candidate.fqn === dependency.fqn
            ? Effect.fail(new StepFailure({ category: "conflict", detail: "Dependency failed" }))
            : Effect.succeed(success),
      }));

      const executed = yield* applyPlan({
        _tag: "Plan",
        name: "Publish extensions",
        description: Option.none(),
        jobs,
      });

      expect(at(at(executed.jobs, 0).steps, 1).blockedBy).toEqual([dependency.fqn]);
      expect(at(at(executed.jobs, 0).steps, 2).result.result).toBe("success");
    }),
  );
});

describe("publish type policy", () => {
  it("covers every extension type; every type is publishable", () => {
    expect(Object.keys(PUBLISHABLE_TYPES).sort()).toEqual([...extensionTypes].sort());
    for (const type of extensionTypes) {
      expect(isPublishableType(type)).toBe(true);
    }
  });
});
