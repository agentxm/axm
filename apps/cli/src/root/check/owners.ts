import { lintSelectedSubjects } from "@agentxm/workspace-features/linting";
import { SyncWorkspace } from "@agentxm/workspace-features/sync";

/** Compose existing assessment owners; both return evidence without executable plans. */
export const localCheckOwners: {
  readonly lint: typeof lintSelectedSubjects;
  readonly convergence: typeof SyncWorkspace.assessLocalMaterialization;
} = {
  lint: lintSelectedSubjects,
  convergence: SyncWorkspace.assessLocalMaterialization,
};
