/**
 * The held-release policy each operation declares, applied by the one Pack
 * graph selection they share.
 *
 * A Pack whose only member release is still inside the minimum release age
 * has nothing eligible to select. Install and a targeted update declare
 * `preserve-or-block`, so with no accepted graph to preserve they refuse
 * before any write; a workspace-wide update declares `continue`, so it leaves
 * the Pack unchanged and reports the held member. A window the setting cannot
 * be read as refuses every path rather than reading as "no minimum".
 */

import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";

import { deriveOperationOutcome } from "../../../transitions/planning/index.js";
import {
  installRequest,
  makeInstallWorld,
  previewInstall,
  type InstallWorld,
} from "../../../lifecycle/install/test-helpers.js";
import {
  configuredUpdateRequest,
  expectResolved,
  previewUpdate,
  targetedUpdateRequest,
} from "../../../lifecycle/update/test-helpers.js";

const PACK = "toolkit";
const PACK_FQN = `@acme/packs/${PACK}`;
const MEMBER = "fresh";
const MEMBER_FQN = `@acme/skills/${MEMBER}`;
/** Passes the setting's grammar, but no duration can hold it. */
const UNREADABLE_WINDOW = "99999999999999999999d";

/** A Pack whose one member release was published a moment ago. */
const publishHeldMember = (registry: InstallWorld["registry"]): void => {
  registry.writeSkill(MEMBER, [
    { version: "1.0.0", body: "Fresh guidance.", published: new Date().toISOString() },
  ]);
  registry.writePack(PACK, [{ version: "1.0.0", dependencies: { [MEMBER_FQN]: "^1.0.0" } }]);
};

const heldMemberRecord = expect.objectContaining({
  reason: "minimum-release-age",
  target: MEMBER_FQN,
  dependencyPath: [PACK_FQN, MEMBER_FQN],
  candidateVersion: "1.0.0",
});

describe("Held Pack members follow the operation's declared policy", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const world = (settings: Readonly<Record<string, unknown>> = {}): InstallWorld => {
    const created = makeInstallWorld({ settings });
    cleanups.push(created.cleanup);
    publishHeldMember(created.registry);
    return created;
  };

  it.effect("a targeted Pack install withholds the unaged member and refuses", () => {
    const { workspace } = world();
    return workspace
      .provide(
        Effect.gen(function* () {
          const before = workspace.snapshot();

          const resolution = yield* previewInstall(
            installRequest({ type: "pack", subject: { kind: "source", source: PACK_FQN } }),
          );

          expect(deriveOperationOutcome(resolution)).toBe("blocked");
          expect(resolution.releaseAge?.holdbacks).toEqual([heldMemberRecord]);
          expect(workspace.snapshot()).toEqual(before);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("a configured install refuses the Pack it has no accepted graph to preserve", () => {
    const { workspace } = world({ packs: { [PACK]: PACK_FQN } });
    return workspace
      .provide(
        Effect.gen(function* () {
          const resolution = yield* previewInstall(
            installRequest({ subject: { kind: "configured" } }),
          );

          expect(deriveOperationOutcome(resolution)).toBe("blocked");
          expect(resolution.releaseAge?.holdbacks).toEqual([heldMemberRecord]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("a workspace-wide update leaves the Pack unchanged and continues", () => {
    const { workspace } = world({ packs: { [PACK]: PACK_FQN } });
    return workspace
      .provide(
        Effect.gen(function* () {
          const resolution = expectResolved(
            yield* previewUpdate(configuredUpdateRequest({ type: "pack" })),
          );

          expect(deriveOperationOutcome(resolution)).not.toBe("blocked");
          expect(resolution.releaseAge?.holdbacks).toEqual([heldMemberRecord]);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });

  it.effect("a targeted update refuses the Pack it has no accepted graph to preserve", () => {
    const { workspace } = world({ packs: { [PACK]: PACK_FQN } });
    return workspace
      .provide(
        Effect.gen(function* () {
          const resolution = expectResolved(
            yield* previewUpdate(targetedUpdateRequest({ source: PACK_FQN })),
          );

          expect(deriveOperationOutcome(resolution)).toBe("blocked");
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});

describe("An unreadable minimum release age refuses every path", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const refusal = expect.objectContaining({
    category: "validation",
    detail: `Invalid minimumReleaseAge "${UNREADABLE_WINDOW}"`,
  });

  const paths = [
    {
      path: "a configured install",
      settings: { skills: { [MEMBER]: MEMBER_FQN } },
      request: installRequest({ subject: { kind: "configured" } }),
    },
    {
      path: "a targeted Pack install",
      settings: {},
      request: installRequest({ type: "pack", subject: { kind: "source", source: PACK_FQN } }),
    },
    {
      path: "an install that names an exact release",
      settings: {},
      request: installRequest({
        type: "skill",
        subject: { kind: "source", source: `${MEMBER_FQN}@1.0.0` },
      }),
    },
  ] as const;

  it.effect.each(paths)("$path", ({ settings, request }) => {
    const created = makeInstallWorld({
      settings: { minimumReleaseAge: UNREADABLE_WINDOW, ...settings },
    });
    cleanups.push(created.cleanup);
    publishHeldMember(created.registry);
    return created.workspace
      .provide(
        Effect.gen(function* () {
          const failure = yield* previewInstall(request).pipe(Effect.flip);

          expect(failure).toEqual(refusal);
        }),
      )
      .pipe(Effect.provide(NodeServices.layer));
  });
});
