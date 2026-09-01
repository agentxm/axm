import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as nodePath from "node:path";

import {
  CATALOG_EXTENSION_TYPES,
  type CatalogExtensionType,
} from "@agentxm/extension-model/unstable/extension-types/schema";
import {
  decodeExtensionNameSync,
  decodeHandleSync,
  toExtensionTypePlural,
} from "@agentxm/extension-model/unstable/extensions";
import {
  configuredRow,
  makeBaseWorkspaceMock,
  makeRegistrySkillLockEntry,
  readModelRecordStubs,
  rowsFor,
} from "@agentxm/workspace-state/testing";
import { WorkspaceCatalogLive } from "../cli-runtime/workspace-catalog-live.js";
import { CodingAgentRepositoryLive } from "@agentxm/extension-workspace/live";
import { WorkspaceMutations, type WorkspaceMutationsService } from "@agentxm/workspace-state";
import { resolveIdentifier, resolveInstalledIdentifier } from "./resolve-identifier.js";

const name = (value: string) => decodeExtensionNameSync(value);

const workspaceWithCatalogLayer = (ws: WorkspaceMutationsService) => {
  const wsLayer = Layer.succeed(WorkspaceMutations, ws);
  return Layer.merge(
    wsLayer,
    WorkspaceCatalogLive.pipe(
      Layer.provide(wsLayer),
      Layer.provide(CodingAgentRepositoryLive),
      Layer.provide(NodeServices.layer),
    ),
  );
};
const resolveTestIdentifier = (
  args: Omit<Parameters<typeof resolveIdentifier>[0], "registrySourceName">,
) => resolveIdentifier({ ...args, registrySourceName: "agentxm" });

const provide = (
  effect: ReturnType<typeof resolveIdentifier>,
  options?: {
    readonly rows?: WorkspaceMutationsService["records"]["rows"];
    readonly registryDir?: string;
    readonly getLockedSkills?: WorkspaceMutationsService["getLockedSkills"];
  },
) =>
  effect.pipe(
    Effect.provide(
      Layer.mergeAll(
        workspaceWithCatalogLayer(
          makeBaseWorkspaceMock("/tmp/axm", {
            ...(options?.rows === undefined ? {} : { rows: options.rows }),
            ...(options?.getLockedSkills === undefined
              ? {}
              : { getLockedSkills: options.getLockedSkills }),
            getRegistrySourceHosts: () =>
              Effect.succeed([
                {
                  name: "agentxm",
                  type: "registry",
                  location: new URL(`file://${options?.registryDir ?? "/tmp/registry"}`),
                },
              ]),
          }),
        ),
        Layer.merge(NodeServices.layer, FetchHttpClient.layer),
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
      deprecation: null,
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
        resolveTestIdentifier({
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
        resolveTestIdentifier({
          input: "code-review",
          resourceType: "skill",
          scope: "installed",
        }),
        {
          rows: rowsFor({
            skill: [
              configuredRow({
                type: "skill",
                name: "localKey",
                source: "agentxm:@acme/skills/code-review",
              }),
            ],
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
          resolveTestIdentifier({
            input: "code-review",
            resourceType: "skill",
            scope: "installed",
          }),
          {
            rows: rowsFor({
              skill: [
                configuredRow({
                  type: "skill",
                  name: "acmeReview",
                  source: "@acme/skills/code-review",
                }),
                configuredRow({
                  type: "skill",
                  name: "otherReview",
                  source: "@other/skills/code-review",
                }),
              ],
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

  it.effect("ignores stale receipt identities", () =>
    Effect.gen(function* () {
      const resolved = yield* provide(
        resolveTestIdentifier({
          input: "code-review",
          resourceType: "skill",
          scope: "installed",
        }),
        {
          rows: rowsFor({
            skill: [
              configuredRow({
                type: "skill",
                name: "codeReview",
                source: "@current/skills/code-review",
              }),
            ],
          }),
          getLockedSkills: () =>
            Effect.succeed({
              codeReview: makeRegistrySkillLockEntry({
                owner: decodeHandleSync("@stale"),
                name: "code-review",
              }),
            }),
        },
      );

      expect(resolved.fqn).toBe("@current/skills/code-review");
    }),
  );

  it.effect("resolves a unique registry bare name", () =>
    Effect.gen(function* () {
      const registryDir = mkdtempSync(nodePath.join(tmpdir(), "axm-registry-"));
      writeRegistrySkill(registryDir, "@acme", "code-review");

      const resolved = yield* provide(
        resolveTestIdentifier({
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
        resolveTestIdentifier({
          input: "code-review",
          resourceType: "skill",
          scope: "both",
        }),
        {
          rows: rowsFor({
            skill: [
              configuredRow({
                type: "skill",
                name: "codeReview",
                source: "@installed/skills/code-review",
              }),
            ],
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
          resolveTestIdentifier({
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

/**
 * One desired-row override per catalog type. The `satisfies Record<…>` keeps
 * identifier resolution exhaustive when a new catalog type is introduced.
 */
const desiredOverride = (type: CatalogExtensionType): Partial<WorkspaceMutationsService> => ({
  records: {
    ...readModelRecordStubs,
    rows: rowsFor({
      [type]: [
        configuredRow({
          type,
          name: "installed",
          source: `@acme/${toExtensionTypePlural(type)}/shared`,
        }),
      ],
    }),
  },
});

const desiredOverrideFor = {
  skill: desiredOverride("skill"),
  "mcp-server": desiredOverride("mcp-server"),
  subagent: desiredOverride("subagent"),
  rule: desiredOverride("rule"),
  hook: desiredOverride("hook"),
  knowledge: desiredOverride("knowledge"),
} satisfies Record<CatalogExtensionType, Partial<WorkspaceMutationsService>>;

const provideForType = (
  effect: ReturnType<typeof resolveInstalledIdentifier>,
  type: CatalogExtensionType,
) =>
  effect.pipe(
    Effect.provide(
      Layer.mergeAll(
        workspaceWithCatalogLayer(makeBaseWorkspaceMock("/tmp/axm", desiredOverrideFor[type])),
        Layer.merge(NodeServices.layer, FetchHttpClient.layer),
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
