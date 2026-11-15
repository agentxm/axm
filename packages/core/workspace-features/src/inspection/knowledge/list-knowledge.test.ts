import * as nodePath from "node:path";
import { inspectKnowledgePackage } from "@agentxm/extension-content/knowledge";
import { NativePlatformTest } from "@agentxm/workspace-kernel/locations/testing";
import {
  WorkspaceRecords,
  withWorkspaceObservationReadView,
} from "@agentxm/workspace-kernel/workspace-state";
import { afterEach, describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { LocalInspection } from "../index.js";
import { buildInventoryDocument } from "../inventory-document.js";
import { withInspectionReadView } from "../read-view.js";
import { makeInspectionFixture } from "../testing.js";
import { ListKnowledge } from "./list-knowledge.js";

/**
 * Acquired Knowledge bundles sit beneath the acquired root, where the
 * canonical scan reads each manifest to learn the bundle's identity. The
 * inventory document then decodes the same manifest in full. Parses are
 * counted at `JSON.parse` for exactly one manifest text.
 */
const manifestText = (name: string, extra: Readonly<Record<string, unknown>> = {}) =>
  JSON.stringify({
    owner: "@acme",
    type: "knowledge",
    name,
    version: "1.0.0",
    description: "Acquired Knowledge bundle",
    format: { name: "okf", version: "0.2" },
    bundleRoot: "src",
    ...extra,
  });

const packageDirectory = (name: string) => `agent_extensions/@acme/knowledge/${name}`;

const makeAcquiredKnowledge = (
  bundles: Readonly<Record<string, string>>,
  settings: Readonly<Record<string, unknown>> = {},
) => {
  const files: Record<string, string> = {};
  for (const [name, manifest] of Object.entries(bundles)) {
    files[`${packageDirectory(name)}/knowledge.json`] = manifest;
    files[`${packageDirectory(name)}/src/index.md`] = '---\nokf_version: "0.2"\n---\n# Acquired\n';
  }
  const fixture = makeInspectionFixture({
    settings: { agents: [], owner: "@acme", ...settings },
    files,
  });
  return {
    ...fixture,
    packageRoot: (name: string) => nodePath.join(fixture.root, packageDirectory(name)),
    manifestPath: (name: string) =>
      nodePath.join(fixture.root, packageDirectory(name), "knowledge.json"),
    run: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      fixture
        .provide(effect)
        .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup))),
  };
};

