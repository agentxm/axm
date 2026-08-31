import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "@effect/vitest";
import { afterAll, afterEach } from "vitest";

import { ExtensionListDocumentSchema, handleList, handleSync } from "axm.sh/specification-harness";

import { defineSpecification } from "../support/contract.js";
import { makeSpecWorkspace } from "../support/install-harness.js";
import { pinSpecUserHome } from "../support/workspace-fixtures.js";

export const specification = defineSpecification({
  requirement: "cli/lock-state-never-creates-reachability",
  title: "A lockfile row alone never makes an extension desired or retained",
  class: "functional",
  role: "experience",
  goals: ["workspace-intent-fidelity", "trustworthy-distribution"],
  methods: ["decision-table", "contract"],
});

const userHome = pinSpecUserHome();

const decodeListDocument = Schema.decodeUnknownEffect(ExtensionListDocumentSchema);

/**
 * Accepted-resolution rows written directly into the authoritative lockfile
 * with no corresponding settings entry: nothing desires the extension.
 */
const lockOnlyRows = [
  {
    family: "extension",
    name: "phantom",
    settings: {
      lockfileSkills: {
        phantom: {
          type: "registry",
          owner: "@acme",
          name: "phantom",
          resolvedVersion: "1.0.0",
          integrity: "sha512-AAAA==",
          publisherBindingId: "hbnd_test",
        },
      },
    },
  },
  {
    family: "pack",
    name: "phantom-pack",
    settings: {
      lockfilePacks: {
        "phantom-pack": {
          type: "registry",
          owner: "@acme",
          name: "phantom-pack",
          resolvedVersion: "1.0.0",
          integrity: "sha512-AAAA==",
          publisherBindingId: "hbnd_test",
        },
      },
    },
  },
] as const;

describe("Lock state and desired-state reachability", () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    userHome.reset();
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });
  afterAll(() => {
    userHome.cleanup();
  });

  it.effect.each(lockOnlyRows)(
    "a lock row for an undesired $family is never synced into existence",
    (row) =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({
          machine: true,
          flags: { json: true },
          settings: row.settings,
        });
        cleanups.push(workspace.cleanup);
        const settingsBefore = JSON.stringify(workspace.readSettings());

        yield* handleSync({ preview: true }).pipe(Effect.provide(workspace.layer));
        yield* handleSync({ preview: false }).pipe(Effect.provide(workspace.layer));

        // Neither the preview nor the reconciliation considered the lock-only
        // extension part of the workspace's desired state.
        expect(JSON.stringify(workspace.rendererState.results)).not.toContain(row.name);
        expect(JSON.stringify(workspace.readSettings())).toBe(settingsBefore);
        expect(workspace.snapshotTree("agent_extensions")).toEqual([]);
        expect(workspace.snapshotTree(".claude")).toEqual([]);
        expect(workspace.snapshotTree(".agents")).toEqual([]);
      }),
  );

  it.effect.each(lockOnlyRows)(
    "the workspace inventory does not report a lock-only $family as present",
    (row) =>
      Effect.gen(function* () {
        const workspace = makeSpecWorkspace({
          machine: true,
          flags: { json: true },
          settings: row.settings,
        });
        cleanups.push(workspace.cleanup);

        yield* handleList({ type: Option.none(), outdated: false, deprecated: false }).pipe(
          Effect.provide(workspace.layer),
        );

        const [entry] = workspace.rendererState.results;
        expect(entry).toBeDefined();
        const document = yield* decodeListDocument(entry?.data);
        expect(document.items.filter((item) => item.name === row.name)).toEqual([]);
        expect(document.count).toBe(0);
      }),
  );
});
