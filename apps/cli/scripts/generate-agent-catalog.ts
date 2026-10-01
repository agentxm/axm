import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import {
  AGENTS,
  AgentCatalogReferenceSchema,
  makeAgentCatalogReference,
} from "@agentxm/extension-model/unstable/agent-capabilities";
import { format, resolveConfig } from "prettier";

const generate = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const cliRoot = path.resolve(import.meta.dirname, "..");
  const outputPath = path.join(
    cliRoot,
    "site-content/__generated__/agent-catalog/agent-catalog.json",
  );
  const catalog = yield* Schema.decodeUnknownEffect(AgentCatalogReferenceSchema, {
    onExcessProperty: "error",
  })(makeAgentCatalogReference(AGENTS));
  const prettierConfig = yield* Effect.tryPromise(() => resolveConfig(outputPath));
  const formatted = yield* Effect.tryPromise(() =>
    format(JSON.stringify(catalog), {
      ...prettierConfig,
      filepath: outputPath,
      parser: "json",
    }),
  );
  yield* fs.makeDirectory(path.dirname(outputPath), { recursive: true });
  yield* fs.writeFileString(outputPath, formatted);
  yield* Console.log(`Generated: ${path.relative(cliRoot, outputPath)}`);
});

NodeRuntime.runMain(generate.pipe(Effect.provide(NodeServices.layer)));
