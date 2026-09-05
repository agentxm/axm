/** Real source capture and query handlers over project-authored Knowledge bundles. */
import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import YAML from "yaml";
import { KnowledgeConceptQueryPageSchema } from "axm.sh/specification-harness";
import { makeSpecWorkspace } from "./install-harness.js";

export const knowledgeBundle = "@acme/knowledge/platform";
export const knowledgeQueryOptions = {
  fields: [],
  properties: [],
  metadata: [],
  lifecycle: [],
  tags: [],
  explain: false,
};
export const knowledgeDocument = (
  body: string,
  frontmatter: Readonly<Record<string, unknown>> = {},
) =>
  `---\n${YAML.stringify({ type: "guide", description: "Fixture guidance", tags: ["fixture"], ...frontmatter })}---\n${body}`;

export const makeKnowledgeSpecWorkspace = (
  options: {
    readonly machine?: boolean;
    readonly screen?: NonNullable<Parameters<typeof makeSpecWorkspace>[0]>["screen"];
    readonly bundles?: ReadonlyArray<{
      readonly name: string;
      readonly enabled?: boolean;
      readonly instructionEntry?: boolean;
      readonly documents: Readonly<Record<string, string>>;
    }>;
  } = {},
) => {
  const bundles = options.bundles ?? [{ name: "platform", documents: {} }];
  const workspace = makeSpecWorkspace({
    machine: options.machine !== false,
    ...(options.screen === undefined ? {} : { screen: options.screen }),
    userSettings: {},
    settings: {
      agents: [],
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
  });
  const sourcePath = (name: string, relativePath: string) =>
    path.join(workspace.root, "knowledge", name, "src", relativePath);
  const writeDocument = (relativePath: string, content: string, name = "platform") => {
    const file = sourcePath(name, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  for (const bundle of bundles) {
    const bundlePath = path.join(workspace.root, "knowledge", bundle.name);
    fs.mkdirSync(path.join(bundlePath, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(bundlePath, "knowledge.json"),
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
    for (const [relativePath, content] of Object.entries(bundle.documents))
      writeDocument(relativePath, content, bundle.name);
  }
  return {
    ...workspace,
    writeDocument,
    sourcePath,
    readQueryPage: () =>
      Schema.decodeUnknownSync(KnowledgeConceptQueryPageSchema)(
        workspace.rendererState.results.at(-1)?.data,
      ),
  };
};

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
