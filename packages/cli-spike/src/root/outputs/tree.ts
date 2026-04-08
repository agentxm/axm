import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Command, Flag } from "effect/unstable/cli";

import { CliRenderer } from "@axm.sh/core/unstable/cli-renderer";
import { withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

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

const handleTree = (args: { readonly title: Option.Option<string> }) =>
  Effect.gen(function* () {
    const renderer = yield* CliRenderer;
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
  handleTree({ title }).pipe(withRuntime({ command: "outputs tree" })),
).pipe(
  withArgvTracking(treeConfig),
  Command.withDescription("Render tree hierarchy output"),
  Command.withExamples([
    {
      command: "axm-spike outputs tree --title Workspace",
      description: "Render a titled tree view",
    },
  ]),
);
