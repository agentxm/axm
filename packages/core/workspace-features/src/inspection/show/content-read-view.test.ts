import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import { LocalInspection } from "../index.js";
import { makeAuthoredExtensionFixture } from "../testing.js";

it.effect("shares observed content bytes inside an inspection and refreshes the next query", () => {
  const fixture = makeAuthoredExtensionFixture("skill");
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const reads = new Map<string, number>();
    const counted: FileSystem.FileSystem = {
      ...fs,
      readFile: (file) =>
        Effect.gen(function* () {
          reads.set(file, (reads.get(file) ?? 0) + 1);
          return yield* fs.readFile(file);
        }),
    };
    yield* fixture
      .provide(
        Effect.gen(function* () {
          const first = yield* LocalInspection.query({
            selection: { kind: "identities", identities: ["example", "example"] },
            types: ["skill"],
          });
          expect(first.items).toHaveLength(1);
          expect(reads.get(`${fixture.root}/skills/example/skill.json`)).toBe(1);
          fixture.writeFile(
            "skills/example/skill.json",
            JSON.stringify({
              type: "skill",
              owner: "@acme",
              name: "example",
              version: "2.0.0",
              description: "Changed source",
            }),
          );
          const next = yield* LocalInspection.query({
            selection: { kind: "all" },
            types: ["skill"],
          });
          expect(next.items[0]?.observed.manifestVersion).toBe("2.0.0");
          expect(reads.get(`${fixture.root}/skills/example/skill.json`)).toBe(2);
        }),
      )
      .pipe(Effect.provideService(FileSystem.FileSystem, counted));
  }).pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
});

it.effect(
  "reports read-time changes instead of presenting captured bytes as a consistent snapshot",
  () => {
    const fixture = makeAuthoredExtensionFixture("skill");
    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      let changed = false;
      const moving: FileSystem.FileSystem = {
        ...fs,
        readFile: (file) =>
          Effect.gen(function* () {
            const bytes = yield* fs.readFile(file);
            if (!changed && file === `${fixture.root}/skills/example/skill.json`) {
              changed = true;
              fixture.writeFile(
                "skills/example/skill.json",
                JSON.stringify({
                  type: "skill",
                  owner: "@acme",
                  name: "example",
                  version: "2.0.0",
                  description: "Source changed while an inspection read was in progress",
                }),
              );
            }
            return bytes;
          }),
      };
      const result = yield* fixture
        .provide(LocalInspection.query({ selection: { kind: "all" }, types: ["skill"] }))
        .pipe(Effect.provideService(FileSystem.FileSystem, moving));
      expect(result.observationDiagnostics).toContainEqual(
        expect.objectContaining({
          code: "inspection-read-changed",
          path: `${fixture.root}/skills/example/skill.json`,
        }),
      );
      expect(result.coverage.state).toBe("partial");
    }).pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup)));
  },
);
