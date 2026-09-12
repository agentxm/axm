import { resolve } from "node:path";

import { validateReleaseCohort } from "./release-packages.js";

const directory = process.argv[2];
const version = process.argv[3];
const commit = process.argv[4];

if (directory === undefined || version === undefined || commit === undefined) {
  throw new Error("Expected <cohort-directory> <version> <commit-sha>.");
}

await validateReleaseCohort(resolve(directory), version, commit);
console.log(`Validated exact npm cohort ${version} for ${commit}.`);
