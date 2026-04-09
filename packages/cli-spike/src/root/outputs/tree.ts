import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Command, Flag } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { JsonSchemaVersion, withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { annotateCommandMeta, spikeCommandMeta } from "../../command-meta.js";
import { makeDataDocumentSchema } from "../../json-output.js";
import { withRuntime } from "../../runtime.js";

interface FileEntry {
  readonly name: string;
  readonly kind: "file" | "directory";
}

const sampleTree = [
  {
    data: { name: "packages", kind: "directory" as const },
    children: [
      {
        data: { name: "core", kind: "directory" as const },
        children: [
          { data: { name: "src", kind: "directory" as const }, children: [] },
          { data: { name: "package.json", kind: "file" as const } },
        ],
      },
      {
        data: { name: "cli", kind: "directory" as const },
        children: [
          { data: { name: "src", kind: "directory" as const }, children: [] },
          { data: { name: "package.json", kind: "file" as const } },
        ],
      },
      {
        data: { name: "cli-spike", kind: "directory" as const },
        children: [
          { data: { name: "src", kind: "directory" as const }, children: [] },
          { data: { name: "package.json", kind: "file" as const } },
        ],
      },
    ],
  },
  { data: { name: "nx.json", kind: "file" as const } },
  { data: { name: "package.json", kind: "file" as const } },
];

const treeConfig = {
  title: Flag.string("title").pipe(Flag.withDescription("Tree view title"), Flag.optional),
} as const;

const commandMeta = spikeCommandMeta("outputs tree", { json: true });

interface FileNode {
  readonly name: string;
  readonly kind: "file" | "directory";
  readonly children?: ReadonlyArray<FileNode> | undefined;
}

export const FileNodeSchema: Schema.Codec<FileNode> = Schema.Struct({
  name: Schema.String,
  kind: Schema.Literals(["file", "directory"] as const),
  children: Schema.optional(Schema.Array(Schema.suspend(() => FileNodeSchema))),
});
const OutputsTreeDataSchema = Schema.Struct({
  roots: Schema.Array(FileNodeSchema),
});
export const OutputsTreeOutputSchema = makeDataDocumentSchema(
  "outputs.tree",
  OutputsTreeDataSchema,
);
export type OutputsTreeOutput = typeof OutputsTreeOutputSchema.Type;

interface TreeInput {
  readonly data: FileEntry;
  readonly children?: ReadonlyArray<TreeInput>;
}

const toFileNodes = (tree: ReadonlyArray<TreeInput>): ReadonlyArray<FileNode> =>
  tree.map((node) => ({
    name: node.data.name,
    kind: node.data.kind,
    ...(node.children && node.children.length > 0 ? { children: toFileNodes(node.children) } : {}),
  }));

export const handleTree = (args: { readonly title: Option.Option<string> }) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
    const document: OutputsTreeOutput = {
      _version: JsonSchemaVersion,
      command: "outputs.tree",
      data: {
        roots: toFileNodes(sampleTree),
      },
    };

    if (yield* renderer.result(document, OutputsTreeOutputSchema)) {
      return;
    }

    yield* renderer.tree(
      sampleTree,
      {
        label: (item: FileEntry) => item.name,
        detail: (item: FileEntry) => (item.kind === "directory" ? "dir" : undefined),
        icon: (item: FileEntry) => (item.kind === "directory" ? "\uD83D\uDCC1" : "\uD83D\uDCC4"),
      },
      Option.getOrUndefined(args.title),
    );
  });

export const treeCommand = Command.make("tree", treeConfig, ({ title }) =>
  handleTree({ title }).pipe(withRuntime(commandMeta)),
).pipe(
  withArgvTracking(treeConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription(
    "Render tree hierarchy output. JSON output includes data.roots[] with name, kind, and recursive children.",
  ),
  Command.withExamples([
    {
      command: "axm-spike outputs tree --title Workspace",
      description: "Render a titled tree view",
    },
    {
      command: "axm-spike outputs tree --json",
      description: "Emit { _version, command, data: { roots } }",
    },
  ]),
);
