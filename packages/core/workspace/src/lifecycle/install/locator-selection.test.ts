import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { ExtensionLifecycleFailed } from "../errors.js";
import { writeLocalSkillPackage } from "../testing.js";
import { applyInstall, installRequest, makeInstallWorld } from "./test-helpers.js";

describe("root locator install selection", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  it.effect("requires a per-type selector or --all in non-interactive mode", () => {
    const world = makeInstallWorld();
    cleanups.push(world.cleanup);
    const source = writeLocalSkillPackage(world.workspace.root, { name: "code-review" });

    return Effect.gen(function* () {
      const failure = yield* world.workspace
        .provide(
          applyInstall(
            installRequest({
              subject: { kind: "source", source },
              selectors: {},
              all: false,
              nonInteractive: true,
            }),
          ),
        )
        .pipe(Effect.provide(NodeServices.layer), Effect.flip);

      expect(failure).toBeInstanceOf(ExtensionLifecycleFailed);
      expect(failure).toMatchObject({
        category: "usage",
        detail: "A per-type selector or --all is required in non-interactive mode",
      });
    });
  });
});
