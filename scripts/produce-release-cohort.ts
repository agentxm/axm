import { produceReleaseCohort, validateReleaseCohort } from "./release-packages.js";
import { RELEASE_PACKAGES, readPackageVersion } from "./release-shared.js";

const commit = process.argv[2];
const output = process.argv[3];
if (commit === undefined || output === undefined)
  throw new Error("Expected <commit-sha> <output-directory>.");

const cli = RELEASE_PACKAGES.find((member) => member.name === "axm.sh");
if (cli === undefined) throw new Error("axm.sh is not a member of the release cohort.");
const version = readPackageVersion(cli.path);
await produceReleaseCohort(version, commit, output);
await validateReleaseCohort(output, version, commit);
console.log(`Produced verified npm cohort ${version} for ${commit}.`);
