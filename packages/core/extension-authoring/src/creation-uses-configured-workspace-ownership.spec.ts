import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { afterEach } from "vitest";

import { defineSpecification } from "@agentxm/specification-metadata";

import { CreateExtension } from "./create/create-extension.js";
import { ImportNativeExtension } from "./import/import-native-extension.js";
import {
  applyExecution,
  authoringWorkspaceLayer,
  makeAuthoringWorkspace,
  previewExecution,
  type AuthoringWorkspace,
} from "./test-support/authoring-workspace.js";
import { authoringTypes, type AuthoringType } from "./test-support/authoring-packages.js";
import { createRequestFor } from "./test-support/create-requests.js";
import {
  NATIVE_MCP_KEY,
  importedRemote,
  nativeMcpDiscovery,
  readNativeMcpServers,
  writeNativeRemoteMcp,
} from "./test-support/native-mcp.js";

export const specification = defineSpecification({
  requirement: "cli/creation-uses-configured-workspace-ownership",
  title: "Creation uses the configured workspace owner",
  statement:
    "When a person creates an extension, AXM shall use the owner configured in the selected workspace scope, accept an explicitly requested owner with or without its leading @, record an explicitly requested owner as that scope's owner when it configures none, and refuse creation before changing workspace content when no owner is configured and none is requested or when the requested owner differs from the configured one; every applied creation leaves the scope's configured owner equal to the created package's owner, and a previewed creation records none.",
  class: "functional",
  role: "experience",
  goals: ["authoring-and-creation", "workspace-intent-fidelity"],
  methods: ["example", "decision-table"],
  boundary: "memory",
  boundaryRationale:
    "Ownership is one decision the authoring feature makes over the selected scope's settings, so each row is observable in a real project directory: the owner the manifest carries, the owner the settings record, and the byte-identical tree a refusal leaves behind.",
  derivedFrom: ["packages/core/extension-authoring/src/create/authoring-owner.ts"],
  supersedes: [],
  assumptions: [],
  openQuestions: [],
});

describe("Workspace author ownership", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  const workspace = (owner: string | undefined) => {
    const created = makeAuthoringWorkspace({
      ...(owner === undefined ? {} : { owner }),
      agents: [],
    });
    cleanups.push(created.cleanup);
    return created;
  };

  const create = (
    created: AuthoringWorkspace,
    row: AuthoringType,
    override: Option.Option<string>,
    mode: "preview" | "apply" = "apply",
  ) =>
    Effect.gen(function* () {
      const candidate = yield* CreateExtension.prepare(
        createRequestFor(row.type, "review", override),
      );
      return yield* CreateExtension.previewOrApply(
        candidate,
        mode === "preview" ? previewExecution : applyExecution,
      );
    }).pipe(Effect.provide(authoringWorkspaceLayer(created)));

  /** Every way a creation reaches @acme as the owner it writes. */
  const successRows = [
    {
      label: "the configured owner with no override",
      override: Option.none<string>(),
      owner: "@acme",
    },
    { label: "an override of @acme", override: Option.some("@acme"), owner: "@acme" },
    { label: "an override of acme", override: Option.some("acme"), owner: "@acme" },
    {
      label: "an override that establishes ownership",
      override: Option.some("@acme"),
      owner: undefined,
    },
  ] as const;

  for (const type of authoringTypes)
    for (const row of successRows)
      it.effect(`accepts ${row.label} for a ${type.type}`, () =>
        Effect.gen(function* () {
          const created = workspace(row.owner);

          yield* create(created, type, row.override);

          expect(
            JSON.parse(created.read(`${type.plural}/review/${type.manifest}`) ?? "null"),
          ).toMatchObject({ owner: "@acme", name: "review", type: type.type });
          // The created package is reachable from settings, so the scope must
          // name the owner it was created under.
          expect(created.settings()).toMatchObject({ owner: "@acme" });
        }),
      );

  for (const type of authoringTypes)
    it.effect(`previews an establishing ${type.type} creation without recording an owner`, () =>
      Effect.gen(function* () {
        const created = workspace(undefined);
        const before = created.snapshot();

        yield* create(created, type, Option.some("@acme"), "preview");

        expect(created.settings()).not.toMatchObject({ owner: "@acme" });
        expect(created.snapshot()).toEqual(before);
      }),
    );

  const refusals = [
    {
      fault: "missing-owner",
      owner: undefined,
      override: Option.none<string>(),
      tag: "AuthoringOwnerRequired",
    },
    {
      fault: "different-owner",
      owner: "@acme",
      override: Option.some("@other"),
      tag: "AuthoringOwnerMismatch",
    },
  ] as const;

  for (const type of authoringTypes)
    for (const row of refusals)
      it.effect(`refuses ${row.fault} for a ${type.type} before creating content`, () =>
        Effect.gen(function* () {
          const created = workspace(row.owner);
          const before = created.snapshot();

          const failure = yield* create(created, type, row.override).pipe(Effect.flip);

          expect(failure).toMatchObject({ _tag: row.tag });
          expect(created.snapshot()).toEqual(before);
        }),
      );

  // Converting a native MCP server creates an authored package, so it obeys the
  // same ownership rule as any other creation.
  for (const owner of ["matching", "different", "missing"] as const)
    it.effect(
      `MCP package conversion requires a ${owner} workspace owner to match its target`,
      () =>
        Effect.gen(function* () {
          const created = makeAuthoringWorkspace({
            ...(owner === "missing" ? {} : { owner: "@acme" }),
            agents: ["claude-code"],
          });
          cleanups.push(created.cleanup);
          writeNativeRemoteMcp(created);
          expect(readNativeMcpServers(created)[NATIVE_MCP_KEY]).toEqual(importedRemote);
          const before = created.snapshot();

          const convert = Effect.gen(function* () {
            const candidate = yield* ImportNativeExtension.prepare({
              type: "mcp-server",
              target: owner === "different" ? "@other/mcps/context" : "@acme/mcps/context",
              enable: true,
              nonInteractive: true,
              discovery: nativeMcpDiscovery(created),
            });
            return yield* ImportNativeExtension.previewOrApply(candidate, applyExecution);
          }).pipe(Effect.scoped, Effect.provide(authoringWorkspaceLayer(created)));

          if (owner === "matching") {
            yield* convert;
            expect(JSON.parse(created.read("mcps/context/mcp.json") ?? "null")).toMatchObject({
              owner: "@acme",
              name: "context",
            });
            return;
          }
          const failure = yield* convert.pipe(Effect.flip);
          expect(failure).toMatchObject({
            _tag: owner === "missing" ? "AuthoringOwnerRequired" : "AuthoringOwnerMismatch",
          });
          expect(created.snapshot()).toEqual(before);
        }),
    );
});
