import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";

import { CATALOG_EXTENSION_TYPES, type CatalogExtensionType } from "../extension-types/schema.js";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
  toExtensionTypePlural,
} from "../extensions/index.js";
import type { SkillsLockMap } from "../lockfile/index.js";
import { decodeVersionSync } from "../version-constraints/version-constraints.js";
import { makeBaseWorkspaceMock, makeRegistrySkillLockEntry } from "../workspace/test-stubs.js";
import { WorkspaceMutations, type WorkspaceMutationsService } from "../workspace/index.js";
import { resolveIdentifier, resolveInstalledIdentifier } from "./resolve-identifier.js";

const owner = (value: string) => decodeHandleSync(value);
const name = (value: string) => decodeExtensionNameSync(value);

const provide = (
  effect: ReturnType<typeof resolveIdentifier>,
  options?: {
    readonly lockedSkills?: () => Effect.Effect<SkillsLockMap>;
    readonly registryDir?: string;
  },
) =>
  effect.pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(
          WorkspaceMutations,
          makeBaseWorkspaceMock("/tmp/axm", {
            getLockedSkills: options?.lockedSkills ?? (() => Effect.succeed({})),
            getRegistrySourceHosts: () =>
              Effect.succeed([
                {
                  name: "default",
                  type: "registry",
                  location: new URL(`file://${options?.registryDir ?? "/tmp/registry"}`),
                },
              ]),
          }),
        ),
        NodeServices.layer,
      ),
    ),
  );

const writeRegistrySkill = (registryDir: string, ownerValue: string, nameValue: string) => {
  const dir = nodePath.join(registryDir, "extensions", ownerValue, "skills", nameValue);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    nodePath.join(dir, "index.json"),
    JSON.stringify({
      owner: ownerValue,
      publisherBindingId: "hbnd_test",
      type: "skill",
      name: nameValue,
      versions: [
        { version: "1.0.0", published: "2025-01-01T00:00:00.000Z", integrity: "sha512-AAAA==" },
      ],
    }),
  );
};

describe("resolveIdentifier", () => {
  it.effect("passes through fully-qualified identifiers", () =>
    Effect.gen(function* () {
      const resolved = yield* provide(
        resolveIdentifier({
          input: "@acme/skills/code-review",
          resourceType: "skill",
          scope: "registry",
        }),
      );

      expect(resolved.fqn).toBe("@acme/skills/code-review");
      expect(resolved.name).toBe(name("code-review"));
      expect(resolved.source).toBe("passthrough");
    }),
  );

  it.effect("resolves a unique installed bare name", () =>
    Effect.gen(function* () {
      const resolved = yield* provide(
        resolveIdentifier({
          input: "code-review",
          resourceType: "skill",
          scope: "installed",
        }),
        {
          lockedSkills: () =>
            Effect.succeed({
              localKey: makeRegistrySkillLockEntry({
                owner: owner("@acme"),
                name: "code-review",
              }),
            }),
        },
      );

      expect(resolved.fqn).toBe("@acme/skills/code-review");
      expect(Option.getOrUndefined(resolved.installedName)).toBe("localKey");
    }),
  );

  it.effect("fails on ambiguous installed bare names", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        provide(
          resolveIdentifier({
            input: "code-review",
            resourceType: "skill",
            scope: "installed",
          }),
          {
            lockedSkills: () =>
              Effect.succeed({
                acmeReview: makeRegistrySkillLockEntry({
                  owner: owner("@acme"),
                  name: "code-review",
                }),
                otherReview: makeRegistrySkillLockEntry({
                  owner: owner("@other"),
                  name: "code-review",
                }),
              }),
          },
        ),
      );

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure.code).toBe("internal");
        expect(result.failure.detail).toContain("@acme/skills/code-review");
        expect(result.failure.detail).toContain("@other/skills/code-review");
      }
    }),
  );

  it.effect("resolves a unique registry bare name", () =>
    Effect.gen(function* () {
      const registryDir = mkdtempSync(nodePath.join(tmpdir(), "axm-registry-"));
      writeRegistrySkill(registryDir, "@acme", "code-review");

      const resolved = yield* provide(
        resolveIdentifier({
          input: "code-review",
          resourceType: "skill",
          scope: "registry",
        }),
        { registryDir },
      );

      expect(resolved.fqn).toBe("@acme/skills/code-review");
      expect(resolved.source).toBe("registry");
    }),
  );

  it.effect("prefers installed matches in both scope", () =>
    Effect.gen(function* () {
      const resolved = yield* provide(
        resolveIdentifier({
          input: "code-review",
          resourceType: "skill",
          scope: "both",
        }),
        {
          lockedSkills: () =>
            Effect.succeed({
              codeReview: makeRegistrySkillLockEntry({
                owner: owner("@installed"),
                name: "code-review",
              }),
            }),
        },
      );

      expect(resolved.fqn).toBe("@installed/skills/code-review");
      expect(resolved.source).toBe("installed");
    }),
  );

  it.effect("fails when a bare name is not found", () =>
    Effect.gen(function* () {
      const result = yield* Effect.result(
        provide(
          resolveIdentifier({
            input: "missing",
            resourceType: "skill",
            scope: "installed",
          }),
        ),
      );

      expect(result._tag).toBe("Failure");
      if (result._tag === "Failure") {
        expect(result.failure.code).toBe("not_found");
      }
    }),
  );
});

