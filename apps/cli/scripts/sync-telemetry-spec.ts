import * as Layer from "effect/Layer";
/** Import the published telemetry contract from its endpoint or an exported file. */
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Config from "effect/Config";
import * as Console from "effect/Console";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";

class SpecImportFailed extends Data.TaggedError("SpecImportFailed")<{
  readonly detail: string;
  readonly cause?: unknown;
}> {}

const sync = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const args = process.argv.slice(2);
  if (args.length > 2 || (args.length > 0 && (args[0] !== "--input" || args[1] === undefined))) {
    return yield* new SpecImportFailed({
      detail:
        "Use --input <exported-openapi.json>, or no arguments to fetch the telemetry endpoint.",
    });
  }
  const input = args[1];
  const root = path.resolve(import.meta.dirname, "..");
  const target = path.join(root, "specs", "telemetry-openapi.json");
  const text =
    input === undefined
      ? yield* Effect.gen(function* () {
          const baseUrl = yield* Config.String("AXM_TELEMETRY_URL").pipe(
            Config.withDefault("http://localhost:4301"),
          );
          const url = `${baseUrl.replace(/\/+$/, "")}/v1/openapi.json`;
          const client = yield* HttpClient.HttpClient;
          const response = yield* HttpClient.filterStatusOk(client)
            .get(url)
            .pipe(Effect.timeout("10 seconds"));
          return yield* response.text;
        })
      : yield* fs.readFileString(path.resolve(input));
  const spec = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown))(text);
  yield* fs.makeDirectory(path.dirname(target), { recursive: true });
  yield* fs.writeFileString(target, `${JSON.stringify(spec, null, 2)}\n`);
  yield* Console.log(`Synced: ${path.relative(root, target)}`);
});

NodeRuntime.runMain(
  sync.pipe(Effect.provide(Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer))),
);
