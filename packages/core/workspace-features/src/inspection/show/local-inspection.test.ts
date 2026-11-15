import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import type { WorkFact } from "@agentxm/host-primitives/work-observation";
import { workObservations } from "@agentxm/workspace-kernel/locations/testing";
import { ConfiguredAgentOutcomesProviderLive } from "@agentxm/workspace-kernel/reconciliation/live";
import { StepFailureConversionTest } from "@agentxm/workspace-kernel/reconciliation/testing";
import { LocalInspection } from "../index.js";
import { ListKnowledge } from "../knowledge/list-knowledge.js";
import { makeInstalledWorkspace } from "../test-support/installed-workspace.js";
import { knowledgeDocument } from "../testing.js";
import { withLocalAssessmentReadView } from "./content-read-view.js";

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
          expect(decodes).toEqual({ requested: 6, executed: 4 });
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
          expect(decodes).toEqual({ requested: 11, executed: 7 });
        }),
      )
      .pipe(Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  it.effect("counts an invalid concept that leaves the bundle out of discovery", () => {
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
          expect(decodes).toEqual({ requested: 7, executed: 5 });
        }),
      )
      .pipe(Effect.ensuring(Effect.sync(workspace.cleanup)));
  });

  it.effect("omits an uninspectable package's counts after one failed inspection", () => {
    const workspace = makeKnowledgeWorkspace({
      agents: ["claude-code"],
      bundles: [{ name: "platform", documents }],
    });
    fs.chmodSync(workspace.documentPath("platform", "guide.md"), 0o000);
    return workspace
      .provide(
        Effect.gen(function* () {
          const { result, decodes } = yield* measure(showKnowledge);
          expect(result.items).toHaveLength(1);
          expect(result.items[0]).not.toHaveProperty("knowledge");
          expect(decodes).toEqual({ requested: 5, executed: 3 });
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
          expect(decodes).toEqual({ requested: 6, executed: 4 });
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
