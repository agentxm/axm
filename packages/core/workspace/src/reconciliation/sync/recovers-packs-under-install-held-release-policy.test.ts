import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "../../transitions/planning/index.js";
import { expectResolved, makeFileRegistry, makeSyncFixture, previewSync } from "./test-helpers.js";

const PACK = "toolkit";
const PACK_FQN = `@acme/packs/${PACK}`;
const MEMBER_FQN = "@acme/skills/fresh";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/**
 * Recovery replays a configured install, so it takes the install's declared
 * held-release policy: with no accepted graph to preserve, a Pack whose only
 * member release is still ageing is refused rather than left to continue.
 */
it.effect("recovery refuses a Pack whose held member leaves nothing to preserve", () => {
  const registry = makeFileRegistry();
  cleanups.push(registry.cleanup);
  registry.writeSkill("fresh", [
    { version: "1.0.0", body: "Fresh guidance.", published: new Date().toISOString() },
  ]);
  registry.writePack(PACK, [{ version: "1.0.0", dependencies: { [MEMBER_FQN]: "^1.0.0" } }]);
  const workspace = makeSyncFixture({
    settings: {
      owner: "@acme",
      agents: ["claude-code"],
      sources: [registry.source],
      packs: { [PACK]: PACK_FQN },
    },
  });
  cleanups.push(workspace.cleanup);
  return workspace
    .provide(
      Effect.gen(function* () {
        const resolution = expectResolved(yield* previewSync());

        expect(deriveOperationOutcome(resolution)).toBe("blocked");
        expect(
          resolution.units.some(
            (unit) =>
              unit.state === "blocked" &&
              (unit.message ?? "").includes("minimum release age still holds back"),
          ),
        ).toBe(true);
        expect(resolution.releaseAge?.holdbacks).toEqual([
          expect.objectContaining({
            target: MEMBER_FQN,
            dependencyPath: [PACK_FQN, MEMBER_FQN],
            candidateVersion: "1.0.0",
          }),
        ]);
      }),
    )
    .pipe(Effect.provide(NodeServices.layer));
});
