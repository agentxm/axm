## REMOVED Requirements

### Requirement: OperationResult re-exported from apply-plan

**Reason**: The barrel `index.ts` already exports `OperationResult`, `PlannedJobStep`, `JobStepResult`, and `JobStep` from `plan.ts`. The dual export path from `apply-plan.ts` is unnecessary, and backwards compatibility is a non-goal.

**Migration**: Import plan types from the workspace barrel (`@/workspace`) or directly from `./plan.js` instead of `./apply-plan.js`.
