import * as Data from "effect/Data";

/** A lifecycle transition failed its observable postcondition. */
export class LifecyclePostconditionViolated extends Data.TaggedError(
  "LifecyclePostconditionViolated",
)<{
  readonly postcondition:
    | "install-observable"
    | "install-declared"
    | "new-observable"
    | "new-declared"
    | "materialize-observable"
    | "uninstall-remains-declared"
    | "uninstall-observed-state";
  readonly targetType: string;
  readonly targetName: string;
}> {}

/** A newly scaffolded extension could not be resolved from its workspace source. */
export class ScaffoldedExtensionUnresolved extends Data.TaggedError(
  "ScaffoldedExtensionUnresolved",
)<{
  readonly targetType: string;
  readonly targetName: string;
}> {}