/** Count `JSON.parse` calls over each exact text, from the moment it is called. */
const countParses = () => {
  const parse = vi.spyOn(JSON, "parse");
  return (text: string) => parse.mock.calls.filter(([input]) => input === text).length;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Knowledge inventory over acquired bundles", () => {
  it.effect("parses an acquired bundle's manifest once for its identity and its document", () => {
    const text = manifestText("platform");
    const workspace = makeAcquiredKnowledge({ platform: text });
    return workspace.run(
      Effect.gen(function* () {
        const parses = countParses();
        const { document, rows } = yield* ListKnowledge.query({});
        expect(parses(text)).toBe(1);
        expect(document.items).toMatchObject([
          {
            type: "knowledge",
            name: "platform",
            management: "unmanaged",
            installed: true,
            inspection: { state: "not-requested" },
            sourceRoot: nodePath.join(workspace.packageRoot("platform"), "src"),
          },
        ]);
        expect(rows).toMatchObject([{ name: "platform", inspectionState: "not-requested" }]);
      }),
    );
  });

  it.effect("reports a declared bundle's manifest instruction entry from the one parse", () => {
    const text = manifestText("platform", { instructionEntry: false });
    const workspace = makeAcquiredKnowledge(
      { platform: text },
      {
        instructionFiles: { fileName: "AGENTS.md", gitignoreAliases: false },
        knowledgeConfig: { instructions: true },
        knowledge: { platform: "@acme/knowledge/platform@1.0.0" },
      },
    );
    return workspace.run(
      Effect.gen(function* () {
        const parses = countParses();
        const { document } = yield* ListKnowledge.query({});
        expect(parses(text)).toBe(1);
        // Only a successful full decode of the manifest yields its exclusion.
        expect(document.items).toMatchObject([
          {
            name: "platform",
            installed: true,
            inspection: { state: "not-requested" },
            instructionEntry: { included: false, reason: "manifest-excluded" },
          },
        ]);
      }),
    );
  });

  it.effect("parses each of several acquired bundles' manifests once", () => {
    const texts = { platform: manifestText("platform"), runbooks: manifestText("runbooks") };
    const workspace = makeAcquiredKnowledge(texts);
    return workspace.run(
      Effect.gen(function* () {
        const parses = countParses();
        const { document } = yield* ListKnowledge.query({});
        expect([parses(texts.platform), parses(texts.runbooks)]).toEqual([1, 1]);
        expect(document.items.map((item) => item.name)).toEqual(["platform", "runbooks"]);
      }),
    );
  });

  it.effect("parses the manifest once for an inspected bundle's counts", () => {
    const text = manifestText("platform");
    const workspace = makeAcquiredKnowledge({ platform: text });
    return workspace.run(
      Effect.gen(function* () {
        const unshared = yield* inspectKnowledgePackage(workspace.packageRoot("platform"));
        const parses = countParses();
        const shown = yield* LocalInspection.query({
          selection: { kind: "all" },
          types: ["knowledge"],
        });
        expect(parses(text)).toBe(1);
        expect(shown.items).toMatchObject([
          {
            identity: { name: "platform" },
            knowledge: {
              concepts: unshared.inspection.concepts.length,
              diagnostics: unshared.inspection.diagnostics.length,
            },
          },
        ]);
      }),
    );
  });

  /**
   * Inspect an acquired bundle whose manifest fails to decode, in one
   * observation phase: the inventory, its document, and then the same
   * package read through the phase's shared parse. Parses are counted up to
   * the document.
   */
  const inspectFailingManifest = (text: string) => {
    const workspace = makeAcquiredKnowledge({ platform: text });
    const packageRoot = workspace.packageRoot("platform");
    return workspace.run(
      Effect.gen(function* () {
        const unshared = yield* inspectKnowledgePackage(packageRoot).pipe(Effect.flip);
        const parses = countParses();
        const observed = yield* withInspectionReadView(
          Effect.gen(function* () {
            const records = yield* WorkspaceRecords;
            const inventory = yield* records.getExtensionInventory("knowledge", {
              agents: [],
              details: true,
            });
            const document = yield* buildInventoryDocument(inventory);
            const documentParses = parses(text);
            const lookup = records.knowledgeManifestParse;
            const throughPhase = yield* inspectKnowledgePackage(
              packageRoot,
              lookup === undefined ? undefined : { parsedManifestText: lookup },
            ).pipe(Effect.flip);
            return { document, documentParses, throughPhase };
          }),
        );
        return { unshared, ...observed };
      }),
    );
  };

  it.effect("parses invalid manifest JSON again and reports it as invalid JSON", () =>
    Effect.gen(function* () {
      const { unshared, document, documentParses, throughPhase } =
        yield* inspectFailingManifest("{ not json");
      // The scan's failed parse is never shared: the document parses for itself.
      expect(documentParses).toBe(2);
      expect(unshared).toMatchObject({
        code: "manifest_invalid_json",
        detail: 'Manifest file "knowledge.json" contains invalid JSON.',
      });
      expect(throughPhase).toEqual(unshared);
      expect(document.items).toMatchObject([
        {
          name: "platform",
          inspection: {
            state: "partial",
            diagnostics: expect.arrayContaining([
              `Knowledge contents could not be inspected: ${String(unshared)}`,
            ]),
          },
        },
      ]);
    }),
  );

  it.effect("reports a schema-invalid manifest decoded from the shared parse as before", () =>
    Effect.gen(function* () {
      const { unshared, document, documentParses, throughPhase } = yield* inspectFailingManifest(
        manifestText("platform", { format: { name: "okf", version: 2 } }),
      );
      expect(documentParses).toBe(1);
      expect(unshared).toMatchObject({
        code: "manifest_schema_invalid",
        detail: 'Manifest file "knowledge.json" does not conform to the knowledge manifest schema.',
      });
      expect(throughPhase).toEqual(unshared);
      expect(document.items).toMatchObject([
        {
          name: "platform",
          inspection: {
            state: "partial",
            diagnostics: expect.arrayContaining([
              `Knowledge contents could not be inspected: ${String(unshared)}`,
            ]),
          },
        },
      ]);
    }),
  );

  it.effect("shares only a frozen parse of the exact path and text, and only in its phase", () => {
    const text = manifestText("platform");
    const workspace = makeAcquiredKnowledge({ platform: text });
    return workspace.run(
      Effect.gen(function* () {
        const manifestPath = workspace.manifestPath("platform");
        const parses = countParses();
        const lookup = yield* withWorkspaceObservationReadView(
          Effect.gen(function* () {
            const records = yield* WorkspaceRecords;
            const knowledgeManifestParse = records.knowledgeManifestParse;
            if (knowledgeManifestParse === undefined) return yield* Effect.die("no lookup");
            // Looking up before the scan never starts it.
            const beforeScan = knowledgeManifestParse(manifestPath, text);
            const parsesBeforeScan = parses(text);
            yield* records.getInventory({ types: ["knowledge"] });
            return {
              knowledgeManifestParse,
              beforeScan,
              parsesBeforeScan,
              exact: knowledgeManifestParse(manifestPath, text),
              edited: knowledgeManifestParse(manifestPath, `${text}\n`),
              elsewhere: knowledgeManifestParse(`${manifestPath}.copy`, text),
            };
          }),
        );
        expect(lookup.parsesBeforeScan).toBe(0);
        expect(Option.isNone(lookup.beforeScan)).toBe(true);
        expect(Option.isNone(lookup.edited)).toBe(true);
        expect(Option.isNone(lookup.elsewhere)).toBe(true);
        // The scan alone parsed the manifest; the lookup itself never parses.
        expect(parses(text)).toBe(1);
        const shared = Option.getOrUndefined(lookup.exact);
        expect(shared).toEqual(JSON.parse(text));
        expect(Object.isFrozen(shared)).toBe(true);
        // An ended phase shares nothing.
        expect(Option.isNone(lookup.knowledgeManifestParse(manifestPath, text))).toBe(true);
      }),
    );
  });

  it.effect("an unphased document parses for itself without another scan", () => {
    const text = manifestText("platform");
    const workspace = makeAcquiredKnowledge({ platform: text });
    return workspace.run(
      Effect.gen(function* () {
        const parses = countParses();
        const records = yield* WorkspaceRecords;
        const document = yield* buildInventoryDocument(
          yield* records.getExtensionInventory("knowledge", { agents: [] }),
        );
        // One scan for the inventory, one decode for the document.
        expect(parses(text)).toBe(2);
        expect(document.items).toMatchObject([{ name: "platform", installed: true }]);
      }),
    );
  });

  it.effect("an inventory without a document parses each manifest only for the scan", () => {
    const text = manifestText("platform");
    const workspace = makeAcquiredKnowledge({ platform: text });
    return workspace.run(
      Effect.gen(function* () {
        const parses = countParses();
        yield* withWorkspaceObservationReadView(
          Effect.flatMap(WorkspaceRecords, (records) =>
            records.getExtensionInventory("knowledge", { agents: [] }),
          ),
        );
        expect(parses(text)).toBe(1);
      }),
    );
  });
});
