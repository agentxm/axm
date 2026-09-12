import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packReleaseCohort } from "./release-packages.js";
import { RELEASE_PACKAGES, readPackageVersion } from "./release-shared.js";
const cli = RELEASE_PACKAGES.find((member) => member.name === "axm.sh");
if (cli === undefined) throw new Error("axm.sh is not a member of the release cohort.");
const version = readPackageVersion(cli.path);
const directory = mkdtempSync(join(tmpdir(), "axm-pack-verification-"));
try {
  await packReleaseCohort(version, directory);
  console.log(
    `Verified deterministic packed cohort ${version}, publint package contracts, compiled executables and dependency references.`,
  );
} catch (cause) {
  throw new Error(`Release pack verification failed; artifacts retained at ${directory}.`, {
    cause,
  });
}
rmSync(directory, { recursive: true, force: true });
