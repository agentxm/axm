import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as HttpClient from "effect/http/HttpClient";
import { RegistryClientFactoryTest } from "@agentxm/registry-client/testing";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import type { SkillExtensionRef } from "@agentxm/extension-model/unstable/extensions/refs/skill";
import type { ReleaseAgeEvaluation } from "@agentxm/extension-model/unstable/extensions/release-age";
import { NativePlatformTest } from "../locations/testing.js";
import { WorkspaceReadTest, extensionName } from "../workspace-state/testing.js";
import { SettingsReader } from "../workspace-state/index.js";
import { WorkspaceCatalog, SourceHostProviders } from "../sources/index.js";
import { WorkspaceCatalogTest, SourceHostProvidersTest } from "../sources/testing.js";
import { ReleaseAgePosture } from "./release-age-posture.js";
import {
  makeConfiguredReleaseAgePolicy,
  prepareConfiguredRegistryEntry,
  resolveConfiguredSkill,
} from "./configured-entry-resolution.js";

const transport = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make(() =>
    Effect.die("These configured-source controls must not issue HTTP requests"),
  ),
);
const base = Layer.mergeAll(
  WorkspaceReadTest({ baseDir: "/tmp/axm-configured-resolution" }),
  SourceHostProvidersTest(),
  RegistryClientFactoryTest(transport),
  Layer.succeed(ReleaseAgePosture, "enforce"),
).pipe(Layer.provideMerge(NativePlatformTest));

describe("configured source preparation", () => {
  for (const source of ["./vendor/review", "https://github.com/acme/review.git"]) {
    it.effect(`classifies ${source} once without demanding Registry policy`, () =>
      Effect.gen(function* () {
        const settings = yield* SettingsReader;
        const catalog = yield* WorkspaceCatalog;
        const providers = yield* SourceHostProviders;
        let graphReads = 0;
        let policyReads = 0;
        let discoveries = 0;
        const result = yield* Effect.gen(function* () {
          const policy = yield* makeConfiguredReleaseAgePolicy();
          return yield* resolveConfiguredSkill("review", "review", policy);
        }).pipe(
          Effect.provideService(SettingsReader, {
            ...settings,
            minimumReleaseAge: Effect.sync(() => {
              policyReads++;
            }).pipe(
              Effect.andThen(Effect.die("Local/Git resolution must not read Registry policy")),
            ),
          }),
          Effect.provideService(WorkspaceCatalog, {
            ...catalog,
            desiredExtensionGraph: Effect.sync(() => {
              graphReads++;
            }).pipe(Effect.andThen(catalog.desiredExtensionGraph)),
          }),
          Effect.provideService(SourceHostProviders, {
            ...providers,
            find: (classified) =>
              Effect.sync(() => {
                discoveries++;
                const name = extensionName("review");
                const common = {
                  type: "skill" as const,
                  name,
                  location: "file:///tmp/axm-configured-resolution/vendor/review",
                  skill: { name, description: Option.none<string>(), metadata: Option.none() },
                };
                if (classified.type === "local")
                  return [
                    { ...common, refType: "local", source: classified } satisfies SkillExtensionRef,
                  ];
                if (classified.type === "git")
                  return [
                    {
                      ...common,
                      refType: "git-hosted",
                      source: classified,
                      gitTreeSha: "a".repeat(40),
                      gitCommitSha: "b".repeat(40),
                    } satisfies SkillExtensionRef,
                  ];
                throw new Error("Expected the classified local/Git source");
              }),
            resolveNamedRegistry: () =>
              Effect.die("Local/Git resolution must not select a Registry release"),
          }),
        );
        expect(result.ref.name).toBe("review");
        expect(graphReads).toBe(1);
        expect(discoveries).toBe(1);
        expect(policyReads).toBe(0);
      }).pipe(
        Effect.scoped,
        Effect.provide(
          Layer.mergeAll(
            base,
            WorkspaceCatalogTest({
              desiredExtensionGraph: {
                problems: [],
                packMembership: [],
                nodes: [
                  {
                    type: "skill",
                    name: "review",
                    source,
                    identity: { authority: "path", locator: source },
                  },
                ],
              },
            }),
          ),
        ),
      ),
    );
  }

  for (const valid of [true, false]) {
    it.effect(
      `shares ${valid ? "successful" : "failed"} policy reads only when Registry selection needs them`,
      () =>
        Effect.gen(function* () {
          const settings = yield* SettingsReader;
          const providers = yield* SourceHostProviders;
          let policyReads = 0;
          let excludeReads = 0;
          const evaluations: ReleaseAgeEvaluation[] = [];
          yield* Effect.gen(function* () {
            const policy = yield* makeConfiguredReleaseAgePolicy();
            expect(policyReads).toBe(0);
            const attempts = yield* Effect.all(
              [0, 1].map(() =>
                prepareConfiguredRegistryEntry(
                  "review",
                  "@acme/skills/review",
                  "skill",
                  policy,
                ).pipe(Effect.flatten, Effect.result),
              ),
              { concurrency: "unbounded" },
            );
            expect(policyReads).toBe(1);
            if (valid) {
              expect(attempts.every(Result.isSuccess)).toBe(true);
              expect(excludeReads).toBe(1);
              expect(evaluations).toHaveLength(2);
              expect(evaluations[0]).toBe(evaluations[1]);
              expect(evaluations[0]?.evaluatedAt).toBe(policy.evaluatedAt);
            } else {
              expect(attempts.every(Result.isFailure)).toBe(true);
              const first = attempts[0];
              const second = attempts[1];
              if (
                first !== undefined &&
                second !== undefined &&
                Result.isFailure(first) &&
                Result.isFailure(second)
              ) {
                expect(first.failure._tag).toBe("ExtensionResolutionFailed");
                expect(first.failure).toBe(second.failure);
              }
              expect(evaluations).toEqual([]);
            }
          }).pipe(
            Effect.provideService(SettingsReader, {
              ...settings,
              minimumReleaseAge: Effect.sync(() => {
                policyReads++;
                return valid ? "24h" : "invalid";
              }),
              minimumReleaseAgeExclude: Effect.sync(() => {
                excludeReads++;
                return [];
              }),
            }),
            Effect.provideService(SourceHostProviders, {
              ...providers,
              resolveNamedRegistry: (_source, options) =>
                Effect.sync(() => {
                  evaluations.push(options.releaseAgeEvaluation);
                  return { kind: "not_found" as const, target: "@acme/skills/review" };
                }),
            }),
          );
        }).pipe(
          Effect.scoped,
          Effect.provide(
            Layer.mergeAll(
              base,
              WorkspaceCatalogTest({
                sources: [
                  {
                    type: "registry",
                    name: "agentxm",
                    location: decodeRegistryEndpointSync("https://registry.example.test"),
                  },
                ],
              }),
            ),
          ),
        ),
    );
  }
});
