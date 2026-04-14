import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { decodeExactSemverVersionSync } from "../../../version-constraints/version-constraints.js";
import { normalizeHandle } from "../../../extensions/handle.js";
import {
  makeBaseWorkspaceMock,
  makeRegistrySkillLockEntry,
  makeRegistryCommandLockEntry,
} from "../../test-stubs.js";
import { Workspace } from "../../service-interface.js";
import { makeExtensionsCurrentCheck } from "./extensions-current.js";
import { CHECK_IDS } from "../types.js";
import { runCheckGraph } from "../runner.js";
import { makeExtensionIndex, makeStubRegistryClient } from "../../version-currency/test-stubs.js";

const v = decodeExactSemverVersionSync;
const owner = normalizeHandle("@acme");

/** Minimal workspace-ready check that always passes. */
const passReadyCheck = {
  id: CHECK_IDS.workspaceReady,
  title: "Workspace ready",
  description: "stub",
  dependsOn: [] as ReadonlyArray<string>,
  runDiagnostics: Effect.succeed([]),
};

/** Minimal extensions-installed check that always passes. */
const passInstalledCheck = {
  id: CHECK_IDS.extensionsInstalled,
  title: "Extensions installed",
  description: "stub",
  dependsOn: [CHECK_IDS.workspaceReady],
  runDiagnostics: Effect.succeed([]),
};

/** Extensions-installed check that fails (has error findings). */
const failInstalledCheck = {
  id: CHECK_IDS.extensionsInstalled,
  title: "Extensions installed",
  description: "stub",
  dependsOn: [CHECK_IDS.workspaceReady],
  runDiagnostics: Effect.succeed([
    {
      id: "extensions-installed.findings",
      findings: [
        {
          id: "extensions-installed.lockfile-missing",
          severity: "error" as const,
          message: "lockfile missing",
        },
      ],
    },
  ]),
};

const workspace = { scope: "project" as const, path: "/tmp/.axm", baseDir: "/tmp" };

