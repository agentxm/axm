/** Production assessment owners composed only for platform check evidence. */
import { lintSelectedSubjects } from "../linting/index.js";
import { SyncWorkspace } from "../sync/index.js";

export const localCheckOwners = {
  lint: lintSelectedSubjects,
  convergence: SyncWorkspace.assessLocalMaterialization,
};
