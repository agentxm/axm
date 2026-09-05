import { getAppError, handleMcpsImport } from "axm.sh/specification-harness";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { describe, expect, it } from "@effect/vitest";
import { afterEach } from "vitest";
import { defineSpecification } from "@agentxm/extension-model/unstable/specifications";
import {
  importedRemote,
  readImportedMcpManifest,
  readNativeMcpServers,
  writeNativeRemoteMcp,
} from "../support/mcp-package-import-fixture.js";
import {
  expectProtectedStateUntouched,
  snapshotProtectedState,
} from "../support/preview-purity.js";
import { makeSpecWorkspace } from "../support/install-harness.js";
import { authoringTypes, readPackageJson } from "../support/authoring-fixtures.js";
import { createNewExtension } from "../support/new-extension-fixture.js";
import { snapshotWorkspaceContent } from "../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/creation-uses-configured-workspace-ownership",
  title: "Creation uses the configured workspace owner",
  statement:
    "When a person creates an extension, AXM shall use the configured workspace owner, accept an explicitly matching owner with or without its leading @, and refuse creation before changing workspace content when no owner is configured or the explicitly requested owner differs.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  derivedFrom: [
    "packages/cli/src/root/hooks/new.internal.test.ts",
    "packages/cli/src/root/shared/authored-owner.ts",
    "packages/cli/src/root/shared/resolve-owner.ts",
  ],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Workspace author ownership", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  for (const row of authoringTypes)
    for (const override of ["@acme", "acme"])
      it.effect(`accepts ${override} for a ${row.type} in the @acme workspace`, () =>
        Effect.gen(function* () {
          const workspace = makeSpecWorkspace({
            machine: true,
            settings: { agents: [], owner: "@acme" },
          });
          cleanups.push(workspace.cleanup);
          yield* createNewExtension(row, "review", Option.some(override)).pipe(
            Effect.provide(workspace.layer),
          );
          expect(
            readPackageJson(workspace.root, `${row.plural}/review/${row.manifest}`),
          ).toMatchObject({ owner: "@acme", name: "review", type: row.type });
        }),
      );

  for (const row of authoringTypes)
    for (const fault of [
      "missing-owner",
      "override-without-workspace-owner",
      "different-owner",
    ] as const)
      it.effect(`refuses ${fault} for ${row.type} before creating content`, () =>
        Effect.gen(function* () {
          const workspace = makeSpecWorkspace({ machine: true, settings: { agents: [] } });
          cleanups.push(workspace.cleanup);
          if (fault !== "different-owner") workspace.writeSettings({ agents: [] });
          const before = snapshotWorkspaceContent(workspace.root);
          const override =
            fault === "missing-owner"
              ? Option.none<string>()
              : Option.some(fault === "different-owner" ? "@other" : "@acme");
          const outcome = yield* createNewExtension(row, "review", override).pipe(
            Effect.flip,
            Effect.provide(workspace.layer),
          );
          expect(getAppError(outcome).code).toBe(
            fault === "different-owner" ? "conflict" : "validation",
          );
          expect(snapshotWorkspaceContent(workspace.root)).toEqual(before);
        }),
      );

  for (const owner of ["matching", "different", "missing"] as const)
    it.effect(
      `MCP package conversion requires a ${owner} workspace owner to match its target`,
      () =>
        Effect.gen(function* () {
          const workspace = makeSpecWorkspace({
            machine: true,
            recordWrites: true,
            settings: { owner: owner === "missing" ? undefined : "@acme", agents: ["claude-code"] },
          });
          cleanups.push(workspace.cleanup);
          writeNativeRemoteMcp(workspace.root);
          expect(readNativeMcpServers(workspace.root)["native-context"]).toEqual(importedRemote);
          const before = snapshotProtectedState(workspace.root);
          const command = handleMcpsImport({
            preview: false,
            as: Option.some(owner === "different" ? "@other/mcps/context" : "@acme/mcps/context"),
          });
          if (owner === "matching") {
            yield* command.pipe(Effect.provide(workspace.layer));
            expect(readImportedMcpManifest(workspace.root)).toMatchObject({
              owner: "@acme",
              name: "context",
            });
          } else {
            const failure = yield* command.pipe(Effect.flip, Effect.provide(workspace.layer));
            expect(getAppError(failure).code).toBe(owner === "missing" ? "validation" : "conflict");
            expectProtectedStateUntouched({
              root: workspace.root,
              before,
              writes: workspace.writes,
            });
          }
        }),
    );
});
