import { initializedRule } from "../../initialized.js";
import {
  contextFor,
  validLockfile,
  validSettings,
  type WorkspaceRuleConformanceCase,
} from "../test-helpers.js";

export const initializedConformance: WorkspaceRuleConformanceCase = {
  rule: initializedRule,
  satisfied: () => contextFor({ settings: validSettings(), lockfile: validLockfile }),
  violated: () => contextFor({ settings: { _tag: "absent" }, lockfile: { _tag: "absent" } }),
  expectedFindings: [
    {
      message: "The workspace settings file is missing.",
      location: { file: "axm.json" },
    },
  ],
};
