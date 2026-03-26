import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { copyFixture, createCliRunner, createTempDir } from "@axm.sh/e2e-utils";

export const runCli = createCliRunner(new URL("../../cli/dist/src/main.js", import.meta.url));
export const runDevCli = createCliRunner(new URL("../../cli/dist/src/dev-main.js", import.meta.url));

export { createTempDir };

export const FIXTURES_PATH = fileURLToPath(new URL("./fixtures/", import.meta.url));
export const SKILLS_REPO_FIXTURE = path.join(FIXTURES_PATH, "skills-repo");

export const copySkillsRepoFixture = () => copyFixture(SKILLS_REPO_FIXTURE);
