/**
 * @agentxm/knowledge-query deterministic fixtures and ports.
 *
 * A throwaway workspace with authored Knowledge bundles, the layer discovery
 * needs over it, and the changing-source port that proves capture refuses an
 * unstable corpus. Production source never imports this module.
 *
 * @experimental This API is unstable and may change without notice.
 * @packageDocumentation
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

import { decodeAbsolutePathSync } from "@agentxm/extension-model/unstable/path-types";
import type { WorkspaceScope } from "@agentxm/extension-model/unstable/workspace-scope";
import { WorkspaceStateLive } from "@agentxm/workspace-state/live";

import { captureInstalledKnowledgeCorpus } from "./corpus/installed-corpus.js";
import { KnowledgeIndexLive } from "./live.js";

export const knowledgeBundleFqn = "@acme/knowledge/platform";

/** Minimal YAML emitter for fixture frontmatter: scalars and string arrays. */
const yamlFrontmatter = (values: Readonly<Record<string, unknown>>): string =>
  Object.entries(values)
    .map(([key, value]) =>
      Array.isArray(value)
        ? `${key}:\n${value.map((item) => `  - ${JSON.stringify(item)}`).join("\n")}\n`
        : `${key}: ${JSON.stringify(value)}\n`,
    )
    .join("");

/** An OKF concept document with fixture frontmatter and the given body. */
export const knowledgeDocument = (
  body: string,
  frontmatter: Readonly<Record<string, unknown>> = {},
): string =>
  `---\n${yamlFrontmatter({ type: "guide", description: "Fixture guidance", tags: ["fixture"], ...frontmatter })}---\n${body}`;

export interface KnowledgeFixtureBundle {
  readonly name: string;
  readonly enabled?: boolean;
  readonly instructionEntry?: boolean;
  readonly documents?: Readonly<Record<string, string>>;
}

/**
 * The workspace-state services over the fixture, with a hermetic user home so
 * the machine's real home is never read.
 */
const makeKnowledgeFixtureLayer = (root: string, home: string, scope: WorkspaceScope) =>
  Layer.provideMerge(
    Layer.merge(
      WorkspaceStateLive({
        scope,
        projectRoot: decodeAbsolutePathSync(root),
        allowUninitialized: true,
      }),
      KnowledgeIndexLive,
    ),
    ConfigProvider.layer(ConfigProvider.fromEnv({ env: { AXM_USER_HOME: home } })),
  );

/**
 * A project workspace whose Knowledge bundles are authored in place, exactly
 * as `axm knowledge new` leaves them.
 */
export const makeKnowledgeFixtureWorkspace = (
  options: {
    readonly bundles?: ReadonlyArray<KnowledgeFixtureBundle>;
    readonly scope?: WorkspaceScope;
  } = {},
) => {
  const bundles = options.bundles ?? [{ name: "platform", documents: {} }];
  const root = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-knowledge-")));
  const home = fs.realpathSync(fs.mkdtempSync(nodePath.join(os.tmpdir(), "axm-knowledge-home-")));
  fs.mkdirSync(nodePath.join(root, ".axm"), { recursive: true });
  fs.mkdirSync(nodePath.join(home, ".axm", "workspace"), { recursive: true });
  const sourcePath = (bundle: string, relativePath: string) =>
    nodePath.join(root, "knowledge", bundle, "src", relativePath);
  const writeDocument = (relativePath: string, content: string, bundle = "platform") => {
    const file = sourcePath(bundle, relativePath);
    fs.mkdirSync(nodePath.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  fs.writeFileSync(
    nodePath.join(root, "axm.json"),
    JSON.stringify(
      {
        agents: [],
        // A workspace-sourced bundle names its owner through the workspace's own.
        owner: "@acme",
        knowledge: Object.fromEntries(
          bundles.map((bundle) => [
            bundle.name,
            {
              source: "workspace",
              enabled: bundle.enabled ?? true,
              ...(bundle.instructionEntry === undefined
                ? {}
                : { instructionEntry: bundle.instructionEntry }),
            },
          ]),
        ),
      },
      null,
      2,
    ),
  );
  // JSON is valid YAML, so the lockfile fixture needs no emitter.
  fs.writeFileSync(
    nodePath.join(root, "axm-lock.yaml"),
    JSON.stringify({ lockfileVersion: 7, skills: {} }),
  );

  for (const bundle of bundles) {
    const bundlePath = nodePath.join(root, "knowledge", bundle.name);
    fs.mkdirSync(nodePath.join(bundlePath, "src"), { recursive: true });
    fs.writeFileSync(
      nodePath.join(bundlePath, "knowledge.json"),
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
    writeDocument("index.md", '---\nokf_version: "0.2"\n---\n# Fixture knowledge\n', bundle.name);
    for (const [relativePath, content] of Object.entries(bundle.documents ?? {}))
      writeDocument(relativePath, content, bundle.name);
  }

  const readFile = (relativePath: string): string =>
    fs.readFileSync(nodePath.join(root, relativePath), "utf8");

  /** Every file under the workspace, so a read-only operation can be shown to write nothing. */
  const snapshot = (): ReadonlyArray<readonly [string, string]> => {
    const entries: Array<readonly [string, string]> = [];
    const walk = (directory: string) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = nodePath.join(directory, entry.name);
        if (entry.isDirectory()) walk(absolute);
        else entries.push([nodePath.relative(root, absolute), fs.readFileSync(absolute, "utf8")]);
      }
    };
    walk(root);
    return entries.sort((left, right) => left[0].localeCompare(right[0]));
  };

  const layer = makeKnowledgeFixtureLayer(root, home, options.scope ?? "project");
  return {
    root,
    sourcePath,
    writeDocument,
    readFile,
    readSettings: () => readFile("axm.json"),
    readLockfileText: () => readFile("axm-lock.yaml"),
    snapshot,
    provide: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.provide(effect, layer),
    cleanup: () => {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    },
  };
};

export type KnowledgeFixtureWorkspace = ReturnType<typeof makeKnowledgeFixtureWorkspace>;

/** Capture the fixture workspace's corpus and return its snapshot. */
export const captureFixtureSnapshot = (workspace: KnowledgeFixtureWorkspace) =>
  workspace.provide(
    captureInstalledKnowledgeCorpus().pipe(
      Effect.flatMap((captured) =>
        captured.outcome === "ready"
          ? Effect.succeed(captured.snapshot)
          : Effect.die("fixture corpus kept changing"),
      ),
    ),
  );

/** Each capture read sees another version through the production filesystem port. */
export const withChangingKnowledgeReads = <A, E, R>(program: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const filesystem = yield* FileSystem.FileSystem;
    const reads = yield* Ref.make(0);
    return yield* program.pipe(
      Effect.provideService(FileSystem.FileSystem, {
        ...filesystem,
        readFile: (filename) =>
          filesystem
            .readFile(filename)
            .pipe(
              Effect.flatMap((bytes) =>
                filename.endsWith(".md")
                  ? Ref.getAndUpdate(reads, (count) => count + 1).pipe(
                      Effect.map((count) =>
                        new TextEncoder().encode(
                          `${new TextDecoder().decode(bytes)}\nCapture version ${count}\n`,
                        ),
                      ),
                    )
                  : Effect.succeed(bytes),
              ),
            ),
      }),
    );
  });
