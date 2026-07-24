import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { AuthClientTest, DeviceLoginInteractionTest } from "@agentxm/client-core/unstable/auth";
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
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
import {
  aggregatePublishFailure,
  handleRootPublish,
  type RootPublishHandlerArgs,
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
  onExisting: "error",
  skipExisting: false,
  yes: true,
  force: false,
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
      "lockfileVersion: 1\nskills: {}\n",
    );
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const makeContext = () => {
    const context = makeWorkspaceHandlerTestContext({
      machine: true,
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
        format: { name: "okf", version: "0.1" },
        bundleRoot: "src",
      }),
    );
    fs.writeFileSync(
      path.join(knowledgeDir, "src", "index.md"),
      "---\nokf_version: 0.1\n---\n# Platform knowledge\n",
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
        "    resource: https://example.com/adr-1",
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
      }),
    );
  });

  it.effect("rejects a Knowledge bundle whose manifest and root dialects disagree", () => {
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
      "---\nokf_version: 0.1\n---\n# Platform knowledge\n",
    );
    const { provide } = makeContext();

    return provide(
      Effect.gen(function* () {
        const error = getAppError(
          yield* handleRootPublish(
            args(pathToFileURL(path.join(tempDir, "registry")).href, { types: ["knowledge"] }),
          ).pipe(Effect.flip),
        );
        expect(error.detail).toContain("okf_version 0.1");
        expect(error.detail).toContain("format.version 0.2");
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
    const { provide } = makeContext();
    const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

    return provide(
      Effect.gen(function* () {
        yield* handleRootPublish(args(registryUrl, { preview: false }));
        yield* handleRootPublish(args(registryUrl, { onExisting: "verify" }));

        fs.appendFileSync(skillBody, "\nChanged after publish.\n");
        const error = getAppError(
          yield* handleRootPublish(args(registryUrl, { onExisting: "verify" })).pipe(Effect.flip),
        );
        expect(error.code).toBe("conflict");
        expect(error.detail).toContain("integrity drift");
      }),
    );
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
