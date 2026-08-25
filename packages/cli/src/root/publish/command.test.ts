import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as NodeHttp from "node:http";
import { pathToFileURL } from "node:url";
import {
  AuthClientTest,
  DeviceLoginInteractionTest,
  type CreatePublishAuthorizationRequestParams,
} from "@agentxm/client-core/unstable/auth";
import {
  CommandSemanticPropertiesLive,
  getCommandSemanticProperties,
  isEffectCliExit,
  renderConfirmationRecoveryCommand,
} from "@agentxm/client-core/unstable/cli-runtime";
import {
  extensionTypes,
  extensionTypeToPlural,
  formatFqn,
} from "@agentxm/client-core/unstable/extensions";
import { applyPlan, type JobStepResult } from "@agentxm/client-core/unstable/plan";
import { normalizePublishInput, validateArchive } from "@agentxm/client-core/unstable/publish";
import {
  archiveSha256Hex,
  publicationDescriptorDigest,
  publicationSetDigest,
} from "@agentxm/client-core/unstable/registry";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import YAML from "yaml";
import { makeAppError } from "@agentxm/client-core/unstable/app-error";

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
import { emitPublishResult } from "../../json-output.js";
import {
  aggregatePublishFailure,
  buildPublishJobs,
  exactPublishUploadBinding,
  findPackPublishDivergenceFindings,
  handleRootPublish,
  makeExactPublishRecovery,
  publicPublishCause,
  publishRecoverySelection,
  previewPublishUploadBinding,
  publishAuthenticationPreconditions,
  validatePublishOwners,
  type RootPublishHandlerArgs,
  PUBLISHABLE_TYPES,
  isPublishableType,
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
      manifestPath: ".axm/extensions/@acme/packs/reviewers/pack.json",
      memberFqn: "@acme/skills/review",
      constraint: "^0.0.4",
      memberVersion: "0.0.5",
      memberAuthority: "workspace" as const,
      classification: "satisfying" as const,
    },
  ];

  it("warns on an admitted pack when Registry consumers resolve a different version", () => {
    const findings = findPackPublishDivergenceFindings({
      candidates: [packCandidate],
      reachability,
      packs: [
        {
          target: {
            owner: handle("@acme"),
            type: "pack",
            name: extensionName("reviewers"),
            version: exactVersion("0.1.1"),
          },
          status: "admitted",
          findings: [],
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
    });

    expect(findings.get("@acme/packs/reviewers")).toEqual([
      {
        ruleId: "pack/publish-resolution-divergence",
        severity: "warning",
        message:
          "@acme/packs/reviewers resolves @acme/skills/review@0.0.5 in this workspace, while Registry consumers resolve @acme/skills/review@0.0.4 within ^0.0.4.",
        suggestions: [
          {
            description:
              "Publish @acme/skills/review before publishing the pack if consumers should receive the workspace version",
            cmd: "axm publish @acme/skills/review",
          },
        ],
      },
    ]);
  });

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
  yes: true,
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
      path.join(tempDir, ".axm", "settings.json"),
      JSON.stringify({ owner: "@acme", agents: [] }),
    );
    fs.writeFileSync(
      path.join(tempDir, ".axm", "axm-lock.yaml"),
      "lockfileVersion: 4\nskills: {}\n",
    );
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
    return {
      ...context,
      provide: makeEffectProvide(
        Layer.mergeAll(context.fullLayer, AuthClientTest(), interaction.layer),
      ),
    };
  };

  const writeReviewSkill = () => {
    fs.writeFileSync(
      path.join(tempDir, ".axm", "settings.json"),
      JSON.stringify({
        owner: "@acme",
        agents: [],
        skills: { review: "workspace:@acme/skills/review" },
      }),
    );
    const skillDir = path.join(tempDir, ".axm", "extensions", "@acme", "skills", "review");
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

  const writeAuthoredReviewPackWorkspace = (args: {
    readonly skillVersion: string;
    readonly constraint: string;
    readonly packVersion?: string;
  }) => {
    writeReviewSkill();
    const axmDir = path.join(tempDir, ".axm");
    const skillDir = path.join(axmDir, "extensions", "@acme", "skills", "review");
    fs.writeFileSync(
      path.join(skillDir, "skill.json"),
      JSON.stringify({
        owner: "@acme",
        type: "skill",
        name: "review",
        version: args.skillVersion,
      }),
    );
    const packDir = path.join(axmDir, "extensions", "@acme", "packs", "reviewers");
    fs.mkdirSync(packDir, { recursive: true });
    fs.writeFileSync(
      path.join(packDir, "pack.json"),
      JSON.stringify({
        owner: "@acme",
        type: "pack",
        name: "reviewers",
        version: args.packVersion ?? "0.1.0",
        dependencies: { "@acme/skills/review": args.constraint },
      }),
    );
    fs.writeFileSync(
      path.join(axmDir, "settings.json"),
      JSON.stringify({
        owner: "@acme",
        agents: [],
        skills: { review: "workspace:@acme/skills/review" },
        packs: { reviewers: "workspace:@acme/packs/reviewers" },
      }),
    );
    fs.writeFileSync(
      path.join(axmDir, "axm-lock.yaml"),
      YAML.stringify({
        lockfileVersion: 4,
        skills: {},
      }),
    );
    return { packDir };
  };

  describe("local pack-constraint publish gate", () => {
    it.effect("blocks an explicit authored leaf apply before upload", () => {
      writeAuthoredReviewPackWorkspace({ skillVersion: "0.0.5", constraint: "^0.0.4" });
      const { provide } = makeContext(false);
      const registryRoot = path.join(tempDir, "registry");
      const registryUrl = pathToFileURL(registryRoot).href;

      return provide(
        Effect.gen(function* () {
          const error = getAppError(
            yield* handleRootPublish(
              args(registryUrl, {
                selectors: ["@acme/skills/review"],
                preview: false,
              }),
            ).pipe(Effect.flip),
          );

          expect(error.code).toBe("validation");
          expect(error.detail).toContain("fact=workspace/extension-constraints-satisfied");
          expect(error.detail).toContain("@acme/skills/review@0.0.5");
          expect(error.detail).toContain("@acme/packs/reviewers declares ^0.0.4");
          expect(error.suggestions).toContainEqual({
            description:
              "Replace @acme/packs/reviewers's constraint with the selected version, then publish the member and pack together",
            cmd: "axm packs add @acme/packs/reviewers @acme/skills/review",
          });
          expect(
            fs.existsSync(
              path.join(registryRoot, "extensions", "@acme", "skills", "review", "0.0.5.zip"),
            ),
          ).toBe(false);
        }),
      );
    });

    it.effect("blocks explicit preview and authored bulk selection with the same fact", () => {
      writeAuthoredReviewPackWorkspace({ skillVersion: "0.0.5", constraint: "^0.0.4" });
      const { provide } = makeContext(false);
      const registryRoot = path.join(tempDir, "registry");
      const registryUrl = pathToFileURL(registryRoot).href;

      return provide(
        Effect.gen(function* () {
          const previewError = getAppError(
            yield* handleRootPublish(
              args(registryUrl, {
                selectors: ["@acme/skills/review"],
                preview: true,
              }),
            ).pipe(Effect.flip),
          );
          const bulkError = getAppError(
            yield* handleRootPublish(
              args(registryUrl, {
                preview: false,
              }),
            ).pipe(Effect.flip),
          );

          for (const error of [previewError, bulkError]) {
            expect(error.code).toBe("validation");
            expect(error.detail).toContain("fact=workspace/extension-constraints-satisfied");
            expect(error.detail).toContain("@acme/packs/reviewers declares ^0.0.4");
          }
          expect(
            fs.existsSync(
              path.join(registryRoot, "extensions", "@acme", "skills", "review", "0.0.5.zip"),
            ),
          ).toBe(false);
        }),
      );
    });

    it.effect("admits a repaired coordinated member and pack selection", () => {
      writeAuthoredReviewPackWorkspace({
        skillVersion: "0.0.5",
        constraint: "^0.0.5",
        packVersion: "0.1.1",
      });
      const { provide, rendererState } = makeContext();
      const registryRoot = path.join(tempDir, "registry");
      const registryUrl = pathToFileURL(registryRoot).href;

      return provide(
        Effect.gen(function* () {
          yield* handleRootPublish(
            args(registryUrl, {
              selectors: ["@acme/skills/review", "@acme/packs/reviewers"],
              preview: false,
            }),
          );

          const result = expectPublishResult(at(rendererState.results, 0).data, {
            mode: "apply",
            count: 2,
          });
          const results = property(result, "results");
          if (!Array.isArray(results)) throw new Error("Expected publish results");
          expect(results.map((item) => property(expectRecord(item), "status"))).toEqual([
            "success",
            "success",
          ]);
          expect(
            fs.existsSync(
              path.join(registryRoot, "extensions", "@acme", "skills", "review", "0.0.5.zip"),
            ),
          ).toBe(true);
          expect(
            fs.existsSync(
              path.join(registryRoot, "extensions", "@acme", "packs", "reviewers", "0.1.1.zip"),
            ),
          ).toBe(true);
        }),
      );
    });

    it.effect("does not let an already-published verified skip bypass local exclusion", () => {
      const { packDir } = writeAuthoredReviewPackWorkspace({
        skillVersion: "0.0.5",
        constraint: "^0.0.5",
      });
      const { provide } = makeContext(false);
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          yield* handleRootPublish(
            args(registryUrl, {
              selectors: ["@acme/skills/review"],
              preview: false,
            }),
          );
          const packManifestPath = path.join(packDir, "pack.json");
          const packManifest = expectRecord(JSON.parse(fs.readFileSync(packManifestPath, "utf8")));
          fs.writeFileSync(
            packManifestPath,
            JSON.stringify({
              ...packManifest,
              dependencies: { "@acme/skills/review": "^0.0.4" },
            }),
          );

          const error = getAppError(
            yield* handleRootPublish(
              args(registryUrl, {
                selectors: ["@acme/skills/review"],
                preview: false,
                onExisting: Option.some("verify"),
              }),
            ).pipe(Effect.flip),
          );

          expect(error.code).toBe("validation");
          expect(error.detail).toContain("@acme/packs/reviewers declares ^0.0.4");
        }),
      );
    });
  });

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

  it.effect("publishes with the browser-reviewed visibility and condition without readback", () => {
    writeReviewSkill();
    const context = makeWorkspaceHandlerTestContext({
      machine: true,
      wsOptions: { projectRoot: tempDir },
    });
    const registryUrl = "https://registry.example.com";
    let authorizationRequest: CreatePublishAuthorizationRequestParams | undefined;
    let uploadRequest: HttpClientRequest.HttpClientRequest | undefined;
    let extensionReadCount = 0;
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
        if (request.method === "PUT") {
          uploadRequest = request;
          return HttpClientResponse.fromWeb(
            request,
            new Response(
              JSON.stringify({
                owner: "@acme",
                type: "skill",
                name: "review",
                version: "1.0.0",
                integrity: "sha512-authoritative",
                sha256_hex: "a".repeat(64),
                published_at: "2026-08-11T00:00:00.000Z",
                publish_status: "available",
                visibility: {
                  value: "private",
                  disposition: "establish",
                  source: "explicit",
                },
                warnings: [],
                links: { html: "https://agentxm.ai/acme/skills/review" },
              }),
              { status: 201, headers: { "content-type": "application/json" } },
            ),
          );
        }
        if (url.pathname.includes("/v1/extensions/")) extensionReadCount += 1;
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
          requestId: "pubreq_exact",
          authorizationUrl: "https://agentxm.ai/publish/authorize/pubreq_exact",
          expiresAt: DateTime.makeUnsafe("2099-01-01T00:10:00.000Z"),
        });
      },
      exchangePublishAuthorizationCode: () =>
        Effect.sync(() => {
          if (authorizationRequest === undefined) {
            throw new Error("Expected a publication authorization request");
          }
          const descriptor = authorizationRequest.publicationSet.candidates[0];
          if (descriptor === undefined) throw new Error("Expected a publication descriptor");
          const setDigest = publicationSetDigest(authorizationRequest.publicationSet.candidates);
          return {
            status: "admitted" as const,
            preview: {
              contract: "publication-set-v2" as const,
              publicationSetDigest: setDigest,
              status: "admitted" as const,
              candidates: authorizationRequest.publicationSet.candidates.map((candidate) => ({
                kind: "resolved" as const,
                target: candidate.target,
                participation: candidate.participation,
                descriptorDigest: publicationDescriptorDigest(candidate),
                visibility: {
                  target: formatFqn(candidate.target),
                  intent: candidate.visibility.intent,
                  request: candidate.visibility.request,
                  resolved: {
                    value: "private" as const,
                    disposition: "establish" as const,
                    source: "explicit" as const,
                  },
                  actual: null,
                  comparison: "not-established" as const,
                  findings: [],
                },
                condition: '"pv2-reviewed"',
              })),
              packs: [],
            },
            grants: [
              {
                accessToken: "axm_pub_capability",
                expiresAt: DateTime.makeUnsafe("2099-01-01T00:15:00.000Z"),
                scope: "extensions:publish:new",
                publishRequestId: "pubreq_exact",
                visibilityContract: "v2" as const,
                visibility: {
                  value: "private" as const,
                  disposition: "establish" as const,
                  source: "explicit" as const,
                },
                condition: '"pv2-reviewed"',
                publicationSetDigest: setDigest,
                publicationDescriptorDigest: publicationDescriptorDigest(descriptor),
              },
            ],
          };
        }),
    });
    const interaction = DeviceLoginInteractionTest({
      openBrowser: () =>
        Effect.sync(() => {
          if (authorizationRequest === undefined) return false;
          const callback = new URL(authorizationRequest.redirectUri);
          callback.searchParams.set("code", "axm_pubac_code");
          callback.searchParams.set("state", authorizationRequest.state);
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
      ),
    );

    return provide(
      Effect.gen(function* () {
        yield* handleRootPublish(
          args(registryUrl, {
            preview: false,
            visibility: Option.some("private"),
          }),
        );

        expect(authorizationRequest).toMatchObject({
          publicationSet: {
            contract: "publication-set-v2",
            candidates: [{ visibility: { intent: null, request: "private" } }],
          },
        });
        expect(uploadRequest?.headers["authorization"]).toBe("Bearer axm_pub_capability");
        const uploadedUrl =
          uploadRequest === undefined
            ? undefined
            : Option.getOrUndefined(HttpClientRequest.toUrl(uploadRequest));
        expect(uploadedUrl?.searchParams.get("visibility")).toBe("private");
        expect(uploadRequest?.headers["if-match"]).toBe('"pv2-reviewed"');
        expect(uploadRequest?.headers["x-axm-publication-set-digest"]).toBeDefined();
        expect(uploadRequest?.headers["x-axm-publication-descriptor-digest"]).toBeDefined();
        expect(extensionReadCount).toBe(1);

        const result = expectPublishResult(at(context.rendererState.results, 0).data, {
          mode: "apply",
          count: 1,
        });
        const results = property(result, "results");
        if (!Array.isArray(results)) throw new Error("Expected publish results");
        expect(expectRecord(property(expectRecord(at(results, 0)), "visibility"))).toEqual({
          value: "private",
          disposition: "establish",
          source: "explicit",
        });
      }),
    );
  });

  // The registry may commit an upload before its response is recorded. An
  // interruption landing in that window must report the item's outcome as
  // indeterminate — only evidenced states — with a credential-free recovery
  // command that verifies or re-runs, never an auto-retry of a replay-unsafe
  // mutation.
  it.effect(
    "C-15: interruption after upload dispatch reports an indeterminate registry outcome",
    () => {
      writeReviewSkill();
      const context = makeWorkspaceHandlerTestContext({
        machine: true,
        wsOptions: { projectRoot: tempDir },
      });
      const registryUrl = "https://registry.example.com";
      let authorizationRequest: CreatePublishAuthorizationRequestParams | undefined;
      const authClient = AuthClientTest({
        createPublishAuthorizationRequest: (request) => {
          authorizationRequest = request;
          return Effect.succeed({
            requestId: "pubreq_exact",
            authorizationUrl: "https://agentxm.ai/publish/authorize/pubreq_exact",
            expiresAt: DateTime.makeUnsafe("2099-01-01T00:10:00.000Z"),
          });
        },
        exchangePublishAuthorizationCode: () =>
          Effect.sync(() => {
            if (authorizationRequest === undefined) {
              throw new Error("Expected a publication authorization request");
            }
            const descriptor = authorizationRequest.publicationSet.candidates[0];
            if (descriptor === undefined) throw new Error("Expected a publication descriptor");
            const setDigest = publicationSetDigest(authorizationRequest.publicationSet.candidates);
            return {
              status: "admitted" as const,
              preview: {
                contract: "publication-set-v2" as const,
                publicationSetDigest: setDigest,
                status: "admitted" as const,
                candidates: authorizationRequest.publicationSet.candidates.map((candidate) => ({
                  kind: "resolved" as const,
                  target: candidate.target,
                  participation: candidate.participation,
                  descriptorDigest: publicationDescriptorDigest(candidate),
                  visibility: {
                    target: formatFqn(candidate.target),
                    intent: candidate.visibility.intent,
                    request: candidate.visibility.request,
                    resolved: {
                      value: "private" as const,
                      disposition: "establish" as const,
                      source: "explicit" as const,
                    },
                    actual: null,
                    comparison: "not-established" as const,
                    findings: [],
                  },
                  condition: '"pv2-reviewed"',
                })),
                packs: [],
              },
              grants: [
                {
                  accessToken: "axm_pub_capability",
                  expiresAt: DateTime.makeUnsafe("2099-01-01T00:15:00.000Z"),
                  scope: "extensions:publish:new",
                  publishRequestId: "pubreq_exact",
                  visibilityContract: "v2" as const,
                  visibility: {
                    value: "private" as const,
                    disposition: "establish" as const,
                    source: "explicit" as const,
                  },
                  condition: '"pv2-reviewed"',
                  publicationSetDigest: setDigest,
                  publicationDescriptorDigest: publicationDescriptorDigest(descriptor),
                },
              ],
            };
          }),
      });
      const interaction = DeviceLoginInteractionTest({
        openBrowser: () =>
          Effect.sync(() => {
            if (authorizationRequest === undefined) return false;
            const callback = new URL(authorizationRequest.redirectUri);
            callback.searchParams.set("code", "axm_pubac_code");
            callback.searchParams.set("state", authorizationRequest.state);
            callback.searchParams.set("iss", "https://agentxm.ai");
            scheduleCallback(callback.href);
            return true;
          }),
      });

      return Effect.gen(function* () {
        const uploadDispatched = yield* Deferred.make<void>();
        // The upload request reaches the registry and never gets a response:
        // the server may commit the version while the client records nothing.
        const httpClient = HttpClient.make((request) => {
          const url = new URL(request.url);
          if (request.method === "PUT") {
            return Deferred.succeed(uploadDispatched, void 0).pipe(Effect.andThen(Effect.never));
          }
          return Effect.sync(() => {
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
          });
        });
        const provide = makeEffectProvide(
          Layer.mergeAll(
            context.fullLayer,
            authClient,
            interaction.layer,
            Layer.succeed(HttpClient.HttpClient, httpClient),
          ),
        );
        const fiber = yield* Effect.forkChild(
          provide(
            handleRootPublish(
              args(registryUrl, {
                preview: false,
                visibility: Option.some("private"),
              }),
            ),
          ),
        );
        yield* Deferred.await(uploadDispatched);
        yield* Fiber.interrupt(fiber);
        const exit = yield* Fiber.await(fiber);
        // The invocation resolved the interruption itself: a publish document
        // and the signal's exit code, not a generic termination notice.
        expect(Exit.isSuccess(exit)).toBe(false);
        if (Exit.isFailure(exit)) {
          const squashed = Cause.squash(exit.cause);
          expect(isEffectCliExit(squashed) && squashed.exitCode === 130).toBe(true);
        }
        const result = expectRecord(context.rendererState.results.at(-1)?.data);
        expect(property(result, "contract")).toBe("publish-result-v3");
        expect(property(result, "interruption")).toEqual({ signal: "SIGINT" });
        const execution = expectRecord(property(result, "execution"));
        expect(property(execution, "status")).toBe("partial");
        const outcomes = property(execution, "outcomes");
        if (!Array.isArray(outcomes)) throw new Error("Expected execution outcomes");
        const item = expectRecord(
          outcomes.find((entry) => expectRecord(entry)["name"] === "review"),
        );
        expect(item["action"]).toBe("publish");
        expect(item["status"]).toBe("unknown");
        expect(item["reason"]).toBe("interrupted");
        expect(item["phase"]).toBe("upload_execution");
        const counts = expectRecord(property(result, "counts"));
        expect(counts["unknown"]).toBe(1);
        expect(counts["published"]).toBe(0);
        expect(counts["failed"]).toBe(0);
        // Credential-free recovery that verifies or re-runs the exact set.
        const recovery = expectRecord(property(result, "recovery"));
        expect(String(recovery["cmd"])).toContain("axm publish");
        expect(String(recovery["cmd"])).not.toContain("token");
        expect(recovery["remainingItems"]).toEqual(["@acme/skills/review"]);
      });
    },
  );

  // Interruption before any upload was dispatched is evidenced differently:
  // nothing left the process, so the item is pending — never indeterminate.
  it.effect("C-15: interruption before upload dispatch reports pending items", () => {
    writeReviewSkill();
    const context = makeWorkspaceHandlerTestContext({
      machine: true,
      wsOptions: { projectRoot: tempDir },
    });
    const registryUrl = "https://registry.example.com";
    let authorizationRequested: (() => void) | undefined;
    const authClient = AuthClientTest({
      createPublishAuthorizationRequest: () =>
        Effect.gen(function* () {
          authorizationRequested?.();
          // The authorization wait never completes; interruption lands here,
          // before any upload could be dispatched.
          return yield* Effect.never;
        }),
    });
    const interaction = DeviceLoginInteractionTest({
      openBrowser: () => Effect.succeed(false),
    });

    return Effect.gen(function* () {
      const authorizationEntered = yield* Deferred.make<void>();
      authorizationRequested = () => {
        // eslint-disable-next-line no-restricted-syntax -- Test-only bridge from a sync callback into the running fiber tree.
        Effect.runFork(Deferred.succeed(authorizationEntered, void 0));
      };
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
      const provide = makeEffectProvide(
        Layer.mergeAll(
          context.fullLayer,
          authClient,
          interaction.layer,
          Layer.succeed(HttpClient.HttpClient, httpClient),
        ),
      );
      const fiber = yield* Effect.forkChild(
        provide(
          handleRootPublish(
            args(registryUrl, {
              preview: false,
              visibility: Option.some("private"),
            }),
          ),
        ),
      );
      yield* Deferred.await(authorizationEntered);
      yield* Fiber.interrupt(fiber);
      const exit = yield* Fiber.await(fiber);
      expect(Exit.isSuccess(exit)).toBe(false);
      const result = expectRecord(context.rendererState.results.at(-1)?.data);
      expect(property(result, "contract")).toBe("publish-result-v3");
      expect(property(result, "interruption")).toEqual({ signal: "SIGINT" });
      const execution = expectRecord(property(result, "execution"));
      const outcomes = property(execution, "outcomes");
      if (!Array.isArray(outcomes)) throw new Error("Expected execution outcomes");
      const item = expectRecord(outcomes.find((entry) => expectRecord(entry)["name"] === "review"));
      expect(item["status"]).toBe("pending");
      expect(item["reason"]).toBe("interrupted");
      const counts = expectRecord(property(result, "counts"));
      expect(counts["unknown"]).toBe(0);
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
          makeAppError({ code: "internal", detail: "Preview must not create publish authority" }),
        );
      },
    });
    const provide = makeEffectProvide(
      Layer.mergeAll(
        context.fullLayer,
        authClient,
        DeviceLoginInteractionTest().layer,
        Layer.succeed(HttpClient.HttpClient, httpClient),
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
            return yield* makeAppError({ code: "internal", detail: "Missing auth request" });
          }
          const descriptor = request.publicationSet.candidates[0];
          if (descriptor === undefined) {
            return yield* makeAppError({ code: "internal", detail: "Missing descriptor" });
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
            path.join(
              tempDir,
              ".axm",
              "extensions",
              "@acme",
              "skills",
              "review",
              "src",
              "SKILL.md",
            ),
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
        expect(property(expectRecord(at(outcomes, 0)), "status")).toBe("pending");
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
        expect(error.code).toBe("not_found");
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
          expect(logs.success.join("\n")).toContain("visibility: public (establish, platform)");
          expect(rendererState.spinnerMessages).toContain("Resolving publish registry");
          expect(rendererState.spinnerMessages).toContain("Preparing publish candidates");
          expect(rendererState.spinnerMessages).toContain("Applying Publish extensions");
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
          expect(logs.success.join("\n")).toContain("visibility: public (establish, platform)");
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
              cmd: "axm publish --on-existing verify --yes @acme/skills/review",
              remainingItems: ["@acme/skills/review"],
              blockedDependents: [],
            },
          });

          expect(logs.error).toContain("Publish failed for @acme/skills/review@1.0.0");
          expect(logs.info.join("\n")).toContain("retryable; attempts exhausted: 1/1");
          expect(
            rendererState.suggestions.some(
              (suggestion) =>
                suggestion.cmd === "axm publish --on-existing verify --yes @acme/skills/review",
            ),
          ).toBe(true);
        }),
      );
    });
  });

  it.effect("returns a machine-readable no-op for an empty authored selection", () => {
    const { provide, rendererState } = makeContext();
    return provide(
      Effect.gen(function* () {
        yield* handleRootPublish(args(pathToFileURL(path.join(tempDir, "registry")).href));

        const result = expectPublishResult(at(rendererState.results, 0).data, {
          mode: "preview",
          count: 0,
        });
        expect(property(expectRecord(property(result, "selection")), "mode")).toBe("authored");
      }),
    );
  });

  it.effect("selects a disabled workspace source during argument-free preview", () => {
    fs.writeFileSync(
      path.join(tempDir, ".axm", "settings.json"),
      JSON.stringify({
        owner: "@acme",
        agents: [],
        skills: {
          review: { source: "workspace:@acme/skills/review", enabled: false },
        },
      }),
    );
    const skillDir = path.join(tempDir, ".axm", "extensions", "@acme", "skills", "review");
    fs.mkdirSync(path.join(skillDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "skill.json"),
      JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" }),
    );
    fs.writeFileSync(
      path.join(skillDir, "src", "SKILL.md"),
      "---\nname: review\ndescription: Review code\n---\n\n# Review\n",
    );
    const { provide, rendererState } = makeContext();

    return provide(
      Effect.gen(function* () {
        yield* handleRootPublish(args(pathToFileURL(path.join(tempDir, "registry")).href));

        const result = expectPublishResult(at(rendererState.results, 0).data, {
          mode: "preview",
          count: 1,
        });
        const results = property(result, "results");
        if (!Array.isArray(results)) throw new Error("Expected publish results");
        const item = expectRecord(at(results, 0));
        expect(property(item, "authored")).toBe(true);
        expect(property(item, "sourceType")).toBe("workspace");
        expect(property(item, "status")).toBe("pending");
      }),
    );
  });

  it.effect("builds a publish candidate for a conformant Knowledge bundle", () => {
    fs.writeFileSync(
      path.join(tempDir, ".axm", "settings.json"),
      JSON.stringify({
        owner: "@acme",
        agents: [],
        knowledge: {
          platform: { source: "workspace:@acme/knowledge/platform", enabled: true },
        },
      }),
    );
    const knowledgeDir = path.join(tempDir, ".axm", "extensions", "@acme", "knowledge", "platform");
    fs.mkdirSync(path.join(knowledgeDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(knowledgeDir, "knowledge.json"),
      JSON.stringify({
        owner: "@acme",
        type: "knowledge",
        name: "platform",
        version: "1.0.0",
        format: { name: "okf", version: "0.2" },
        bundleRoot: "src",
      }),
    );
    fs.writeFileSync(
      path.join(knowledgeDir, "src", "index.md"),
      '---\nokf_version: "0.2"\n---\n# Platform knowledge\n',
    );
    fs.writeFileSync(
      path.join(knowledgeDir, "src", "architecture.md"),
      "---\ntype: reference\ndescription: Platform architecture\ntags: [platform]\n---\n# Architecture\n",
    );
    const { provide, rendererState } = makeContext();

    return provide(
      Effect.gen(function* () {
        yield* handleRootPublish(
          args(pathToFileURL(path.join(tempDir, "registry")).href, {
            types: ["knowledge"],
          }),
        );

        const result = expectPublishResult(at(rendererState.results, 0).data, {
          mode: "preview",
          count: 1,
        });
        const results = property(result, "results");
        if (!Array.isArray(results)) throw new Error("Expected publish results");
        const item = expectRecord(at(results, 0));
        expect(property(item, "type")).toBe("knowledge");
        expect(property(item, "action")).toBe("publish");
        expect(property(item, "status")).toBe("pending");
      }),
    );
  });

  it.effect("builds a publish candidate for a conformant OKF 0.2 Knowledge bundle", () => {
    fs.writeFileSync(
      path.join(tempDir, ".axm", "settings.json"),
      JSON.stringify({
        owner: "@acme",
        agents: [],
        knowledge: {
          platform: { source: "workspace:@acme/knowledge/platform", enabled: true },
        },
      }),
    );
    const knowledgeDir = path.join(tempDir, ".axm", "extensions", "@acme", "knowledge", "platform");
    fs.mkdirSync(path.join(knowledgeDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(knowledgeDir, "knowledge.json"),
      JSON.stringify({
        owner: "@acme",
        type: "knowledge",
        name: "platform",
        version: "1.0.0",
        format: { name: "okf", version: "0.2" },
        bundleRoot: "src",
      }),
    );
    fs.writeFileSync(
      path.join(knowledgeDir, "src", "index.md"),
      '---\nokf_version: "0.2"\n---\n# Platform knowledge\n\n- [Architecture](architecture.md)\n',
    );
    fs.writeFileSync(
      path.join(knowledgeDir, "src", "architecture.md"),
      [
        "---",
        "type: reference",
        "description: Platform architecture",
        "tags: [platform]",
        "status: stable",
        "generated: { by: reference_agent/gemini-2.5-pro, at: 2026-06-20T22:53:05Z }",
        "verified: { by: human:ahormati, at: 2026-06-25T09:00:00Z }",
        "sources:",
        "  - id: adr-1",
        "    resource: ./missing-adr.md",
        "---",
        "# Architecture",
        "",
      ].join("\n"),
    );
    const { provide, rendererState } = makeContext();

    return provide(
      Effect.gen(function* () {
        yield* handleRootPublish(
          args(pathToFileURL(path.join(tempDir, "registry")).href, {
            types: ["knowledge"],
          }),
        );

        const result = expectPublishResult(at(rendererState.results, 0).data, {
          mode: "preview",
          count: 1,
        });
        const results = property(result, "results");
        if (!Array.isArray(results)) throw new Error("Expected publish results");
        const item = expectRecord(at(results, 0));
        expect(property(item, "type")).toBe("knowledge");
        expect(property(item, "status")).toBe("pending");

        fs.writeFileSync(
          path.join(knowledgeDir, "src", "architecture.md"),
          [
            "---",
            "type: reference",
            "description: Platform architecture",
            "tags: [platform]",
            "sources:",
            "  - id: adr-1",
            "    resource: ../outside.md",
            "---",
            "# Architecture",
            "",
          ].join("\n"),
        );
        const exit = yield* handleRootPublish(
          args(pathToFileURL(path.join(tempDir, "registry")).href, {
            types: ["knowledge"],
          }),
        ).pipe(Effect.exit);
        expect(Exit.isFailure(exit)).toBe(true);
        if (Exit.isFailure(exit)) {
          expect(isEffectCliExit(Cause.squash(exit.cause))).toBe(true);
        }
        expect(JSON.stringify(at(rendererState.results, 1).data)).toContain(
          "escapes the Knowledge bundle",
        );

        fs.writeFileSync(
          path.join(knowledgeDir, "src", "architecture.md"),
          "---\ntype: reference\ndescription: value: extra\n---\n# Architecture\n",
        );
        const malformedExit = yield* handleRootPublish(
          args(pathToFileURL(path.join(tempDir, "registry")).href, {
            types: ["knowledge"],
          }),
        ).pipe(Effect.exit);
        expect(Exit.isFailure(malformedExit)).toBe(true);
        expect(JSON.stringify(at(rendererState.results, 2).data)).toContain(
          "architecture.md: Invalid YAML frontmatter: Nested mappings are not allowed in compact mappings",
        );
      }),
    );
  });

  it.effect("verifies an existing immutable version and detects integrity drift", () => {
    fs.writeFileSync(
      path.join(tempDir, ".axm", "settings.json"),
      JSON.stringify({
        owner: "@acme",
        agents: [],
        skills: { review: "workspace:@acme/skills/review" },
      }),
    );
    const skillDir = path.join(tempDir, ".axm", "extensions", "@acme", "skills", "review");
    const skillBody = path.join(skillDir, "src", "SKILL.md");
    fs.mkdirSync(path.dirname(skillBody), { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "skill.json"),
      JSON.stringify({ owner: "@acme", type: "skill", name: "review", version: "1.0.0" }),
    );
    fs.writeFileSync(skillBody, "---\nname: review\ndescription: Review code\n---\n\n# Review\n");
    const { provide } = makeContext(false);
    const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

    return provide(
      Effect.gen(function* () {
        yield* handleRootPublish(args(registryUrl, { preview: false }));
        yield* handleRootPublish(args(registryUrl, { onExisting: Option.some("verify") }));

        fs.appendFileSync(skillBody, "\nChanged after publish.\n");
        const error = getAppError(
          yield* handleRootPublish(args(registryUrl, { onExisting: Option.some("verify") })).pipe(
            Effect.flip,
          ),
        );
        expect(error.code).toBe("conflict");
        expect(error.detail).toContain("integrity drift");
      }),
    );
  });

  it.effect("does not persist an authored publication baseline", () => {
    writeReviewSkill();
    const { provide, rendererState } = makeContext(false);
    const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

    return provide(
      Effect.gen(function* () {
        yield* handleRootPublish(args(registryUrl, { preview: false }));

        yield* handleRootPublish(args(registryUrl, { preview: false }));
        const result = expectPublishResult(at(rendererState.results, 1).data, {
          mode: "apply",
          count: 1,
        });
        const results = property(result, "results");
        if (!Array.isArray(results)) throw new Error("Expected publish results");
        expect(expectRecord(at(results, 0))).toMatchObject({
          action: "skip",
          reason: "version_already_published",
          status: "success",
        });
      }),
    );
  });

  it.effect("publishes manifest metadata in the archive", () => {
    writeReviewSkill();
    const { provide, rendererState } = makeContext(false);
    const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;
    const manifestPath = path.join(
      tempDir,
      ".axm",
      "extensions",
      "@acme",
      "skills",
      "review",
      "skill.json",
    );
    const manifest = expectRecord(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
    const metadata = { "com.example/tool": { enabled: true } };
    fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, metadata }));

    return provide(
      Effect.gen(function* () {
        yield* handleRootPublish(args(registryUrl, { preview: false }));

        const archive = fs.readFileSync(
          path.join(tempDir, "registry", "extensions", "@acme", "skills", "review", "1.0.0.zip"),
        );
        const normalized = yield* normalizePublishInput({
          declaredIdentity: {
            owner: handle("@acme"),
            type: "skill",
            name: extensionName("review"),
            version: exactVersion("1.0.0"),
          },
          archive: { archiveBytes: archive, archiveContentType: "application/zip" },
        });
        const result = expectPublishResult(at(rendererState.results, 0).data, {
          mode: "apply",
          count: 1,
        });
        const results = property(result, "results");
        if (!Array.isArray(results)) throw new Error("Expected publish results");

        expect(property(expectRecord(normalized.manifest.raw), "metadata")).toEqual(metadata);
        expect(expectRecord(at(results, 0))).toMatchObject({
          action: "publish",
          status: "success",
        });
      }),
    );
  });

  describe("existing version policy", () => {
    const writeSkill = (name: string, version: string) => {
      const skillDir = path.join(tempDir, ".axm", "extensions", "@acme", "skills", name);
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
        path.join(tempDir, ".axm", "settings.json"),
        JSON.stringify({
          owner: "@acme",
          agents: [],
          skills: Object.fromEntries(names.map((name) => [name, `workspace:@acme/skills/${name}`])),
        }),
      );
      for (const name of names) writeSkill(name, "1.0.0");
    };

    const writeTwoSkillSettings = () => writeSkillSettings(["review", "deploy"]);

    const resultItems = (data: unknown, mode: "preview" | "apply", count: number) => {
      const result = expectPublishResult(data, { mode, count });
      const results = property(result, "results");
      if (!Array.isArray(results)) throw new Error("Expected publish results");
      return results.map((item) => expectRecord(item));
    };

    const itemNamed = (items: ReadonlyArray<Record<string, unknown>>, name: string) => {
      const item = items.find((candidate) => property(candidate, "name") === name);
      if (item === undefined) throw new Error(`Expected publish result for ${name}`);
      return item;
    };

    const expectVisibility = (
      item: Record<string, unknown>,
      expected: {
        readonly value: "public" | "private";
        readonly disposition: "establish" | "preserve";
        readonly source: "explicit" | "account" | "platform" | "existing";
      },
    ) => {
      expect(expectRecord(property(item, "visibility"))).toEqual(expected);
    };

    it.effect(
      "previews bulk visibility for authored, filtered, glob, and multi-selector sets",
      () => {
        writeTwoSkillSettings();
        const { provide, rendererState } = makeContext();
        const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;
        const selections: ReadonlyArray<Partial<RootPublishHandlerArgs>> = [
          {},
          { types: ["skill"] },
          { selectors: ["@acme/skills/*"] },
          { selectors: ["@acme/skills/review", "@acme/skills/deploy"] },
        ];

        return provide(
          Effect.gen(function* () {
            for (const selection of selections) {
              yield* handleRootPublish(
                args(registryUrl, {
                  ...selection,
                  visibility: Option.some("private"),
                }),
              );
            }

            expect(rendererState.results).toHaveLength(selections.length);
            for (const rendered of rendererState.results) {
              const items = resultItems(rendered.data, "preview", 2);
              for (const item of items) {
                expectVisibility(item, {
                  value: "private",
                  disposition: "establish",
                  source: "explicit",
                });
              }
            }
          }),
        );
      },
    );

    it.effect("overrides new extensions and preserves existing extension visibility", () => {
      writeSkillSettings(["review"]);
      const { provide, rendererState } = makeContext();
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          yield* handleRootPublish(args(registryUrl, { preview: false }));
          writeSkillSettings(["review", "deploy"]);
          writeSkill("review", "1.1.0");

          yield* handleRootPublish(
            args(registryUrl, {
              preview: false,
              visibility: Option.some("private"),
            }),
          );

          const items = resultItems(at(rendererState.results, 1).data, "apply", 2);
          expectVisibility(itemNamed(items, "review"), {
            value: "public",
            disposition: "preserve",
            source: "existing",
          });
          expectVisibility(itemNamed(items, "deploy"), {
            value: "private",
            disposition: "establish",
            source: "explicit",
          });
        }),
      );
    });

    it.effect("treats visibility as establishment-only when publishing a new version", () => {
      writeSkillSettings(["review"]);
      const { provide, rendererState } = makeContext();
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          yield* handleRootPublish(args(registryUrl, { preview: false }));
          writeSkill("review", "1.1.0");

          yield* handleRootPublish(
            args(registryUrl, {
              preview: false,
              visibility: Option.some("private"),
            }),
          );

          const publishedItems = resultItems(at(rendererState.results, 1).data, "apply", 1);
          const published = itemNamed(publishedItems, "review");
          expect(property(published, "status")).toBe("success");
          expectVisibility(published, {
            value: "public",
            disposition: "preserve",
            source: "existing",
          });

          yield* handleRootPublish(
            args(registryUrl, {
              preview: false,
              visibility: Option.some("private"),
            }),
          );
          const retriedItems = resultItems(at(rendererState.results, 2).data, "apply", 1);
          expect(property(itemNamed(retriedItems, "review"), "status")).toBe("success");
        }),
      );
    });

    it.effect("bulk publish verifies existing versions and uploads only new candidates", () => {
      writeTwoSkillSettings();
      const { provide, rendererState } = makeContext(false);
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          yield* handleRootPublish(args(registryUrl, { preview: false }));
          writeSkill("deploy", "1.1.0");
          yield* handleRootPublish(args(registryUrl, { preview: false }));

          const items = resultItems(at(rendererState.results, 1).data, "apply", 2);
          const review = itemNamed(items, "review");
          expect(property(review, "action")).toBe("skip");
          expect(property(review, "status")).toBe("success");
          expect(property(review, "reason")).toBe("version_already_published");
          expectVisibility(review, {
            value: "public",
            disposition: "preserve",
            source: "existing",
          });
          const deploy = itemNamed(items, "deploy");
          expect(property(deploy, "action")).toBe("publish");
          expect(property(deploy, "status")).toBe("success");
          const counts = expectRecord(
            property(expectRecord(at(rendererState.results, 1).data), "counts"),
          );
          expect(property(counts, "published")).toBe(1);
          expect(property(counts, "alreadyPublished")).toBe(1);
        }),
      );
    });

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

    it.effect("a single explicit selector still errors on an existing version", () => {
      writeTwoSkillSettings();
      const { provide } = makeContext(false);
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          yield* handleRootPublish(args(registryUrl, { preview: false }));
          const error = getAppError(
            yield* handleRootPublish(
              args(registryUrl, { selectors: ["@acme/skills/review"], preview: false }),
            ).pipe(Effect.flip),
          );

          expect(error.code).toBe("conflict");
          expect(error.detail).toContain("already published");
          const suggestions = error.suggestions ?? [];
          expect(
            suggestions.some(
              (suggestion) => suggestion.cmd === "axm version @acme/skills/review patch",
            ),
          ).toBe(true);
          expect(
            suggestions.some((suggestion) =>
              suggestion.description.includes("--on-existing verify"),
            ),
          ).toBe(true);
        }),
      );
    });

    it.effect("does not publish remaining candidates when one conflicts", () => {
      writeTwoSkillSettings();
      const { provide, rendererState } = makeContext(false);
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          yield* handleRootPublish(args(registryUrl, { preview: false }));
          writeSkill("deploy", "1.1.0");
          const error = getAppError(
            yield* handleRootPublish(
              args(registryUrl, { preview: false, onExisting: Option.some("error") }),
            ).pipe(Effect.flip),
          );
          expect(error.code).toBe("conflict");

          const items = resultItems(at(rendererState.results, 1).data, "apply", 2);
          const review = itemNamed(items, "review");
          expect(property(review, "action")).toBe("error");
          expect(property(review, "status")).toBe("failed");
          expect(at(rendererState.results, 1).ok).toBe(false);
          const deploy = itemNamed(items, "deploy");
          expect(property(deploy, "status")).toBe("blocked");
          expect(property(deploy, "reason")).toBe("blocked_by_preflight");
          expect(property(deploy, "blockedBy")).toEqual(["@acme/skills/review"]);

          yield* handleRootPublish(
            args(registryUrl, {
              selectors: ["@acme/skills/deploy"],
              preview: false,
            }),
          );
          const rerunItems = resultItems(at(rendererState.results, 2).data, "apply", 1);
          expect(property(itemNamed(rerunItems, "deploy"), "status")).toBe("success");
        }),
      );
    });
  });

  describe("publish safety gates", () => {
    const skillDir = () => path.join(tempDir, ".axm", "extensions", "@acme", "skills", "review");

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
        path.join(tempDir, ".axm", "settings.json"),
        JSON.stringify({
          owner: "@acme",
          agents: [],
          skills: { review: "workspace:@acme/skills/review" },
        }),
      );
    };

    const reviewItem = (data: unknown) => {
      const result = expectPublishResult(data, { mode: "apply", count: 1 });
      const results = property(result, "results");
      if (!Array.isArray(results)) throw new Error("Expected publish results");
      return expectRecord(at(results, 0));
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

      it.effect("--backfill publishes the older unpublished version", () => {
        const { provide, rendererState } = makeContext();
        const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

        return provide(
          Effect.gen(function* () {
            writeReviewSkill("1.1.0");
            yield* handleRootPublish(args(registryUrl, { preview: false }));

            writeReviewSkill("1.0.5");
            yield* handleRootPublish(explicit(registryUrl, { backfill: true }));

            const item = reviewItem(at(rendererState.results, 1).data);
            expect(property(item, "action")).toBe("publish");
            expect(property(item, "status")).toBe("success");
            expect(property(item, "version")).toBe("1.0.5");
          }),
        );
      });

      it.effect("compares by semver rather than registry index order", () => {
        const { provide } = makeContext(false);
        const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

        return provide(
          Effect.gen(function* () {
            writeReviewSkill("1.0.0");
            yield* handleRootPublish(args(registryUrl, { preview: false }));
            writeReviewSkill("2.0.0");
            yield* handleRootPublish(args(registryUrl, { preview: false }));
            // Publishing out of order leaves 1.5.0 first in the index, so an
            // index-order "latest" would wrongly accept anything above it.
            writeReviewSkill("1.5.0");
            yield* handleRootPublish(explicit(registryUrl, { backfill: true }));

            writeReviewSkill("1.9.0");
            const error = getAppError(
              yield* handleRootPublish(explicit(registryUrl)).pipe(Effect.flip),
            );

            expect(error.code).toBe("conflict");
            expect(error.detail).toContain("lower than the highest published version 2.0.0");
          }),
        );
      });

      it.effect("does not let --backfill overwrite an existing version", () => {
        const { provide, rendererState } = makeContext(false);
        const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

        return provide(
          Effect.gen(function* () {
            writeReviewSkill("1.1.0");
            yield* handleRootPublish(explicit(registryUrl));
            expect(property(reviewItem(at(rendererState.results, 0).data), "status")).toBe(
              "success",
            );

            const error = getAppError(
              yield* handleRootPublish(explicit(registryUrl, { backfill: true })).pipe(Effect.flip),
            );
            expect(error.code).toBe("conflict");
            expect(error.detail).toContain("already published");
          }),
        );
      });
    });

    describe("archive guardrails", () => {
      it.effect("reports the filtered archive plan and publishes only included files", () => {
        const { provide, rendererState } = makeContext();
        const registryRoot = path.join(tempDir, "registry");
        const registryUrl = pathToFileURL(registryRoot).href;

        return provide(
          Effect.gen(function* () {
            writeReviewSkill("1.0.0");
            fs.mkdirSync(path.join(skillDir(), "evals"), { recursive: true });
            fs.writeFileSync(path.join(skillDir(), "evals", "evals.json"), "{}\n");
            const manifestPath = path.join(skillDir(), "skill.json");
            const manifest = expectRecord(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
            fs.writeFileSync(
              manifestPath,
              JSON.stringify({ ...manifest, publish: { ignore: ["evals/*", "missing-*"] } }),
            );

            yield* handleRootPublish(explicit(registryUrl));

            const item = reviewItem(at(rendererState.results, 0).data);
            expect(property(item, "archive")).toMatchObject({
              includedCount: 2,
              excludedCount: 1,
              patterns: [
                { pattern: "evals/*", matchCount: 1 },
                { pattern: "missing-*", matchCount: 0 },
              ],
              warnings: ['publish.ignore pattern "missing-*" matched no files.'],
            });
            const archive = fs.readFileSync(
              path.join(registryRoot, "extensions", "@acme", "skills", "review", "1.0.0.zip"),
            );
            const entries = yield* validateArchive(archive);
            expect(entries.map((entry) => entry.fileName).sort()).toEqual([
              "skill.json",
              "src/SKILL.md",
            ]);
          }),
        );
      });

      it.effect("rejects a policy that filters out a required package file", () => {
        const { provide } = makeContext(false);
        const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

        return provide(
          Effect.gen(function* () {
            writeReviewSkill("1.0.0");
            const manifestPath = path.join(skillDir(), "skill.json");
            const manifest = expectRecord(JSON.parse(fs.readFileSync(manifestPath, "utf8")));
            fs.writeFileSync(
              manifestPath,
              JSON.stringify({ ...manifest, publish: { ignore: ["src/SKILL.md"] } }),
            );

            const error = getAppError(
              yield* handleRootPublish(explicit(registryUrl)).pipe(Effect.flip),
            );

            expect(error.code).toBe("validation");
            expect(error.detail).toContain("src/SKILL.md is required");
          }),
        );
      });

      it.effect("refuses an archive containing node_modules", () => {
        const { provide } = makeContext(false);
        const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

        return provide(
          Effect.gen(function* () {
            writeReviewSkill("1.0.0");
            fs.mkdirSync(path.join(skillDir(), "node_modules"), { recursive: true });
            fs.writeFileSync(
              path.join(skillDir(), "node_modules", "leftover.js"),
              "module.exports = {}\n",
            );

            const error = getAppError(
              yield* handleRootPublish(explicit(registryUrl)).pipe(Effect.flip),
            );

            expect(error.code).toBe("validation");
            expect(error.detail).toContain("node_modules/leftover.js");
            expect(error.suggestions?.map((suggestion) => suggestion.description)).toContain(
              "Remove the unsafe entry from the extension directory.",
            );
          }),
        );
      });

      it.effect("refuses an archive containing a .env file", () => {
        const { provide } = makeContext(false);
        const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

        return provide(
          Effect.gen(function* () {
            writeReviewSkill("1.0.0");
            fs.writeFileSync(path.join(skillDir(), ".env"), "TOKEN=secret\n");

            const error = getAppError(
              yield* handleRootPublish(explicit(registryUrl)).pipe(Effect.flip),
            );

            expect(error.code).toBe("validation");
            expect(error.detail).toContain(".env");
          }),
        );
      });

      it.effect("leaves a clean archive byte-identical", () => {
        const { provide, rendererState } = makeContext();
        const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

        return provide(
          Effect.gen(function* () {
            writeReviewSkill("1.0.0");
            yield* handleRootPublish(explicit(registryUrl));
            // `verify` recomputes the archive and compares integrity with the
            // published version: it only passes if the guardrails left the
            // bytes alone.
            yield* handleRootPublish(explicit(registryUrl, { onExisting: Option.some("verify") }));

            const item = reviewItem(at(rendererState.results, 1).data);
            expect(property(item, "action")).toBe("skip");
            expect(property(item, "reason")).toBe("version_already_published");
          }),
        );
      });
    });
  });

  describe("result versions", () => {
    const writeExternallySourcedExtensions = () => {
      fs.writeFileSync(
        path.join(tempDir, ".axm", "settings.json"),
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
        path.join(tempDir, ".axm", "settings.json"),
        JSON.stringify({
          owner: "@acme",
          agents: [],
          skills: { review: "workspace:@acme/skills/review" },
          ...settings,
        }),
      );
      const skillDir = path.join(tempDir, ".axm", "extensions", "@acme", "skills", "review");
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
      writeReviewSkill({ rules: { style: "workspace:@acme/rules/style" } });
      const ruleDir = path.join(tempDir, ".axm", "extensions", "@acme", "rules", "style");
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
        visibility: Option.some("private"),
      },
      ["@acme/skills/review", "@acme/packs/toolkit"],
    );

    expect(renderConfirmationRecoveryCommand(recovery)).toBe(
      "axm publish --registry private --on-existing verify --visibility private --yes @acme/skills/review @acme/packs/toolkit",
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
    const selection = publishRecoverySelection([
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
    ]);

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
            visibility: Option.none(),
          },
          selection.remainingItems,
        ),
      ),
    ).toBe(
      "axm publish --registry private --on-existing verify --yes @acme/skills/review @acme/packs/toolkit",
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
            ? Effect.fail(makeAppError({ code: "conflict", detail: "Dependency failed" }))
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
            ? Effect.fail(makeAppError({ code: "conflict", detail: "Dependency failed" }))
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
