/** Validate downloaded shard evidence without building or invoking the CLI. */
import * as fs from "node:fs";
import * as path from "node:path";
import * as Effect from "effect/Effect";
import * as Console from "effect/Console";
import * as Schema from "effect/Schema";
import { aggregateWireCoverage, WireRunEvidenceSchema } from "./wire-coverage.js";

await Effect.runPromise(
  Effect.try(() => {
    const [directory, shardCount] = Schema.decodeUnknownSync(
      Schema.Tuple([Schema.String, Schema.String]),
    )(process.argv.slice(2));
    const root = path.resolve(directory);
    const output = path.join(root, "wire-coverage.json");
    fs.rmSync(output, { force: true });
    const decode = Schema.decodeUnknownSync(Schema.fromJsonString(WireRunEvidenceSchema));
    const reports = [...fs.globSync("**/wire-coverage.json", { cwd: root })]
      .map((file) => path.join(root, file))
      .filter((file) => file !== output)
      .sort();
    const coverage = aggregateWireCoverage(
      reports.map((file) => decode(fs.readFileSync(file, "utf8"))),
      Number(shardCount),
    );
    fs.writeFileSync(output, `${JSON.stringify({ ...coverage, reports }, null, 2)}\n`);
    if (!coverage.complete)
      throw new Error(`Combined CLI wire coverage is incomplete:\n${coverage.issues.join("\n")}`);
    return `Combined wire contracts: ${coverage.validatedDocuments} validated documents; ${coverage.observedResults.length}/${coverage.requiredResults.length} adapter/mode pairs; ${coverage.requiredVariants.length} required variants.\nCoverage report: ${output}`;
  }).pipe(Effect.tap(Console.log)),
);
