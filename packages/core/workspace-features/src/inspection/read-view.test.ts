import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { decodeHandleSync } from "@agentxm/extension-model/unstable/extensions";
import { makeRegistryMcpServerLockEntry } from "@agentxm/workspace-kernel/workspace-state/testing";
import { ListExtensions } from "./extension-list/list-extensions.js";
import { ShowExtension } from "./show/show-extension.js";
import { listSkills } from "./type-list/type-lists.js";
import {
  makeInstalledSkillFixture,
  makeInspectionFixture,
  inspectionRegistryUrl,
} from "./testing.js";

describe("inspection read phase", () => {
  it.effect.each([1, 40])(
    "reads each document once with %s aliases of one accepted MCP package",
    (size) => {
      const fixture = makeInspectionFixture({
        settings: {
          defaultRegistry: "test",
          sources: [{ name: "test", type: "registry", location: inspectionRegistryUrl }],
          mcpServers: Object.fromEntries(
            Array.from({ length: size }, (_, index) => [
              `context-${String(index)}`,
              { source: "test:@acme/mcps/context", enabled: true },
            ]),
          ),
        },
        lockfile: {
          mcpServers: {
            [`registry:${encodeURIComponent(inspectionRegistryUrl)}:@acme/mcps/context`]:
              makeRegistryMcpServerLockEntry({
                owner: decodeHandleSync("@acme"),
                name: "context",
                endpoint: new URL(inspectionRegistryUrl),
              }),
          },
        },
      });
      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const reads = new Map<string, number>();
        const counted: FileSystem.FileSystem = {
          ...fs,
          readFileString: (path, ...options) =>
            Effect.gen(function* () {
              reads.set(path, (reads.get(path) ?? 0) + 1);
              return yield* fs.readFileString(path, ...options);
            }),
        };
        yield* fixture
          .provide(
            Effect.gen(function* () {
              reads.clear();
              const result = yield* ListExtensions.query({ filter: "all" });
              expect(result.document.count).toBe(size);
              expect(result.document.items.every((item) => item.version === "1.0.0")).toBe(true);
              expect(reads.get(`${fixture.root}/axm.json`)).toBe(1);
              expect(reads.get(`${fixture.root}/axm-lock.yaml`)).toBe(1);
              expect(fixture.requests).toEqual([]);
            }),
          )
          .pipe(Effect.provideService(FileSystem.FileSystem, counted));
      }).pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    },
  );

  it.effect(
    "reads selected settings and accepted state once per query, then observes the next query afresh",
    () => {
      const fixture = makeInstalledSkillFixture();
      return Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const reads = new Map<string, number>();
        const counted: FileSystem.FileSystem = {
          ...fs,
          readFileString: (path, ...options) =>
            Effect.gen(function* () {
              reads.set(path, (reads.get(path) ?? 0) + 1);
              return yield* fs.readFileString(path, ...options);
            }),
        };
        const assertDocumentReads = () => {
          expect(reads.get(`${fixture.root}/axm.json`)).toBe(1);
          expect(reads.get(`${fixture.root}/axm-lock.yaml`)).toBe(1);
        };
        yield* fixture
          .provide(
            Effect.gen(function* () {
              // Location admission has its own fixed reads; these counters cover the query phase.
              reads.clear();
              const first = yield* ListExtensions.query({ filter: "all" });
              expect(first.document.items[0]?.enabled).toBe(true);
              assertDocumentReads();

              reads.clear();
              yield* ShowExtension.query({ type: "skill", name: "review" });
              assertDocumentReads();

              reads.clear();
              yield* listSkills({});
              assertDocumentReads();

              fixture.writeFile(
                "axm.json",
                JSON.stringify({
                  agents: [],
                  defaultRegistry: "company",
                  sources: [{ name: "company", type: "registry", location: inspectionRegistryUrl }],
                  skills: {
                    review: { source: "company:@acme/skills/review@^1.0.0", enabled: false },
                  },
                }),
              );
              fixture.remove("agent_extensions/company/@acme/skills/review/SKILL.md");
              reads.clear();
              const second = yield* ListExtensions.query({ filter: "all" });
              expect(second.document.items[0]).toMatchObject({ enabled: false, installed: false });
              assertDocumentReads();
              expect(fixture.requests).toEqual([]);
            }),
          )
          .pipe(Effect.provideService(FileSystem.FileSystem, counted));
      }).pipe(Effect.provide(NodeServices.layer), Effect.ensuring(Effect.sync(fixture.cleanup)));
    },
  );
});
