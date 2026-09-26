import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { makeLifecycleFixture } from "../testing.js";
import { resolveConfiguredUpdateSelection } from "./selector.js";

describe("configured update selection", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect(
    "matches an unqualified locator to the entry install recorded under a non-default Registry",
    () => {
      // Install records the locator bound to the effective default Registry;
      // update binds the same unqualified locator the same way, so they match.
      const workspace = makeLifecycleFixture({
        settings: {
          agents: [],
          defaultRegistry: "corp",
          sources: [{ name: "corp", type: "registry", location: "https://corp.example.test" }],
          skills: { x: { source: "corp:@acme/skills/x", enabled: true } },
        },
      });
      cleanups.push(workspace.cleanup);
      return workspace
        .provide(
          Effect.gen(function* () {
            const selection = yield* resolveConfiguredUpdateSelection({
              resourceType: "skill",
              source: Option.some("@acme/skills/x"),
              nameFilters: [],
              sourceMayMatchName: false,
            });
            expect(selection).toEqual({ _tag: "Names", names: ["x"] });
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

  it.effect("does not match a locator that spells another configured Registry", () => {
    const workspace = makeLifecycleFixture({
      settings: {
        agents: [],
        defaultRegistry: "corp",
        sources: [
          { name: "corp", type: "registry", location: "https://corp.example.test" },
          { name: "other", type: "registry", location: "https://other.example.test" },
        ],
        skills: { x: { source: "corp:@acme/skills/x", enabled: true } },
      },
    });
    cleanups.push(workspace.cleanup);
    return workspace
      .provide(
        Effect.gen(function* () {
          const selection = yield* resolveConfiguredUpdateSelection({
            resourceType: "skill",
            source: Option.some("other:@acme/skills/x"),
            nameFilters: [],
            sourceMayMatchName: false,
          });
          expect(selection._tag).toBe("NoMatch");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