describe("extensionsCurrentCheck", () => {
  it.effect("emits update-available finding for non-current extensions", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getConfiguredSkills: () =>
          Effect.succeed({
            "code-review": {
              source: "@acme/skills/code-review@^1.0.0",
              enabled: true,
              packagingKind: "non-native" as const,
            },
          }),
        getLockedSkills: () =>
          Effect.succeed({
            "code-review": makeRegistrySkillLockEntry({
              owner,
              name: "code-review",
              resolvedVersion: v("1.0.0"),
            }),
          }),
      });

      const index = makeExtensionIndex("code-review", "skill", ["1.2.0", "1.1.0", "1.0.0"]);
      const client = makeStubRegistryClient([index]);
      const check = makeExtensionsCurrentCheck(client);
      const layer = Layer.succeed(Workspace, ws);

      const report = yield* runCheckGraph(
        [passReadyCheck, passInstalledCheck, check],
        workspace,
      ).pipe(Effect.provide(layer));
      const result = report.checks.find((c) => c.id === CHECK_IDS.extensionsCurrent);

      expect(result).toBeDefined();
      expect(result?.status).toBe("pass");
      expect(result?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "extensions-current.update-available",
            severity: "info",
            subject: { kind: "extension", ref: "@acme/skills/code-review" },
          }),
        ]),
      );
    }),
  );

  it.effect("emits major-update-available finding when latest has higher major", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getConfiguredCommands: () =>
          Effect.succeed({
            formatter: {
              source: "@acme/commands/formatter",
              enabled: true,
              packagingKind: "non-native" as const,
            },
          }),
        getLockedCommands: () =>
          Effect.succeed({
            formatter: makeRegistryCommandLockEntry({
              owner,
              name: "formatter",
              resolvedVersion: v("1.0.0"),
            }),
          }),
      });

      const index = makeExtensionIndex("formatter", "command", ["2.0.0", "1.0.0"]);
      const client = makeStubRegistryClient([index]);
      const check = makeExtensionsCurrentCheck(client);
      const layer = Layer.succeed(Workspace, ws);

      const report = yield* runCheckGraph(
        [passReadyCheck, passInstalledCheck, check],
        workspace,
      ).pipe(Effect.provide(layer));
      const result = report.checks.find((c) => c.id === CHECK_IDS.extensionsCurrent);

      expect(result?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "extensions-current.major-update-available",
            severity: "info",
            subject: { kind: "extension", ref: "@acme/commands/formatter" },
          }),
        ]),
      );
    }),
  );

  it.effect("produces no findings when all extensions are current", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getConfiguredSkills: () =>
          Effect.succeed({
            "code-review": {
              source: "@acme/skills/code-review",
              enabled: true,
              packagingKind: "non-native" as const,
            },
          }),
        getLockedSkills: () =>
          Effect.succeed({
            "code-review": makeRegistrySkillLockEntry({
              owner,
              name: "code-review",
              resolvedVersion: v("1.0.0"),
            }),
          }),
      });

      const index = makeExtensionIndex("code-review", "skill", ["1.0.0"]);
      const client = makeStubRegistryClient([index]);
      const check = makeExtensionsCurrentCheck(client);
      const layer = Layer.succeed(Workspace, ws);

      const report = yield* runCheckGraph(
        [passReadyCheck, passInstalledCheck, check],
        workspace,
      ).pipe(Effect.provide(layer));
      const result = report.checks.find((c) => c.id === CHECK_IDS.extensionsCurrent);

      expect(result?.status).toBe("pass");
      expect(result?.findings).toHaveLength(0);
    }),
  );

  it.effect("skips when extensions-installed fails", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm");
      const client = makeStubRegistryClient([]);
      const check = makeExtensionsCurrentCheck(client);
      const layer = Layer.succeed(Workspace, ws);

      const report = yield* runCheckGraph(
        [passReadyCheck, failInstalledCheck, check],
        workspace,
      ).pipe(Effect.provide(layer));
      const result = report.checks.find((c) => c.id === CHECK_IDS.extensionsCurrent);

      expect(result?.status).toBe("skip");
      expect(result?.findings).toHaveLength(0);
    }),
  );

  it.effect("excludes non-registry extensions from findings", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getConfiguredSkills: () =>
          Effect.succeed({
            "local-skill": {
              source: "github:user/repo",
              enabled: true,
              packagingKind: "non-native" as const,
            },
          }),
        getLockedSkills: () =>
          Effect.succeed({
            "local-skill": {
              type: "github" as const,
              owner: "user",
              repo: "repo",
              agents: ["claude-code"],
              installedAt: new Date("2025-01-01T00:00:00.000Z"),
              updatedAt: new Date("2025-01-01T00:00:00.000Z"),
            },
          }),
      });

      const client = makeStubRegistryClient([]);
      const check = makeExtensionsCurrentCheck(client);
      const layer = Layer.succeed(Workspace, ws);

      const report = yield* runCheckGraph(
        [passReadyCheck, passInstalledCheck, check],
        workspace,
      ).pipe(Effect.provide(layer));
      const result = report.checks.find((c) => c.id === CHECK_IDS.extensionsCurrent);

      expect(result?.status).toBe("pass");
      expect(result?.findings).toHaveLength(0);
    }),
  );

  it.effect("finding action references axm update <ref>", () =>
    Effect.gen(function* () {
      const ws = makeBaseWorkspaceMock("/tmp/.axm", {
        getConfiguredSkills: () =>
          Effect.succeed({
            "code-review": {
              source: "@acme/skills/code-review@^1.0.0",
              enabled: true,
              packagingKind: "non-native" as const,
            },
          }),
        getLockedSkills: () =>
          Effect.succeed({
            "code-review": makeRegistrySkillLockEntry({
              owner,
              name: "code-review",
              resolvedVersion: v("1.0.0"),
            }),
          }),
      });

      const index = makeExtensionIndex("code-review", "skill", ["1.2.0", "1.0.0"]);
      const client = makeStubRegistryClient([index]);
      const check = makeExtensionsCurrentCheck(client);
      const layer = Layer.succeed(Workspace, ws);

      const report = yield* runCheckGraph(
        [passReadyCheck, passInstalledCheck, check],
        workspace,
      ).pipe(Effect.provide(layer));
      const result = report.checks.find((c) => c.id === CHECK_IDS.extensionsCurrent);
      const finding = result?.findings[0];

      expect(finding?.action).toEqual(
        expect.objectContaining({
          label: "Update",
          command: "axm update @acme/skills/code-review",
        }),
      );
    }),
  );
});
