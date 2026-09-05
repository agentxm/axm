import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as Schema from "effect/Schema";
import { packReleaseCohort } from "./release-packages.js";
const version = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ version: Schema.String })),
)(readFileSync("packages/cli/package.json", "utf8")).version;
const directory = mkdtempSync(join(tmpdir(), "axm-pack-verification-"));
try {
  packReleaseCohort(version, directory);
  console.log(
    `Verified deterministic packed cohort ${version}, compiled executables and dependency references.`,
  );
} catch (cause) {
  throw new Error(`Release pack verification failed; artifacts retained at ${directory}.`, {
    cause,
  });
}
rmSync(directory, { recursive: true, force: true });
