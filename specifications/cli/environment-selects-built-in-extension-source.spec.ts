import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ConfigProvider from "effect/ConfigProvider";
import { afterEach, vi } from "vitest";
import {
  runtimeBaseLayer,
  resolveBuiltInSources,
  ExecutionDirectory,
} from "axm.sh/specification-harness";
import { pathToFileURL } from "node:url";
import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import { describe, expect, it } from "@effect/vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import { makeSpecRegistry } from "../support/registry-fixture.js";
import {
  makeEnvironmentProcessFixture,
  withEnvironmentRegistry,
} from "../support/environment-process-fixture.js";

afterEach(() => vi.unstubAllEnvs());

export const specification = defineSpecification({
  requirement: "cli/environment-selects-built-in-extension-source",
  title: "The environment selects the built-in extension source",
  statement:
    "For extension resolution through the built-in AgentXM source, AXM shall use a non-empty AXM_REGISTRY_LOCATION before AXM_REGISTRY_URL, and otherwise use AXM_REGISTRY_URL or https://registry.agentxm.ai when that variable is unset or empty.",
  class: "functional",
  role: "interface",
  goals: ["extension-adoption", "machine-automation"],
  boundary: "process",
  boundaryRationale:
    "Fresh built CLI invocations resolve and acquire distinct package bytes from real file Registries and a controlled HTTP origin, so an environment value merely parsed but ignored cannot satisfy the cases.",
  methods: ["decision-table", "example"],
  derivedFrom: [
    "packages/cli/help/topics/environment.md",
    "packages/cli/src/runtime.internal.test.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [
    "Does AXM_REGISTRY_LOCATION also select non-resolution Registry commands such as view, authentication, and publication? Those commands currently use separate service-target selection; this requirement does not allocate their target policy.",
  ],
});

describe("Environment-selected extension resolution", () => {
  for (const location of [undefined, ""])
    for (const configuredUrl of [undefined, "", "https://selected-service.example.test"])
      it.effect(
        `location=${location === undefined ? "unset" : "empty"}, service=${configuredUrl === undefined ? "unset" : configuredUrl || "empty"}`,
        () => {
          vi.stubEnv("AXM_REGISTRY_LOCATION", location);
          const env: Readonly<Record<string, string>> =
            configuredUrl === undefined ? {} : { AXM_REGISTRY_URL: configuredUrl };
          const expected =
            configuredUrl === undefined || configuredUrl === ""
              ? "https://registry.agentxm.ai"
              : configuredUrl;
          return Effect.gen(function* () {
            const sources = yield* resolveBuiltInSources;
            const selected = sources.find((source) => source.name === "agentxm");
            expect(selected).toEqual({
              name: "agentxm",
              type: "registry",
              location: new URL(expected),
            });
          }).pipe(
            Effect.provideService(ExecutionDirectory, {
              path: decodeAbsolutePathSync(process.cwd()),
            }),
            Effect.provide(
              runtimeBaseLayer.pipe(
                Layer.provide(ConfigProvider.layer(ConfigProvider.fromEnv({ env }))),
              ),
            ),
          );
        },
      );
  for (const sourceForm of ["absolute path", "file URL", "HTTP URL", "empty location"] as const)
    for (const machine of [false, true])
      it(`${sourceForm}, ${machine ? "JSON" : "human"} output`, async () => {
        const fixture = makeEnvironmentProcessFixture();
        const registry = makeSpecRegistry();
        const selectedBody = `Selected source: ${sourceForm}.`;
        registry.writeSkill("environment-review", [{ version: "1.0.0", body: selectedBody }]);
        const registryDirectory = path.join(
          registry.root,
          "extensions/@acme/skills/environment-review",
        );
        const rawIndex: unknown = JSON.parse(
          fs.readFileSync(path.join(registryDirectory, "index.json"), "utf8"),
        );
        if (typeof rawIndex !== "object" || rawIndex === null || !("versions" in rawIndex))
          throw new Error("Invalid Registry fixture");
        const remoteIndex = {
          owner: "@acme",
          type: "skill",
          name: "environment-review",
          description: selectedBody,
          publisher_binding_id: "hbnd_test",
          visibility: "public",
          deprecation: null,
          versions: rawIndex.versions,
        };
        try {
          fs.writeFileSync(path.join(fixture.invoking, "axm.json"), JSON.stringify({ agents: [] }));
          await withEnvironmentRegistry(
            (request) =>
              request.endsWith("/archive")
                ? {
                    body: fs.readFileSync(path.join(registryDirectory, "1.0.0.zip")),
                    contentType: "application/zip",
                  }
                : { body: JSON.stringify(remoteIndex) },
            async (origin, requests) => {
              const fallback = sourceForm === "empty location";
              const location =
                sourceForm === "absolute path"
                  ? registry.root
                  : sourceForm === "file URL"
                    ? pathToFileURL(registry.root).href
                    : fallback
                      ? ""
                      : origin;
              const result = await fixture.run(
                [
                  "install",
                  "@acme/skills/environment-review",
                  "--non-interactive",
                  ...(machine ? ["--json"] : []),
                ],
                {
                  AXM_REGISTRY_LOCATION: location,
                  AXM_REGISTRY_URL: fallback ? origin : "https://registry.invalid",
                },
              );
              expect(result.exitCode, result.stdout + result.stderr).toBe(0);
              const acquired = path.join(
                fixture.invoking,
                "agent_extensions/agentxm/@acme/skills/environment-review/src/SKILL.md",
              );
              expect(fs.readFileSync(acquired, "utf8")).toContain(selectedBody);
              if (sourceForm === "absolute path" || sourceForm === "file URL")
                expect(requests).toEqual([]);
              else expect(requests.some((request) => request.endsWith("/archive"))).toBe(true);
              const settings: unknown = JSON.parse(
                fs.readFileSync(path.join(fixture.invoking, "axm.json"), "utf8"),
              );
              expect(settings).not.toHaveProperty("AXM_REGISTRY_LOCATION");
              expect(settings).not.toHaveProperty("AXM_REGISTRY_URL");
            },
          );
        } finally {
          registry.cleanup();
          fixture.cleanup();
        }
      });
});
