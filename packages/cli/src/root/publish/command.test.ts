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
  onExisting: Option.none(),
  skipExisting: false,
  allowOlder: false,
  allowUnsafeArchive: false,
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
      "lockfileVersion: 3\nskills: {}\n",
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

    const writeTwoSkillSettings = () => {
      fs.writeFileSync(
        path.join(tempDir, ".axm", "settings.json"),
        JSON.stringify({
          owner: "@acme",
          agents: [],
          skills: {
            review: "workspace:@acme/skills/review",
            deploy: "workspace:@acme/skills/deploy",
          },
        }),
      );
      writeSkill("review", "1.0.0");
      writeSkill("deploy", "1.0.0");
    };

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

    it.effect("bulk publish skips already-published versions by default", () => {
      writeTwoSkillSettings();
      const { provide, rendererState } = makeContext();
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          yield* handleRootPublish(args(registryUrl, { preview: false }));
          writeSkill("deploy", "1.1.0");
          yield* handleRootPublish(args(registryUrl, { preview: false }));

          const items = resultItems(at(rendererState.results, 1).data, "apply", 2);
          const review = itemNamed(items, "review");
          expect(property(review, "action")).toBe("skip");
          expect(property(review, "reason")).toBe("version_already_published");
          const deploy = itemNamed(items, "deploy");
          expect(property(deploy, "action")).toBe("publish");
          expect(property(deploy, "status")).toBe("success");
        }),
      );
    });

    it.effect("a single explicit selector still errors on an existing version", () => {
      writeTwoSkillSettings();
      const { provide } = makeContext();
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
            suggestions.some((suggestion) => suggestion.description.includes("--on-existing skip")),
          ).toBe(true);
        }),
      );
    });

    it.effect("--skip-existing behaves as --on-existing skip for an explicit selector", () => {
      writeTwoSkillSettings();
      const { provide, rendererState } = makeContext();
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          yield* handleRootPublish(args(registryUrl, { preview: false }));
          yield* handleRootPublish(
            args(registryUrl, {
              selectors: ["@acme/skills/review"],
              preview: false,
              skipExisting: true,
            }),
          );
          yield* handleRootPublish(
            args(registryUrl, {
              selectors: ["@acme/skills/review"],
              preview: false,
              onExisting: Option.some("skip"),
            }),
          );

          const viaAlias = itemNamed(
            resultItems(at(rendererState.results, 1).data, "apply", 1),
            "review",
          );
          const viaPolicy = itemNamed(
            resultItems(at(rendererState.results, 2).data, "apply", 1),
            "review",
          );
          for (const item of [viaAlias, viaPolicy]) {
            expect(property(item, "action")).toBe("skip");
            expect(property(item, "reason")).toBe("version_already_published");
          }
        }),
      );
    });

    it.effect("rejects --skip-existing combined with a contradictory --on-existing", () => {
      const { provide } = makeContext();
      const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

      return provide(
        Effect.gen(function* () {
          const error = getAppError(
            yield* handleRootPublish(
              args(registryUrl, { skipExisting: true, onExisting: Option.some("error") }),
            ).pipe(Effect.flip),
          );
          expect(error.code).toBe("usage");
          expect(error.detail).toContain("--skip-existing");
        }),
      );
    });

    it.effect("publishes remaining candidates when one conflicts under the error policy", () => {
      writeTwoSkillSettings();
      const { provide, rendererState } = makeContext();
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
          const deploy = itemNamed(items, "deploy");
          expect(property(deploy, "status")).toBe("success");

          yield* handleRootPublish(args(registryUrl, { preview: false }));
          const rerunItems = resultItems(at(rendererState.results, 2).data, "apply", 2);
          expect(property(itemNamed(rerunItems, "deploy"), "action")).toBe("skip");
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
        const { provide } = makeContext();
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
              suggestions.some((suggestion) => suggestion.description.includes("--allow-older")),
            ).toBe(true);
          }),
        );
      });

      it.effect("--allow-older publishes the older version", () => {
        const { provide, rendererState } = makeContext();
        const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

        return provide(
          Effect.gen(function* () {
            writeReviewSkill("1.1.0");
            yield* handleRootPublish(args(registryUrl, { preview: false }));

            writeReviewSkill("1.0.5");
            yield* handleRootPublish(explicit(registryUrl, { allowOlder: true }));

            const item = reviewItem(at(rendererState.results, 1).data);
            expect(property(item, "action")).toBe("publish");
            expect(property(item, "status")).toBe("success");
            expect(property(item, "version")).toBe("1.0.5");
          }),
        );
      });

      it.effect("--force does not bypass the monotonicity gate", () => {
        const { provide } = makeContext();
        const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

        return provide(
          Effect.gen(function* () {
            writeReviewSkill("1.1.0");
            yield* handleRootPublish(args(registryUrl, { preview: false }));

            writeReviewSkill("1.0.5");
            const error = getAppError(
              yield* handleRootPublish(explicit(registryUrl, { force: true })).pipe(Effect.flip),
            );

            expect(error.code).toBe("conflict");
            expect(error.detail).toContain("lower than the highest published version 1.1.0");
          }),
        );
      });

      it.effect("compares by semver rather than registry index order", () => {
        const { provide } = makeContext();
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
            yield* handleRootPublish(explicit(registryUrl, { allowOlder: true }));

            writeReviewSkill("1.9.0");
            const error = getAppError(
              yield* handleRootPublish(explicit(registryUrl)).pipe(Effect.flip),
            );

            expect(error.code).toBe("conflict");
            expect(error.detail).toContain("lower than the highest published version 2.0.0");
          }),
        );
      });

      it.effect("leaves the first publish and equal-version policy untouched", () => {
        const { provide, rendererState } = makeContext();
        const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

        return provide(
          Effect.gen(function* () {
            writeReviewSkill("1.1.0");
            yield* handleRootPublish(explicit(registryUrl));
            expect(property(reviewItem(at(rendererState.results, 0).data), "status")).toBe(
              "success",
            );

            const error = getAppError(
              yield* handleRootPublish(explicit(registryUrl)).pipe(Effect.flip),
            );
            expect(error.code).toBe("conflict");
            expect(error.detail).toContain("already published");
          }),
        );
      });
    });

    describe("archive guardrails", () => {
      it.effect("refuses an archive containing node_modules", () => {
        const { provide } = makeContext();
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
            expect(
              (error.suggestions ?? []).some((suggestion) =>
                suggestion.description.includes("--allow-unsafe-archive"),
              ),
            ).toBe(true);
          }),
        );
      });

      it.effect("refuses an archive containing a .env file", () => {
        const { provide } = makeContext();
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

      it.effect("--allow-unsafe-archive publishes the archive anyway", () => {
        const { provide, rendererState } = makeContext();
        const registryUrl = pathToFileURL(path.join(tempDir, "registry")).href;

        return provide(
          Effect.gen(function* () {
            writeReviewSkill("1.0.0");
            fs.mkdirSync(path.join(skillDir(), "node_modules"), { recursive: true });
            fs.writeFileSync(
              path.join(skillDir(), "node_modules", "leftover.js"),
              "module.exports = {}\n",
            );

            yield* handleRootPublish(explicit(registryUrl, { allowUnsafeArchive: true }));

            const item = reviewItem(at(rendererState.results, 0).data);
            expect(property(item, "action")).toBe("publish");
            expect(property(item, "status")).toBe("success");
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
