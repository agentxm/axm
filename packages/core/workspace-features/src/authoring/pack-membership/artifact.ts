import type { Handle } from "@agentxm/extension-model/unstable/extensions";
import type { JobStepArtifact, JobStepArtifactTarget } from "@agentxm/workspace-kernel/operations";
import { acquiredDisplayPath } from "@agentxm/workspace-kernel/workspace-state";
import { manifestFilenameForType } from "@agentxm/extension-model/unstable/extensions/common";

const packManifestPath = (scope: JobStepArtifact["scope"], owner: Handle, name: string): string =>
  scope === "project"
    ? `packs/${name}/${manifestFilenameForType("pack")}`
    : acquiredDisplayPath(scope, `${owner}/packs/${name}/${manifestFilenameForType("pack")}`);

const packManifestTarget = (
  scope: JobStepArtifact["scope"],
  owner: Handle,
  name: string,
  change: JobStepArtifactTarget["change"],
): JobStepArtifactTarget => ({
  path: packManifestPath(scope, owner, name),
  change,
});

export const packManifestArtifact = (args: {
  readonly owner: Handle;
  readonly name: string;
  readonly scope: JobStepArtifact["scope"];
  readonly change: JobStepArtifact["change"];
  readonly version?: string;
  readonly fileCount?: number;
}): JobStepArtifact => ({
  path: packManifestPath(args.scope, args.owner, args.name),
  scope: args.scope,
  change: args.change,
  ...(args.version === undefined ? {} : { version: args.version }),
  ...(args.fileCount === undefined ? {} : { fileCount: args.fileCount }),
  targets: [packManifestTarget(args.scope, args.owner, args.name, args.change)],
});
