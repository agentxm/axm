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
} from "@agentxm/client-core/unstable/cli-runtime";
import {
  computePackageContentHash,
  extensionTypes,
} from "@agentxm/client-core/unstable/extensions";
import { applyPlan, type JobStepResult } from "@agentxm/client-core/unstable/plan";
import { normalizePublishInput } from "@agentxm/client-core/unstable/publish";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
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
import { exactVersion, extensionName, handle } from "../../test-stubs.js";
import { emitPublishResult } from "../../json-output.js";
import {
  aggregatePublishFailure,
  buildPublishJobs,
  exactPublishUploadBinding,
  handleRootPublish,
  previewPublishUploadBinding,
  publishAuthenticationPreconditions,
  validatePublishOwners,
  type RootPublishHandlerArgs,
  PUBLISHABLE_TYPES,
  isPublishableType,
} from "./command.js";

const args = (
  registryUrl: string,
  overrides?: Partial<RootPublishHandlerArgs>,
): RootPublishHandlerArgs => ({
  selectors: [],
  authored: false,
  all: false,
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
  includeDependency: [],
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
      "lockfileVersion: 3\nskills: {}\n",
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

  const writeReviewTrust = () => {
    fs.writeFileSync(
      path.join(tempDir, ".axm", "trust.json"),
      JSON.stringify({
        trustStateVersion: 1,
        records: {
          "skill:review": {
            extensionType: "skill",
            name: "review",
            authority: "workspace",
            sourceIdentity: "workspace:@acme/skills/review",
            resolvedVersion: "0.9.0",
            contentIdentity: "0".repeat(64),
          },
        },
      }),
    );
  };

  const scheduleCallback = (url: string) => {
    setTimeout(() => {
      const request = NodeHttp.get(url, (response) => response.resume());
      request.on("error", () => undefined);
    }, 10);
  };

  const reviewTrustRecord = () => {
    const trust = expectRecord(
      JSON.parse(fs.readFileSync(path.join(tempDir, ".axm", "trust.json"), "utf8")),
    );
    const records = expectRecord(property(trust, "records"));
    return expectRecord(property(records, "skill:review"));
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
    const baseCapability = {
      accessToken: "axm_pub_capability",
      expiresAt: DateTime.makeUnsafe("2099-01-01T00:15:00.000Z"),
      scope: "extensions:publish:new",
      publishRequestId: "pubreq_test",
      visibilityContract: "v1" as const,
      condition: '"pv1-reviewed"',
    };

    expect(
      exactPublishUploadBinding({
        ...baseCapability,
        visibility: {
          value: "private",
          disposition: "establish",
          source: "explicit",
        },
      }),
    ).toEqual({
      accessToken: "axm_pub_capability",
      condition: '"pv1-reviewed"',
      initialVisibility: "private",
    });

    for (const visibility of [
      { value: "private", disposition: "establish", source: "account" },
      { value: "private", disposition: "preserve", source: "existing" },
    ] as const) {
      expect(exactPublishUploadBinding({ ...baseCapability, visibility })).toEqual({
        accessToken: "axm_pub_capability",
        condition: '"pv1-reviewed"',
      });
    }

    expect(
      previewPublishUploadBinding({
        condition: '"pv1-existing"',
        visibility: { value: "public", disposition: "preserve", source: "existing" },
      }),
    ).toEqual({ condition: '"pv1-existing"' });
    expect(
      previewPublishUploadBinding({
        condition: '"pv1-explicit"',
        visibility: { value: "private", disposition: "establish", source: "explicit" },
      }),
    ).toEqual({ condition: '"pv1-explicit"', initialVisibility: "private" });
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
        Effect.succeed({
          accessToken: "axm_pub_capability",
          expiresAt: DateTime.makeUnsafe("2099-01-01T00:15:00.000Z"),
          scope: "extensions:publish:new",
          publishRequestId: "pubreq_exact",
          visibilityContract: "v1",
          visibility: {
            value: "private",
            disposition: "establish",
            source: "explicit",
          },
          condition: '"pv1-reviewed"',
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
          visibilityContract: "v1",
          requestedVisibility: "private",
        });
        expect(uploadRequest?.headers["authorization"]).toBe("Bearer axm_pub_capability");
        const uploadedUrl =
          uploadRequest === undefined
            ? undefined
            : Option.getOrUndefined(HttpClientRequest.toUrl(uploadRequest));
        expect(uploadedUrl?.searchParams.get("visibility")).toBe("private");
        expect(uploadRequest?.headers["if-match"]).toBe('"pv1-reviewed"');
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
        const preconditions = property(result, "preconditions");
        if (!Array.isArray(preconditions)) throw new Error("Expected preview preconditions");
        expect(expectRecord(at(preconditions, 0))).toMatchObject({
          id: "authentication",
          status: "unmet",
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
                owner: handle("@acme"),
                type: "skill",
                name: extensionName("review"),
                version: exactVersion("1.0.0"),
                action: "publish",
                status: "success",
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

  it.effect("advances the authored baseline after publish and verified skip", () => {
    writeReviewSkill();
    writeReviewTrust();
    const { provide, rendererState } = makeContext(false);
    const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

    return provide(
      Effect.gen(function* () {
        const skillDir = path.join(tempDir, ".axm", "extensions", "@acme", "skills", "review");
        const expectedIdentity = yield* computePackageContentHash(skillDir);

        yield* handleRootPublish(args(registryUrl, { preview: false }));
        expect(reviewTrustRecord()).toMatchObject({
          resolvedVersion: "1.0.0",
          contentIdentity: expectedIdentity,
        });

        writeReviewTrust();
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
        expect(reviewTrustRecord()).toMatchObject({
          resolvedVersion: "1.0.0",
          contentIdentity: expectedIdentity,
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

    it.effect(
      "blocks every upload when a visibility override has no eligible new extension",
      () => {
        writeSkillSettings(["review"]);
        const { provide, rendererState } = makeContext();
        const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

        return provide(
          Effect.gen(function* () {
            yield* handleRootPublish(args(registryUrl, { preview: false }));
            writeSkill("review", "1.1.0");

            const exit = yield* handleRootPublish(
              args(registryUrl, {
                preview: false,
                visibility: Option.some("private"),
              }),
            ).pipe(Effect.exit);
            expect(Exit.isFailure(exit)).toBe(true);

            const failedItems = resultItems(at(rendererState.results, 1).data, "apply", 1);
            const failed = itemNamed(failedItems, "review");
            expect(property(failed, "status")).toBe("failed");
            expect(property(failed, "message")).toContain("no eligible new extension");
            expect(Object.keys(failed)).not.toContain("visibility");

            yield* handleRootPublish(args(registryUrl, { preview: false }));
            const retriedItems = resultItems(at(rendererState.results, 2).data, "apply", 1);
            expect(property(itemNamed(retriedItems, "review"), "status")).toBe("success");
          }),
        );
      },
    );

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
    const writeRegistrySourcedSkill = () => {
      fs.writeFileSync(
        path.join(tempDir, ".axm", "settings.json"),
        JSON.stringify({
          owner: "@acme",
          agents: [],
          skills: { review: "@acme/skills/review@^1" },
        }),
      );
    };

    it.effect("emits one failed machine result and omits an unresolved version", () => {
      writeRegistrySourcedSkill();
      const { provide, rendererState } = makeContext();
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          const exit = yield* handleRootPublish(
            args(registryUrl, { preview: false, selectors: ["@acme/skills/review"] }),
          ).pipe(Effect.exit);

          const data = at(rendererState.results, 0).data;
          const result = expectPublishResult(data, { mode: "apply", count: 1 });
          const results = property(result, "results");
          if (!Array.isArray(results)) throw new Error("Expected publish results");
          const item = expectRecord(at(results, 0));
          expect(property(item, "action")).toBe("error");
          expect(Object.keys(item)).not.toContain("version");
          expect(JSON.stringify(data)).not.toContain("0.0.0");
          expect(rendererState.results).toHaveLength(1);
          expect(rendererState.results[0]?.ok).toBe(false);
          expect(Exit.isFailure(exit)).toBe(true);
          if (Exit.isFailure(exit)) {
            expect(isEffectCliExit(Cause.squash(exit.cause))).toBe(true);
          }
        }),
      );
    });
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
});

describe("root publish dependency planning", () => {
  const success: JobStepResult = { result: "success", message: "Published" };
  const stepFor = (candidate: { readonly fqn: string }) => ({
    readiness: "ready" as const,
    label: `Publish ${candidate.fqn}`,
    run: Effect.succeed(success),
  });

  it("places selected pack dependencies behind a concurrent dependency barrier", () => {
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

    expect(jobs).toHaveLength(2);
    expect(at(jobs, 0)).toMatchObject({
      concurrency: 4,
      executionPolicy: "best-effort",
    });
    expect(at(jobs, 0).steps.map((step) => step.label)).toEqual(["Publish @acme/skills/review"]);
    expect(at(jobs, 1).steps.map((step) => step.label)).toEqual(["Publish @acme/packs/toolkit"]);
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
      expect(at(at(executed.jobs, 1).steps, 0).result).toMatchObject({
        result: "error",
        message: "blocked by earlier job failure",
      });
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
