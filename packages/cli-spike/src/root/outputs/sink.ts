import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { Command } from "effect/unstable/cli";

import { CliRenderer, column } from "@axm.sh/core/unstable/cli-renderer";
import { JsonSchemaVersion, withArgvTracking } from "@axm.sh/core/unstable/cli-runtime";

import { annotateCommandMeta, spikeCommandMeta } from "../../command-meta.js";
import { makeItemsDocumentSchema } from "../../json-output.js";
import { withRuntime } from "../../runtime.js";

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

export const SinkPetSchema = Schema.Struct({
  name: Schema.String.pipe(column({ header: "Name", priority: 1 })),
  species: Schema.String.pipe(column({ header: "Species", priority: 2 })),
  age: Schema.String.pipe(column({ header: "Age", priority: 3 })),
  adoptable: Schema.Boolean.pipe(
    column({
      header: "Adoptable",
      priority: 4,
      format: (value) => (value === true ? "yes" : "no"),
    }),
  ),
});

type Pet = typeof SinkPetSchema.Type;
export const OutputsSinkOutputSchema = makeItemsDocumentSchema("outputs.sink", SinkPetSchema);
export type OutputsSinkOutput = typeof OutputsSinkOutputSchema.Type;

const samplePets: ReadonlyArray<Pet> = [
  { name: "Mochi", species: "cat", age: "2 years", adoptable: true },
  { name: "Pickles", species: "dog", age: "4 months", adoptable: true },
  { name: "Juniper", species: "rabbit", age: "1 year", adoptable: false },
];

interface FileEntry {
  readonly name: string;
  readonly kind: "file" | "directory";
}

const sampleTree: ReadonlyArray<{
  data: FileEntry;
  children?: ReadonlyArray<{ data: FileEntry }>;
}> = [
  {
    data: { name: "packages", kind: "directory" },
    children: [
      { data: { name: "core", kind: "directory" } },
      { data: { name: "cli", kind: "directory" } },
    ],
  },
  { data: { name: "nx.json", kind: "file" } },
];

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const sinkConfig = {} as const;

const commandMeta = spikeCommandMeta("outputs sink", { json: true });

export const handleSink = Effect.gen(function* () {
  const renderer = yield* CliRenderer;
  const document: OutputsSinkOutput = {
    _version: JsonSchemaVersion,
    command: "outputs.sink",
    items: samplePets,
    count: samplePets.length,
  };

  // --- JSON path: emit structured data and return early ---
  if (yield* renderer.result(document, OutputsSinkOutputSchema)) {
    return;
  }

  // --- Interactive path: demonstrate every renderer method ---

  // Intro
  yield* renderer.intro("Kitchen Sink Demo");

  // Log levels
  yield* renderer.message("This is a plain message");
  yield* renderer.info("Informational note");
  yield* renderer.success("Operation succeeded");
  yield* renderer.step("Step in a sequence");
  yield* renderer.warn("Something to watch out for");
  yield* renderer.error("Something went wrong");

  // Note and box
  yield* renderer.note("Notes can highlight important information.", "Tip");
  yield* renderer.box("Boxed content for emphasis", "Status", {
    contentAlignment: "center",
    rounded: true,
  });

  // Stream log
  const logStream = Stream.fromIterable([
    "Resolving packages...",
    "Fetching packages...",
    "Done in 1.2s",
  ]).pipe(Stream.intersperse("\n"));
  yield* renderer.streamLog("info", logStream);

  // Spinner
  yield* renderer.withSpinner("Simulating work...", () => Effect.sleep("1 second"), {
    successMessage: "Work complete",
  });

  // Progress bar
  yield* renderer.withProgress({ max: 5 }, "Processing items...", (handle) =>
    Effect.forEach(
      [1, 2, 3, 4, 5],
      (i) =>
        Effect.gen(function* () {
          yield* Effect.sleep("200 millis");
          yield* handle.advance(1, `Processed ${i}/5 items`);
        }),
      { concurrency: 1 },
    ),
  );

  // Task log
  yield* renderer.withTaskLog({ title: "Build" }, (handle) =>
    Effect.gen(function* () {
      yield* handle.message("Compiling...");
      yield* Effect.sleep("300 millis");
      yield* handle.success("Build passed");
    }),
  );

  // Run tasks
  yield* renderer.runTasks([
    {
      title: "Lint",
      task: () =>
        Effect.gen(function* () {
          yield* Effect.sleep("300 millis");
          return "No issues";
        }),
    },
    {
      title: "Test",
      task: () =>
        Effect.gen(function* () {
          yield* Effect.sleep("300 millis");
          return "All passed";
        }),
    },
  ]);

  // Table
  yield* renderer.table(samplePets, SinkPetSchema, "Adoptable Pets");

  // Detail
  const firstPet = samplePets[0];
  if (firstPet) {
    yield* renderer.detail(firstPet, SinkPetSchema, "Featured Pet");
  }

  // Tree
  yield* renderer.tree(
    sampleTree,
    {
      label: (item: FileEntry) => item.name,
      icon: (item: FileEntry) => (item.kind === "directory" ? "\uD83D\uDCC1" : "\uD83D\uDCC4"),
    },
    "Project Structure",
  );

  // Cancel and outro
  yield* renderer.cancel("Simulated cancellation");
  yield* renderer.outro("Kitchen sink complete");
});

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const sinkCommand = Command.make("sink", sinkConfig, () =>
  handleSink.pipe(withRuntime(commandMeta)),
).pipe(
  withArgvTracking(sinkConfig),
  annotateCommandMeta(commandMeta),
  Command.withDescription(
    "Kitchen sink demo of all output renderer methods. JSON output includes items[] and count.",
  ),
  Command.withExamples([
    {
      command: "axm-spike outputs sink",
      description: "Run all output demos in sequence",
    },
    {
      command: "axm-spike outputs sink --json",
      description: "Emit { _version, command, items, count }",
    },
  ]),
);
