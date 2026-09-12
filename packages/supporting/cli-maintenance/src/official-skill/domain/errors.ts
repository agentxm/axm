import * as Data from "effect/Data";
import type { AxmSkillCompatibility } from "./policy.js";

/**
 * The official AXM skill candidate is incompatible with this CLI. Carries the
 * policy's full compatibility verdict, whose recovery plan the application
 * boundary renders into suggestions.
 */
export class AxmSkillIncompatible extends Data.TaggedError("AxmSkillIncompatible")<{
  readonly compatibility: AxmSkillCompatibility;
}> {}
