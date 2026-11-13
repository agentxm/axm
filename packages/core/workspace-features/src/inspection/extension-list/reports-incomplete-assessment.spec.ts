import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as TestClock from "effect/testing/TestClock";
import { defineSpecification } from "@agentxm/specification-metadata";

import { ListExtensions } from "./list-extensions.js";
import {
  makeInstalledSkillFixture,
  makeInspectionFixture,
  publishedSkillSelection,
  inspectionRegistryUrl,
} from "../testing.js";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { makeRegistrySkillLockEntry } from "@agentxm/workspace-kernel/workspace-state/testing";

export const specification = defineSpecification({
  requirement: "cli/list/reports-incomplete-assessment",
  title: "List reports incomplete Registry assessment",
  statement:
    "When requested Registry assessment cannot obtain current metadata, AXM shall retain the affected installation with an unknown assessment and its reason, count it as unknown in coverage, and preserve independently assessed results without presenting unavailable evidence as current or active.",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "machine-automation", "actionable-diagnostics"],
  boundaryRationale:
    "Production workspace services execute over native temporary files and directories; the default examples observe their state and outcomes without a separate CLI process.",
  boundary: "platform",
  methods: ["example"],
  derivedFrom: [
    "apps/cli/src/root/list/command.test.ts",
    "packages/core/workspace-features/src/inspection/extension-list/list-extensions.ts",
  ],
  supersedes: ["cli/list/fails-when-registry-assessment-fails"],
  assumptions: [],
  openQuestions: [],
});

describe("Incomplete Registry assessment", () => {
  it.effect("retains a failed assessment beside an independently confirmed update", () => {
    const brokenEndpoint = "https://broken-registry.example.test";
    const fixture = makeInspectionFixture({
      settings: {
        agents: ["claude-code"],
        sources: [
          { name: "company", type: "registry", location: inspectionRegistryUrl },
          { name: "broken", type: "registry", location: brokenEndpoint },
        ],
        skills: {
          healthy: "company:@acme/skills/healthy@^1.0.0",
          uncertain: "broken:@acme/skills/uncertain@^1.0.0",
        },
      },
      lockfile: {
        skills: {
          healthy: makeRegistrySkillLockEntry({
            owner: decodeHandleSync("@acme"),
            name: "healthy",
            endpoint: decodeRegistryEndpointSync(inspectionRegistryUrl),
          }),
          uncertain: makeRegistrySkillLockEntry({
            owner: decodeHandleSync("@acme"),
            name: "uncertain",
            endpoint: decodeRegistryEndpointSync(brokenEndpoint),
          }),
        },
      },
      files: {
        "agent_extensions/company/@acme/skills/healthy/SKILL.md":
          "---\nname: healthy\ndescription: Healthy\n---\n# Healthy\n",
        "agent_extensions/broken/@acme/skills/uncertain/SKILL.md":
          "---\nname: uncertain\ndescription: Uncertain\n---\n# Uncertain\n",
      },
      respond: (request) => ({
        body: request.url.startsWith(brokenEndpoint)
          ? { malformed: true }
          : publishedSkillSelection(request, {
              versions: [
                { version: "1.1.0", published: "2026-02-01T00:00:00Z" },
                { version: "1.0.0", published: "2026-01-01T00:00:00Z" },
              ],
            }),
      }),
    });
    return fixture
      .provide(
        Effect.gen(function* () {
          const result = yield* ListExtensions.query({ filter: "outdated" });
          expect(result.document).toMatchObject({
            count: 2,
            coverage: { eligible: 2, checked: 1, unknown: 1 },
          });
          expect(result.document.items).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                name: "healthy",
                assessment: expect.objectContaining({
                  state: "available",
                  latestMatching: "1.1.0",
                }),
              }),
              expect.objectContaining({
                name: "uncertain",
                assessment: expect.objectContaining({
                  state: "unknown",
                  reason: expect.any(String),
                }),
              }),
            ]),
          );
        }),
      )
      .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
  });

  for (const filter of ["outdated", "deprecated", "archived", "lifecycle"] as const)
    for (const missing of ["index", "source"] as const)
      it.effect(`${filter}: missing ${missing}`, () => {
        const fixture = makeInstalledSkillFixture({
          // The recorded source is unconfigured, or its index is absent.
          ...(missing === "source" ? { sources: [] } : {}),
          respond: () => ({
            status: 404,
            body: {
              type: "https://registry.agentxm.ai/v1/problems/not_found",
              title: "Not Found",
              status: 404,
              code: "extension_not_found",
              detail: "Fixture extension not found",
            },
          }),
        });
        return fixture
          .provide(
            Effect.gen(function* () {
              const result = yield* ListExtensions.query({ filter });
              expect(result.document).toMatchObject({
                filter,
                count: 1,
                items: [{ assessment: { state: "unknown", reason: expect.any(String) } }],
                coverage: { eligible: 1, checked: 0, unknown: 1 },
              });
            }),
          )
          .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
      });

  for (const filter of ["outdated", "deprecated", "archived", "lifecycle"] as const)
    it.effect(`${filter}: Registry unavailable`, () => {
      const fixture = makeInstalledSkillFixture({
        respond: () => ({
          status: 503,
          body: {
            type: "https://registry.agentxm.ai/v1/problems/service_unavailable",
            title: "Service Unavailable",
            status: 503,
            code: "service_unavailable",
            detail: "Fixture Registry unavailable",
          },
        }),
      });
      return fixture
        .provide(
          Effect.gen(function* () {
            const running = yield* ListExtensions.query({ filter }).pipe(Effect.forkChild);
            yield* fixture.firstRequest;
            yield* TestClock.adjust("31 seconds");
            const result = yield* Fiber.join(running);
            expect(result.document).toMatchObject({
              filter,
              count: 1,
              items: [{ assessment: { state: "unknown", reason: expect.any(String) } }],
              coverage: { eligible: 1, checked: 0, unknown: 1 },
            });
          }),
        )
        .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });
});
