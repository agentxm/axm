/**
 * Import the Registry OpenAPI contract from its endpoint or an exported file,
 * or check the recorded snapshot against the endpoint.
 *
 * Usage:
 *   pnpm exec nx run registry-client:sync:registry-spec
 *   pnpm exec nx run registry-client:sync:registry-spec -- --input <exported-openapi.json>
 *   pnpm exec nx run registry-client:check:registry-spec
 *
 * The snapshot is written in canonical form, `JSON.stringify(document, undefined, 2)`
 * followed by a newline, so a fetched document and an exported copy of the same
 * document produce identical bytes. `specs/registry-openapi.sha256` records the
 * SHA-256 of those canonical bytes as bare hex.
 */
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Config from "effect/Config";
import * as Console from "effect/Console";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as HttpClient from "effect/http/HttpClient";

class SpecImportFailed extends Data.TaggedError("SpecImportFailed")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

class ContractDrift extends Data.TaggedError("ContractDrift")<{
  readonly message: string;
}> {}

const USAGE =
  "Use [--check] [--input <exported-openapi.json>]; without --input the Registry endpoint named by AXM_REGISTRY_SPEC_URL is fetched.";

const parseArguments = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    let check = false;
    let input: string | undefined;
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      if (arg === "--check" && !check) {
        check = true;
      } else if (arg === "--input" && input === undefined && args[index + 1] !== undefined) {
        input = args[index + 1];
        index += 1;
      } else {
        return yield* new SpecImportFailed({ message: USAGE });
      }
    }
    return { check, input };
  });

const OperationShape = Schema.Struct({ operationId: Schema.String });
const DocumentShape = Schema.Struct({
  info: Schema.Struct({ version: Schema.String }),
  paths: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Unknown)),
});

/** The document's declared version and the sorted set of its operation ids. */
const describeDocument = (document: unknown) =>
  Effect.gen(function* () {
    const shape = yield* Schema.decodeUnknownEffect(DocumentShape)(document).pipe(
      Effect.mapError(
        (cause) =>
          new SpecImportFailed({ message: "The document is not an OpenAPI document", cause }),
      ),
    );
    const operationIds = Object.values(shape.paths)
      .flatMap((item) => Object.values(item))
      .flatMap((operation) =>
        Option.match(Schema.decodeUnknownOption(OperationShape)(operation), {
          onNone: () => [],
          onSome: ({ operationId }) => [operationId],
        }),
      )
      .sort();
    return { version: shape.info.version, operationIds };
  });

const canonicalText = (document: unknown): string => `${JSON.stringify(document, undefined, 2)}\n`;

const sha256Hex = (text: string) =>
  Effect.tryPromise({
    try: () => crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    catch: (cause) => new SpecImportFailed({ message: "Could not digest the document", cause }),
  }).pipe(
    Effect.map((digest) =>
      Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(""),
    ),
  );

const parseDocument = Schema.decodeUnknownEffect(Schema.fromJsonString(Schema.Unknown));

const readSource = (input: string | undefined) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    if (input !== undefined) {
      const resolved = path.resolve(input);
      return { source: resolved, text: yield* fs.readFileString(resolved) };
    }
    const baseUrl = yield* Config.String("AXM_REGISTRY_SPEC_URL").pipe(
      Config.withDefault("http://localhost:4300"),
    );
    const url = `${baseUrl.replace(/\/+$/, "")}/v1/openapi.json`;
    const client = yield* HttpClient.HttpClient;
    const response = yield* HttpClient.filterStatusOk(client)
      .get(url)
      .pipe(Effect.timeout("10 seconds"));
    return { source: url, text: yield* response.text };
  });

const sync = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { check, input } = yield* parseArguments(process.argv.slice(2));
  const root = path.resolve(import.meta.dirname, "..");
  const specPath = path.join(root, "specs", "registry-openapi.json");
  const digestPath = path.join(root, "specs", "registry-openapi.sha256");

  const { source, text } = yield* readSource(input);
  const document = yield* parseDocument(text);
  const canonical = canonicalText(document);
  const digest = yield* sha256Hex(canonical);
  const served = yield* describeDocument(document);

  if (!check) {
    yield* fs.makeDirectory(path.dirname(specPath), { recursive: true });
    yield* fs.writeFileString(specPath, canonical);
    yield* fs.writeFileString(digestPath, `${digest}\n`);
    yield* Console.log(
      `Synced ${path.relative(root, specPath)} from ${source} (info.version ${served.version}, sha256 ${digest})`,
    );
    return;
  }

  const recordedDigest = (yield* fs.readFileString(digestPath)).trim();
  const recorded = yield* describeDocument(
    yield* parseDocument(yield* fs.readFileString(specPath)),
  );
  const servedIds = new Set(served.operationIds);
  const recordedIds = new Set(recorded.operationIds);
  const added = served.operationIds.filter((id) => !recordedIds.has(id));
  const removed = recorded.operationIds.filter((id) => !servedIds.has(id));
  const drifted = recordedDigest !== digest;
  const report = [
    `## Registry contract ${drifted ? "drift" : "match"}`,
    "",
    `- Source: ${source}`,
    `- Recorded sha256: \`${recordedDigest}\` (info.version ${recorded.version})`,
    `- Served sha256: \`${digest}\` (info.version ${served.version})`,
    `- Operations added: ${added.length === 0 ? "none" : added.map((id) => `\`${id}\``).join(", ")}`,
    `- Operations removed: ${removed.length === 0 ? "none" : removed.map((id) => `\`${id}\``).join(", ")}`,
    "",
  ].join("\n");
  yield* Console.log(report);
  const summary = yield* Config.option(Config.String("GITHUB_STEP_SUMMARY"));
  if (Option.isSome(summary) && summary.value.length > 0) {
    yield* fs.writeFileString(summary.value, `${report}\n`, { flag: "a" });
  }
  if (drifted) {
    return yield* new ContractDrift({
      message: `The served contract (sha256 ${digest}) differs from the recorded snapshot (sha256 ${recordedDigest}).`,
    });
  }
});

NodeRuntime.runMain(
  sync.pipe(Effect.provide(Layer.mergeAll(NodeServices.layer, FetchHttpClient.layer))),
);
