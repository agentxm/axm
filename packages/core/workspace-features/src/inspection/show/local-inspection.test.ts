import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, describe, expect, it, vi } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import { inspectKnowledgePackage } from "@agentxm/extension-content/knowledge";
import { makeRecordingFileSystem, type FileSystemRecording } from "@agentxm/test-support";
import type { WorkFact } from "@agentxm/host-primitives/work-observation";
import { NativePlatformTest, workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { ConfiguredAgentOutcomesProviderLive } from "@agentxm/workspace-kernel/reconciliation/live";
import { StepFailureConversionTest } from "@agentxm/workspace-kernel/reconciliation/testing";
import { WorkspaceRecords } from "@agentxm/workspace-kernel/workspace-state";
import { LocalInspection } from "../index.js";
import { buildInventoryDocument } from "../inventory-document.js";
import { inspectInventory } from "../inventory-inspection.js";
import { ListKnowledge } from "../knowledge/list-knowledge.js";
import { makeInstalledWorkspace } from "../test-support/installed-workspace.js";
import { knowledgeDocument, makeInspectionFixture } from "../testing.js";
import { withLocalAssessmentReadView, withLocalInspectionReadView } from "./content-read-view.js";

/**
 * Requested and executed text decodes through the shared observation port.
 * Every package inspection asks for its manifest and each concept document;
 * the observation port answers repeats from what it read, so the requested
 * count is the number of inspections' reads and the executed count the
 * number of physical decodes.
 */
const textDecodes = (facts: ReadonlyArray<WorkFact>) => {
  const total = { requested: 0, executed: 0 };
  for (const fact of facts) {
    if (fact.kind !== "axm.observation.reuse") continue;
    if (fact.attributes["axm.observation.operation"] !== "decode-text") continue;
    total.requested += fact.attributes["axm.work.requested"] ?? 0;
    total.executed += fact.attributes["axm.work.executed"] ?? 0;
  }
  return total;
};

interface FixtureBundle {
  readonly name: string;
  readonly enabled?: boolean;
  readonly documents: Readonly<Record<string, string>>;
}

/**
 * A workspace whose Knowledge bundles are authored in place, with the
 * production Knowledge manager selecting discovery contributors for the
 * configured agents. Instruction files stay off so the query performs no
 * capability probe that would end its observation phase.
 */
const makeKnowledgeWorkspace = (options: {
  readonly agents: ReadonlyArray<string>;
  readonly bundles: ReadonlyArray<FixtureBundle>;
}) => {
  const workspace = makeInstalledWorkspace({ agents: options.agents });
  const writeFile = (relative: string, content: string) => {
    const target = path.join(workspace.root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  };
  writeFile(
    "axm.json",
    JSON.stringify({
      agents: options.agents,
      owner: "@acme",
      instructionFiles: false,
      knowledgeConfig: { instructions: true },
      knowledge: Object.fromEntries(
        options.bundles.map((bundle) => [
          bundle.name,
          { source: "workspace", enabled: bundle.enabled ?? true },
        ]),
      ),
    }),
  );
  for (const bundle of options.bundles) {
    writeFile(
      `knowledge/${bundle.name}/knowledge.json`,
      JSON.stringify({
        owner: "@acme",
        type: "knowledge",
        name: bundle.name,
        version: "1.0.0",
        description: "Fixture Knowledge bundle",
        format: { name: "okf", version: "0.2" },
        bundleRoot: "src",
      }),
    );
    for (const [relative, content] of Object.entries(bundle.documents))
      writeFile(`knowledge/${bundle.name}/src/${relative}`, content);
  }
  return {
    ...workspace,
    documentPath: (bundle: string, relative: string) =>
      path.join(workspace.root, "knowledge", bundle, "src", relative),
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      workspace.provide(
        effect.pipe(
          Effect.provide(
            Layer.provideMerge(ConfiguredAgentOutcomesProviderLive, StepFailureConversionTest),
          ),
        ),
      ),
  };
};

const documents = {
  "index.md": '---\nokf_version: "0.2"\n---\n# Platform\n\n[Guide](guide.md)\n',
  "guide.md": knowledgeDocument("# Guide\n"),
};

const showKnowledge = LocalInspection.query({ selection: { kind: "all" }, types: ["knowledge"] });

/**
 * The inventory document a local inspection builds for its Knowledge rows:
 * native inspection, where discovery selection inspects each enabled
 * bundle's package, then the document's own counts, in one observation
 * phase.
 */
const inspectedKnowledgeDocument = withLocalInspectionReadView(
  Effect.gen(function* () {
    const raw = yield* (yield* WorkspaceRecords).getInventory({ types: ["knowledge"] });
    return yield* buildInventoryDocument(yield* inspectInventory(raw));
  }),
);

const measure = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const observations = workObservations(false);
    const result = yield* effect.pipe(observations.provide);
    return { result, decodes: textDecodes(observations.facts) };
  });

