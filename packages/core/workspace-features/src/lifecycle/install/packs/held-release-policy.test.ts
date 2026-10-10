import * as fs from "node:fs";
import * as path from "node:path";
import { FIXTURE_PUBLISHED_AT } from "@agentxm/registry-client/testing";
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

import { deriveOperationOutcome } from "@agentxm/workspace-kernel/operations";
import {
  installRequest,
  makeInstallWorld,
  previewInstall,
  type InstallWorld,
} from "../../../testing/install-world.js";
import {
  configuredUpdateRequest,
  expectResolved,
  previewUpdate,
  targetedUpdateRequest,
} from "../../update/test-helpers.js";

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

  for (const route of ["typed", "root"] as const)
    it.effect(
      `${route} source install preserves release-age evidence across selected packs`,
      () => {
        const created = makeInstallWorld({ settings: { minimumReleaseAge: "1d" } });
        cleanups.push(created.cleanup);
        created.registry.writeSkill(MEMBER, [
          { version: "1.1.0", body: "Young guidance.", published: new Date().toISOString() },
          { version: "1.0.0", body: "Mature guidance.", published: FIXTURE_PUBLISHED_AT },
        ]);
        const source = path.join(created.workspace.root, "vendor");
        for (const name of ["first", "second"]) {
          const directory = path.join(source, name);
          fs.mkdirSync(directory, { recursive: true });
          fs.writeFileSync(
            path.join(directory, "pack.json"),
            JSON.stringify({
              owner: "@acme",
              type: "pack",
              name,
              version: "1.0.0",
              description: "Release-age evidence fixture",
              dependencies: {
                [MEMBER_FQN]: {
                  source: { type: "registry", url: created.registry.source.location },
                  versionRange: "^1.0.0",
                },
              },
            }),
          );
        }
        return created.workspace
          .provide(
            Effect.gen(function* () {
              const before = created.workspace.snapshot();
              const resolution = yield* previewInstall(
                installRequest({
                  ...(route === "typed" ? { type: "pack" as const } : {}),
                  subject: { kind: "source", source },
                }),
              );
              expect(deriveOperationOutcome(resolution)).toBe("previewed");
              expect(resolution.releaseAge?.holdbacks).toEqual(
                expect.arrayContaining([
                  expect.objectContaining({
                    target: MEMBER_FQN,
                    candidateVersion: "1.1.0",
                    selectedVersion: "1.0.0",
                    dependencyPath: ["@acme/packs/first", MEMBER_FQN],
                  }),
                  expect.objectContaining({
                    target: MEMBER_FQN,
                    candidateVersion: "1.1.0",
                    selectedVersion: "1.0.0",
                    dependencyPath: ["@acme/packs/second", MEMBER_FQN],
                  }),
                ]),
              );
              expect(created.workspace.snapshot()).toEqual(before);
            }),
          )
          .pipe(Effect.provide(NodeServices.layer));
      },
    );

  it.effect(
    "an explicit repeated Pack install refuses the Pack it has no accepted graph to preserve",
    () => {
      const { workspace } = world({ packs: { [PACK]: PACK_FQN } });
      return workspace
        .provide(
          Effect.gen(function* () {
            const resolution = yield* previewInstall(
              installRequest({ type: "pack", subject: { kind: "source", source: PACK_FQN } }),
            );

            expect(deriveOperationOutcome(resolution)).toBe("blocked");
            expect(resolution.releaseAge?.holdbacks).toEqual([heldMemberRecord]);
          }),
        )
        .pipe(Effect.provide(NodeServices.layer));
    },
  );

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
      path: "an explicit skill install",
      settings: { skills: { [MEMBER]: MEMBER_FQN } },
      request: installRequest({ type: "skill", subject: { kind: "source", source: MEMBER_FQN } }),
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
