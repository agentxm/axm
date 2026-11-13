import { passThroughRegistryAuthorization } from "@agentxm/registry-client/testing";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions/handle";
import { decodeRegistryEndpointSync } from "@agentxm/extension-model/unstable/extensions/registry-endpoint";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { makeRegistrySkillLockEntry } from "@agentxm/workspace-kernel/workspace-state/testing";
import {
  inspectionRegistryUrl,
  makeInspectionFixture,
  publishedSkillSelection,
} from "../testing.js";
import { ListExtensions } from "./list-extensions.js";

describe("Registry assessment batching", () => {
  for (const count of [10, 101]) {
    it.effect(`assesses ${count} installed identities in protocol-sized batches`, () => {
      const names = Array.from(
        { length: count },
        (_, index) => `skill-${String(index).padStart(3, "0")}`,
      );
      let authorityReads = 0;
      const readsAtDispatch: number[] = [];
      const fixture = makeInspectionFixture({
        authorization: {
          ...passThroughRegistryAuthorization,
          currentContext: (endpoint) =>
            Effect.gen(function* () {
              authorityReads += 1;
              yield* Effect.yieldNow;
              return yield* passThroughRegistryAuthorization.currentContext(endpoint);
            }),
        },
        settings: {
          agents: ["claude-code"],
          sources: [{ name: "company", type: "registry", location: inspectionRegistryUrl }],
          skills: Object.fromEntries(
            names.map((name) => [name, `company:@acme/skills/${name}@^1.0.0`]),
          ),
        },
        lockfile: {
          skills: Object.fromEntries(
            names.map((name) => [
              name,
              makeRegistrySkillLockEntry({
                owner: decodeHandleSync("@acme"),
                name,
                endpoint: decodeRegistryEndpointSync(inspectionRegistryUrl),
              }),
            ]),
          ),
        },
        files: Object.fromEntries(
          names.map((name) => [
            `agent_extensions/company/@acme/skills/${name}/SKILL.md`,
            `---\nname: ${name}\ndescription: Assessment fixture\n---\n# Guidance\n`,
          ]),
        ),
        respond: (request) => {
          readsAtDispatch.push(authorityReads);
          return {
            body: publishedSkillSelection(request, {
              versions: [
                { version: "1.1.0", published: "2026-02-01T00:00:00.000Z" },
                { version: "1.0.0", published: "2026-01-01T00:00:00.000Z" },
              ],
            }),
          };
        },
      });
      return fixture
        .provide(
          Effect.gen(function* () {
            const before = fixture.snapshot();
            const result = yield* ListExtensions.query({ filter: "outdated" });
            expect(result.document.count).toBe(count);
            expect(readsAtDispatch).toEqual(count === 10 ? [1] : [1, 102]);
            expect(authorityReads).toBe(count + (count === 10 ? 1 : 2));
            expect(result.document.items.map((item) => item.name)).toEqual(names);
            expect(result.document.coverage).toMatchObject({ checked: count, unknown: 0 });
            // Records real client requests at the controlled HTTP port, not wire traffic.
            expect(fixture.requests.map((request) => request.selection?.items.length)).toEqual(
              count === 10 ? [10] : [100, 1],
            );
            expect(
              fixture.requests
                .flatMap(
                  (request) => request.selection?.items.map((item) => item.identity.name) ?? [],
                )
                .sort(),
            ).toEqual(names);
            expect(fixture.snapshot()).toEqual(before);
          }),
        )
        .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
    });
  }
});
