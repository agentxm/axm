import { describe, expect, it } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { normalizeHandle } from "../extensions/handle.js";
import { exactVersion, extensionName } from "../test-helpers.js";
import type { RegistrySkillRef } from "../skills/refs.js";
import type { WorkspaceSkillRef } from "../skills/refs.js";
import type { Lockfile } from "../lockfile/index.js";
import { makeRegistryPackLockEntry, makeRegistrySkillLockEntry } from "../workspace/test-stubs.js";
import { computeSourceHash } from "../extensions/index.js";
import type { WorkspaceTrustState } from "./schema.js";
import {
  trustStateFromLockfile,
  trustedRegistryVersionForRef,
  validateRefTrustTransition,
} from "./state.js";

const registrySkillRef = (owner: string, publisherBindingId: string): RegistrySkillRef => ({
  type: "skill",
  refType: "registry",
  source: {
    type: "registry",
    location: new URL("https://registry.example.com"),
    owner: Option.some(normalizeHandle(owner)),
  },
  owner: normalizeHandle(owner),
  name: extensionName("review"),
  version: exactVersion("1.2.3"),
  publisherBindingId,
  integrity: Option.some("sha512-AAAA=="),
  packages: [],
  skill: {
    name: extensionName("review"),
    description: Option.none(),
    metadata: Option.none(),
  },
});

const epochState: WorkspaceTrustState = {
  trustStateVersion: 1,
  records: {
    "skill:review": {
      extensionType: "skill",
      name: "review",
      authority: "registry",
      sourceIdentity: "@acme/skills/review",
      resolvedVersion: "1.2.3",
      publisherBindingId: "hbnd_epoch_1",
    },
  },
};

const workspaceSkillRef = (owner: string): WorkspaceSkillRef => {
  const name = extensionName("review");
  const normalizedOwner = normalizeHandle(owner);
  return {
    type: "skill",
    refType: "workspace",
    source: {
      type: "workspace",
      owner: normalizedOwner,
      extensionType: "skill",
      name,
    },
    owner: normalizedOwner,
    name,
    version: exactVersion("1.2.3"),
    scope: "project",
    location: `file:///workspace/.axm/extensions/${owner}/skills/review`,
    sourceHash: computeSourceHash("review"),
    skill: { name, description: Option.none(), metadata: Option.none() },
  };
};

describe("workspace trust state", () => {
  it("preserves registry publisher epoch and source identity", () => {
    const lockfile: Lockfile = {
      lockfileVersion: 3,
      skills: {
        review: makeRegistrySkillLockEntry({
          owner: normalizeHandle("@acme"),
          name: "review",
          publisherBindingId: "hbnd_epoch_2",
        }),
      },
    };

    expect(trustStateFromLockfile(lockfile).records["skill:review"]).toMatchObject({
      extensionType: "skill",
      name: "review",
      authority: "registry",
      sourceIdentity: "@acme/skills/review",
      sourceName: "default",
      resolvedVersion: "1.0.0",
      publisherBindingId: "hbnd_epoch_2",
      integrity: "sha512-AAAA==",
    });
  });

  it("is invariant to optional receipt timestamps and pack-retention history", () => {
    const firstEntry = makeRegistrySkillLockEntry({
      owner: normalizeHandle("@acme"),
      name: "release",
      installedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
      updatedAt: DateTime.makeUnsafe("2025-01-02T00:00:00.000Z"),
    });
    const first: Lockfile = {
      lockfileVersion: 3,
      skills: {
        release: firstEntry,
      },
    };
    const second: Lockfile = {
      ...first,
      skills: {
        release: {
          ...firstEntry,
          installedAt: DateTime.makeUnsafe("2026-02-01T00:00:00.000Z"),
          updatedAt: DateTime.makeUnsafe("2026-02-02T00:00:00.000Z"),
          retainedByPack: true,
        },
      },
    };

    expect(trustStateFromLockfile(second)).toEqual(trustStateFromLockfile(first));
  });

  it("preserves the canonical content identity for registry packs", () => {
    const sourceHash = computeSourceHash("canonical pack content");
    const lockfile: Lockfile = {
      lockfileVersion: 3,
      skills: {},
      packs: {
        toolkit: makeRegistryPackLockEntry({
          owner: normalizeHandle("@acme"),
          name: "toolkit",
          sourceHash,
        }),
      },
    };

    expect(trustStateFromLockfile(lockfile).records["pack:toolkit"]).toMatchObject({
      extensionType: "pack",
      name: "toolkit",
      authority: "registry",
      sourceIdentity: "@acme/packs/toolkit",
      contentIdentity: sourceHash,
    });
  });

  it.effect("reuses a Registry baseline only for the same source and publisher epoch", () =>
    Effect.gen(function* () {
      const same = registrySkillRef("@acme", "hbnd_epoch_1");
      const differentSource = registrySkillRef("@other", "hbnd_epoch_1");

      expect(trustedRegistryVersionForRef(epochState, same)).toBe("1.2.3");
      expect(trustedRegistryVersionForRef(epochState, differentSource)).toBeUndefined();
      const error = yield* validateRefTrustTransition(epochState, differentSource).pipe(
        Effect.flip,
      );
      expect(error.code).toBe("conflict");

      const workspaceOnlyError = yield* validateRefTrustTransition(epochState, differentSource, {
        allowWorkspaceSourceTransition: true,
      }).pipe(Effect.flip);
      expect(workspaceOnlyError.code).toBe("conflict");

      yield* validateRefTrustTransition(epochState, differentSource, {
        allowSourceTransition: true,
      });
    }),
  );

  it.effect("fails closed when a Registry handle crosses publisher epochs", () =>
    Effect.gen(function* () {
      const changedEpoch = registrySkillRef("@acme", "hbnd_epoch_2");
      const error = yield* validateRefTrustTransition(epochState, changedEpoch).pipe(Effect.flip);

      expect(error.code).toBe("conflict");
      expect(error.detail).toContain("Publisher identity changed");
      expect(trustedRegistryVersionForRef(epochState, changedEpoch)).toBeUndefined();
    }),
  );

  it.effect("renders one workspace prefix and an executable recovery command", () =>
    Effect.gen(function* () {
      const state: WorkspaceTrustState = {
        trustStateVersion: 1,
        records: {
          "skill:review": {
            extensionType: "skill",
            name: "review",
            authority: "workspace",
            sourceIdentity: "workspace:@original/skills/review",
            resolvedVersion: "1.2.3",
          },
        },
      };
      const relocated = workspaceSkillRef("@other");
      const error = yield* validateRefTrustTransition(state, relocated).pipe(Effect.flip);

      expect(error.detail).toContain(
        "from workspace:@original/skills/review to workspace:@other/skills/review",
      );
      expect(error.detail).not.toContain("workspace:workspace:");
      expect(error.suggestions).toContainEqual({
        description: "Preview adoption of the relocated workspace authoring source",
        cmd: "axm adopt @other/skills/review --preview",
      });

      yield* validateRefTrustTransition(state, relocated, {
        allowWorkspaceSourceTransition: true,
      });
    }),
  );
});
