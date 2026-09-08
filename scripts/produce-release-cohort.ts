import { readFileSync } from "node:fs";
import * as Schema from "effect/Schema";
import { produceReleaseCohort, validateReleaseCohort } from "./release-packages.js";

const commit = process.argv[2];
const output = process.argv[3];
if (commit === undefined || output === undefined)
  throw new Error("Expected <commit-sha> <output-directory>.");

const version = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ version: Schema.String })),
)(readFileSync("packages/cli/package.json", "utf8")).version;
produceReleaseCohort(version, commit, output);
validateReleaseCohort(output, version, commit);
console.log(`Produced verified npm cohort ${version} for ${commit}.`);