describe("Local inspection of Knowledge bundles", () => {
  it.effect("inspects an enabled bundle's package once for its outcomes and its counts", () => {
    const workspace = makeKnowledgeWorkspace({
      agents: ["claude-code"],
      bundles: [{ name: "platform", documents }],
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const { result, decodes } = yield* measure(showKnowledge);
          expect(result.items.map((item) => item.knowledge)).toEqual([
            { concepts: 2, diagnostics: 0 },
          ]);
          // Discovery selection reads knowledge.json and both documents; the
          // inventory's counts ask for none of them again.
          expect(decodes).toEqual({ requested: 5, executed: 4 });
        }),
      )
      .pipe(Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  it.effect("inspects each of several enabled bundles once", () => {
    const workspace = makeKnowledgeWorkspace({
      agents: ["claude-code"],
      bundles: [
        { name: "platform", documents },
        { name: "release", documents },
      ],
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const { result, decodes } = yield* measure(showKnowledge);
          expect(result.items.map((item) => item.knowledge)).toEqual([
            { concepts: 2, diagnostics: 0 },
            { concepts: 2, diagnostics: 0 },
          ]);
          expect(decodes).toEqual({ requested: 9, executed: 7 });
        }),
      )
      .pipe(Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  // The bundle's own exclusion from discovery is not part of the show result;
  // the Knowledge manager's tests pin it for a shared inspection.
  it.effect("counts an invalid concept that discovery selection's inspection found", () => {
    const workspace = makeKnowledgeWorkspace({
      agents: ["claude-code"],
      bundles: [
        {
          name: "platform",
          documents: { ...documents, "broken.md": "---\ntype: [broken\n---\n# Broken\n" },
        },
      ],
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const { result, decodes } = yield* measure(showKnowledge);
          expect(result.items.map((item) => item.knowledge)).toEqual([
            { concepts: 2, diagnostics: 1 },
          ]);
          expect(decodes).toEqual({ requested: 6, executed: 5 });
        }),
      )
      .pipe(Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  it.effect("reports an uninspectable package after one failed inspection", () => {
    const workspace = makeKnowledgeWorkspace({
      agents: ["claude-code"],
      bundles: [{ name: "platform", documents }],
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const base = yield* FileSystem.FileSystem;
          // The content view reads each file by its resolved path; a direct
          // inspection reads it by the spelling it was given.
          const guide = workspace.documentPath("platform", "guide.md");
          const unreadable = new Set([guide, fs.realpathSync(guide)]);
          const denied = FileSystem.make({
            ...base,
            readFile: (file) =>
              unreadable.has(file)
                ? Effect.fail(
                    PlatformError.systemError({
                      _tag: "PermissionDenied",
                      module: "FileSystem",
                      method: "readFile",
                      pathOrDescriptor: file,
                    }),
                  )
                : base.readFile(file),
          });
          const failure = yield* inspectKnowledgePackage(
            path.join(workspace.root, "knowledge", "platform"),
          ).pipe(Effect.flip, Effect.provideService(FileSystem.FileSystem, denied));
          expect(String(failure)).toContain("PermissionDenied");

          const show = yield* measure(showKnowledge).pipe(
            Effect.provideService(FileSystem.FileSystem, denied),
          );
          expect(show.result.items).toHaveLength(1);
          expect(show.result.items[0]).not.toHaveProperty("knowledge");
          expect(show.decodes).toEqual({ requested: 4, executed: 3 });

          // The inventory document states the failure the earlier inspection
          // met, exactly as its own inspection would.
          const inventory = yield* measure(inspectedKnowledgeDocument).pipe(
            Effect.provideService(FileSystem.FileSystem, denied),
          );
          const inspection = inventory.result.items[0]?.inspection;
          expect(inspection).not.toHaveProperty("knowledge");
          expect(inspection?.state).toBe("partial");
          expect(
            inspection !== undefined && "diagnostics" in inspection
              ? inspection.diagnostics
              : undefined,
          ).toEqual([`Knowledge contents could not be inspected: ${String(failure)}`]);
          expect(inventory.decodes).toEqual({ requested: 3, executed: 3 });
        }),
      )
      .pipe(Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  it.effect("inspects a disabled bundle for the inventory alone", () => {
    const workspace = makeKnowledgeWorkspace({
      agents: ["claude-code"],
      bundles: [{ name: "platform", enabled: false, documents }],
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const { result, decodes } = yield* measure(showKnowledge);
          expect(result.items.map((item) => item.knowledge)).toEqual([
            { concepts: 2, diagnostics: 0 },
          ]);
          expect(decodes).toEqual({ requested: 5, executed: 4 });
        }),
      )
      .pipe(Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  it.effect("keeps the inventory's own verified reads inside an assessment", () => {
    const workspace = makeKnowledgeWorkspace({
      agents: ["claude-code"],
      bundles: [{ name: "platform", documents }],
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const base = yield* FileSystem.FileSystem;
          const guide = workspace.documentPath("platform", "guide.md");
          const resolved = { count: 0 };
          const counted: FileSystem.FileSystem = {
            ...base,
            realPath: (file) => {
              if (file === guide) resolved.count += 1;
              return base.realPath(file);
            },
          };
          const { result, decodes } = yield* measure(
            withLocalAssessmentReadView(showKnowledge),
          ).pipe(Effect.provideService(FileSystem.FileSystem, counted));
          expect(result.items.map((item) => item.knowledge)).toEqual([
            { concepts: 2, diagnostics: 0 },
          ]);
          // Every verified read resolves its path again; the inventory's
          // inspection keeps its own verified reads of each document.
          expect(resolved.count).toBe(3);
          expect(decodes).toEqual({ requested: 4, executed: 4 });
        }),
      )
      .pipe(Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  it.effect("adds no reads to a Knowledge list, which inspects no package", () => {
    const workspace = makeKnowledgeWorkspace({
      agents: ["claude-code"],
      bundles: [{ name: "platform", documents }],
    });
    return workspace
      .provide(
        Effect.gen(function* () {
          const { result, decodes } = yield* measure(
            ListKnowledge.query({ agents: ["claude-code"] }),
          );
          expect(result.rows).toMatchObject([
            { name: "platform", inspectionState: "not-requested" },
          ]);
          expect(decodes).toEqual({ requested: 2, executed: 2 });
        }),
      )
      .pipe(Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  it.effect("adds no reads to an inspection without Knowledge rows", () => {
    const workspace = makeKnowledgeWorkspace({ agents: ["claude-code"], bundles: [] });
    return workspace
      .provide(
        Effect.gen(function* () {
          const { result, decodes } = yield* measure(
            LocalInspection.query({ selection: { kind: "all" } }),
          );
          expect(result.items).toEqual([]);
          expect(decodes).toEqual({ requested: 26, executed: 25 });
        }),
      )
      .pipe(Effect.ensuring(Effect.sync(workspace.cleanup)));
  });
});

/** Count `JSON.parse` calls over exactly `text`, from the moment it is called. */
const countParses = () => {
  const parse = vi.spyOn(JSON, "parse");
  return (text: string) => parse.mock.calls.filter(([input]) => input === text).length;
};

/** Resolutions and identity probes of exactly `file` through the recording port. */
const verifiedReads = (recording: FileSystemRecording, file: string) => {
  const counts = recording.counts(file);
  return { realPath: counts.realPath ?? 0, stat: counts.stat ?? 0 };
};

/** Run `effect` over a recording port, counting from a reset recorder. */
const recordedQuery = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const { fileSystem, recording } = makeRecordingFileSystem(yield* FileSystem.FileSystem);
    recording.reset();
    const result = yield* effect.pipe(Effect.provideService(FileSystem.FileSystem, fileSystem));
    return { result, recording };
  });

describe("Local inspection of a package manifest version", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const knowledgeManifest = (fields: Readonly<Record<string, unknown>> = {}) =>
    JSON.stringify({
      owner: "@acme",
      type: "knowledge",
      name: "platform",
      version: "1.0.0",
      description: "Fixture Knowledge bundle",
      format: { name: "okf", version: "0.2" },
      bundleRoot: "src",
      ...fields,
    });

  it.effect("reports the version from the manifest its observation already decoded", () => {
    const workspace = makeKnowledgeWorkspace({
      agents: ["claude-code"],
      bundles: [{ name: "platform", documents }],
    });
    const manifestPath = path.join(workspace.root, "knowledge", "platform", "knowledge.json");
    const text = fs.readFileSync(manifestPath, "utf8");
    return workspace
      .provide(
        Effect.gen(function* () {
          const parses = countParses();
          const { result, decodes } = yield* measure(showKnowledge);
          expect(result.items[0]?.observed).toMatchObject({ manifestVersion: "1.0.0" });
          // The observation's parse and discovery selection's inspection.
          expect(parses(text)).toBe(2);
          expect(decodes).toEqual({ requested: 5, executed: 4 });
        }),
      )
      .pipe(Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  it.effect("verifies the manifest once fewer inside an assessment", () => {
    const workspace = makeKnowledgeWorkspace({
      agents: ["claude-code"],
      bundles: [{ name: "platform", documents }],
    });
    const manifestPath = path.join(workspace.root, "knowledge", "platform", "knowledge.json");
    return workspace
      .provide(
        Effect.gen(function* () {
          const { result, recording } = yield* recordedQuery(
            withLocalAssessmentReadView(showKnowledge),
          );
          expect(result.items[0]?.observed).toMatchObject({ manifestVersion: "1.0.0" });
          expect(
            result.observationDiagnostics.filter(
              (diagnostic) => diagnostic.code === "inspection-read-changed",
            ),
          ).toEqual([]);
          // The observation's verified read and the inventory's own; the
          // version needs no verified read of its own.
          expect(verifiedReads(recording, manifestPath)).toEqual({ realPath: 4, stat: 6 });
          expect(recording.contentReads(manifestPath)).toBe(1);
        }),
      )
      .pipe(Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  for (const scenario of [
    {
      label: "a manifest its grammar rejects beside a valid identity",
      manifest: knowledgeManifest({ format: "okf" }),
      version: "1.0.0",
    },
    {
      label: "a manifest naming another owner",
      manifest: knowledgeManifest({ owner: "@other" }),
      version: "1.0.0",
    },
    {
      label: "a manifest naming another package",
      manifest: knowledgeManifest({ name: "other" }),
      version: undefined,
    },
    { label: "a manifest that is not JSON", manifest: "{", version: undefined },
    { label: "a missing manifest", manifest: undefined, version: undefined },
  ])
    it.effect(
      `reports the manifest version exactly as its own read would for ${scenario.label}`,
      () => {
        const workspace = makeKnowledgeWorkspace({
          agents: [],
          bundles: [{ name: "platform", documents }],
        });
        const manifestPath = path.join(workspace.root, "knowledge", "platform", "knowledge.json");
        if (scenario.manifest === undefined) fs.rmSync(manifestPath);
        else fs.writeFileSync(manifestPath, scenario.manifest);
        return workspace
          .provide(
            Effect.gen(function* () {
              const result = yield* showKnowledge;
              expect(result.items).toHaveLength(1);
              expect(result.items[0]?.observed.manifestVersion).toBe(scenario.version);
            }),
          )
          .pipe(Effect.ensuring(Effect.sync(workspace.cleanup)));
      },
    );
});

describe("Local inspection of an authored Pack", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** An authored Pack with one authored Rule member, and no capability probe. */
  const packWorkspace = (pack: string) => {
    const fixture = makeInspectionFixture({
      settings: {
        agents: [],
        owner: "@acme",
        instructionFiles: false,
        packs: { toolkit: { source: "workspace", enabled: true } },
        rules: { review: { source: "workspace", enabled: true } },
      },
      files: {
        "packs/toolkit/pack.json": pack,
        "rules/review/rule.json": JSON.stringify({
          owner: "@acme",
          type: "rule",
          name: "review",
          version: "1.5.0",
          description: "Review guidance",
        }),
        "rules/review/src/RULE.md": "Review every change.\n",
      },
    });
    return {
      ...fixture,
      manifestPath: path.join(fixture.root, "packs", "toolkit", "pack.json"),
      run: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        fixture
          .provide(effect)
          .pipe(Effect.provide(NativePlatformTest), Effect.ensuring(Effect.sync(fixture.cleanup))),
    };
  };
  const packManifest = (dependencies: unknown) =>
    JSON.stringify({
      owner: "@acme",
      type: "pack",
      name: "toolkit",
      version: "0.0.1",
      dependencies,
    });
  const showPack = LocalInspection.query({
    selection: { kind: "identities", identities: ["toolkit"] },
    types: ["pack"],
  });

  it.effect("decodes the Pack manifest once for its observation, version and members", () => {
    const text = packManifest({ "@acme/rules/review": ">=1.0.0" });
    const workspace = packWorkspace(text);
    return workspace.run(
      Effect.gen(function* () {
        const parses = countParses();
        const { result, decodes } = yield* measure(showPack);
        const item = result.items[0];
        expect(item?.observed).toMatchObject({ manifestVersion: "0.0.1" });
        expect(item?.pack?.members).toEqual([
          {
            fqn: "@acme/rules/review",
            declaration: { constraint: ">=1.0.0", endpoint: null },
            localNames: ["review"],
            sourceIdentity: {
              authority: "workspace",
              fqn: "@acme/rules/review",
              endpoint: null,
              locator: null,
            },
            resolution: { status: "authored" },
            version: "1.5.0",
            reachability: "satisfying",
            subjectRef: "member-1",
          },
        ]);
        expect(item?.observed.coverage).toEqual({ state: "complete", reasons: [] });
        // The desired graph's Pack document and the canonical observation; the
        // member inspection still reads the manifest, from the phase's cell.
        expect(parses(text)).toBe(2);
        expect(decodes).toEqual({ requested: 6, executed: 4 });
      }),
    );
  });

  it.effect(
    "keeps the member inspection's verified Pack manifest read inside an assessment",
    () => {
      const workspace = packWorkspace(packManifest({ "@acme/rules/review": ">=1.0.0" }));
      return workspace.run(
        Effect.gen(function* () {
          const { result, recording } = yield* recordedQuery(withLocalAssessmentReadView(showPack));
          expect(result.items[0]?.pack?.members).toHaveLength(1);
          expect(
            result.observationDiagnostics.filter(
              (diagnostic) => diagnostic.code === "inspection-read-changed",
            ),
          ).toEqual([]);
          // The member inspection's verified read stays; only the version's goes.
          expect(verifiedReads(recording, workspace.manifestPath)).toEqual({
            realPath: 4,
            stat: 6,
          });
          expect(recording.contentReads(workspace.manifestPath)).toBe(1);
        }),
      );
    },
  );

  it.effect("reports the same member failure for a Pack manifest its grammar rejects", () => {
    const text = packManifest(5);
    const workspace = packWorkspace(text);
    return workspace.run(
      Effect.gen(function* () {
        const parses = countParses();
        const result = yield* showPack;
        const item = result.items[0];
        expect(item?.observed.coverage.state).toBe("partial");
        expect(item?.observed.coverage.reasons).toEqual([
          'Pack member evidence could not be fully observed: SchemaError(Expected object\n  at ["dependencies"])',
        ]);
        expect(item?.observed.manifestVersion).toBe("0.0.1");
        // The graph and the observation, then the version's identity parse and
        // the member inspection's own decode of the text the observation rejected.
        expect(parses(text)).toBe(4);
      }),
    );
  });
});
