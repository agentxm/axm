/**
 * Generate and validate a release candidate inside an isolated checkout.
 *
 * This internal target always applies release mutations to its current
 * checkout. The parent release-preparation process owns whether those
 * temporary changes are discarded or committed and delivered.
 */

import {
  releaseChangelog as nxReleaseChangelog,
  releaseVersion as nxReleaseVersion,
} from "nx/release/index.js";

import { run } from "./release-command.js";
import {
  type ReleaseCandidateHost,
  runReleaseCandidatePreparation,
} from "./release-prepare-candidate-orchestration.js";
import {
  PRODUCTION_REGISTRY_PREVIEW_ARGS,
  RELEASE_PROCESS_ENV,
  fail,
  releaseTagFromVersion,
  requireMatchingReleasePackageVersions,
  stampSkillCompatibility,
  writeSkillVersion,
} from "./release-shared.js";

const requireWorkspaceVersion = (workspaceVersion: string | null | undefined): string =>
  workspaceVersion ??
  fail(
    "Expected Nx Release to resolve a fixed workspace version from pending version plans. Run `pnpm release:plan` first.",
  );

type NxReleaseContext = Awaited<ReturnType<typeof nxReleaseVersion>>;

const candidateHost: ReleaseCandidateHost<NxReleaseContext> = {
  version: async () => {
    console.log("\n==> Candidate phase 1: Version pending release plans");
    const context = await nxReleaseVersion({
      dryRun: false,
      deleteVersionPlans: true,
      stageChanges: false,
      gitCommit: false,
      gitTag: false,
      gitPush: false,
    });
    return { version: requireWorkspaceVersion(context.workspaceVersion), context };
  },

  changelog: async ({ version, context }) => {
    console.log("\n==> Candidate phase 2: Update changelog");
    await nxReleaseChangelog({
      version,
      versionData: context.projectsVersionData,
      releaseGraph: context.releaseGraph,
      dryRun: false,
      createRelease: false,
      stageChanges: false,
      gitCommit: false,
      gitTag: false,
      gitPush: false,
    });
  },

  stampSkill: (version) => {
    console.log("\n==> Candidate phase 3: Stamp the bundled AXM skill");
    writeSkillVersion(version);
    stampSkillCompatibility(version);
  },

  generateSkill: () =>
    run(
      "pnpm",
      ["exec", "nx", "run", "cli:generate:bundled-axm-skill", "--outputStyle=static"],
      RELEASE_PROCESS_ENV,
    ),

  previewRegistry: () => {
    console.log("\n==> Candidate phase 4: Preview the exact candidate with production Registry");
    run("pnpm", PRODUCTION_REGISTRY_PREVIEW_ARGS, RELEASE_PROCESS_ENV);
  },

  validateCohort: (version) => {
    const appliedVersion = requireMatchingReleasePackageVersions();
    if (appliedVersion !== version) {
      fail(`Nx Release reported ${version}, but package versions on disk are ${appliedVersion}.`);
    }
  },
};

const main = async () => {
  const version = await runReleaseCandidatePreparation(candidateHost);
  const tag = releaseTagFromVersion(version);
  console.log(`  Version: ${version}`);
  console.log(`  Tag: ${tag}`);
};

void main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