// Every registry lock arm carries the same field set, so one entry seeds any
// per-type lock map.
const sharedRegistryLockEntry = {
  type: "registry",
  owner: owner("@acme"),
  name: name("shared"),
  resolvedVersion: decodeVersionSync("1.0.0"),
  integrity: "sha512-AAAA==",
  sourceName: "default",
  publisherBindingId: "hbnd_test",
  installedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
  updatedAt: DateTime.makeUnsafe("2025-01-01T00:00:00.000Z"),
} as const;

const lockedEntries = { installed: sharedRegistryLockEntry };

/**
 * One lock-map override per catalog type. The `satisfies Record<…>` mirrors the
 * accessor table in `resolve-identifier.ts`: a new catalog type has to be wired
 * in both places or neither compiles.
 */
const lockedOverrideFor = {
  skill: { getLockedSkills: () => Effect.succeed(lockedEntries) },
  command: { getLockedCommands: () => Effect.succeed(lockedEntries) },
  "mcp-server": { getLockedMcpServers: () => Effect.succeed(lockedEntries) },
  subagent: { getLockedSubagents: () => Effect.succeed(lockedEntries) },
  files: { getLockedFiles: () => Effect.succeed(lockedEntries) },
  rule: { getLockedRules: () => Effect.succeed(lockedEntries) },
  hook: { getLockedHooks: () => Effect.succeed(lockedEntries) },
  knowledge: { getLockedKnowledge: () => Effect.succeed(lockedEntries) },
} as const satisfies Record<CatalogExtensionType, Partial<WorkspaceMutationsService>>;

const provideForType = (
  effect: ReturnType<typeof resolveInstalledIdentifier>,
  type: CatalogExtensionType,
) =>
  effect.pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(
          WorkspaceMutations,
          makeBaseWorkspaceMock("/tmp/axm", lockedOverrideFor[type]),
        ),
        NodeServices.layer,
      ),
    ),
  );

describe("resolveInstalledIdentifier over the catalog", () => {
  for (const type of CATALOG_EXTENSION_TYPES) {
    const plural = toExtensionTypePlural(type);

    it.effect(`resolves an installed bare name for ${type}`, () =>
      Effect.gen(function* () {
        const resolved = yield* provideForType(
          resolveInstalledIdentifier({ input: "installed", resourceType: type }),
          type,
        );

        expect(resolved.fqn).toBe(`@acme/${plural}/shared`);
        expect(Option.getOrUndefined(resolved.installedName)).toBe("installed");
      }),
    );

    it.effect(`accepts a fully-qualified ${type} identifier`, () =>
      Effect.gen(function* () {
        const resolved = yield* provideForType(
          resolveInstalledIdentifier({
            input: `@acme/${plural}/shared`,
            resourceType: type,
          }),
          type,
        );

        expect(resolved.fqn).toBe(`@acme/${plural}/shared`);
      }),
    );

    it.effect(`reports an unmatched ${type} name as not found`, () =>
      Effect.gen(function* () {
        const result = yield* Effect.result(
          provideForType(resolveInstalledIdentifier({ input: "absent", resourceType: type }), type),
        );

        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure.code).toBe("not_found");
        }
      }),
    );
  }
});
