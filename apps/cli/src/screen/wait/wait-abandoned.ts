import * as Data from "effect/Data";

/**
 * A person stopped a wait rather than completing it elsewhere. The request it
 * parked on is untouched: the caller ends with its own pending outcome and
 * names the route that resumes it.
 */
export class WaitAbandoned extends Data.TaggedError("WaitAbandoned")<{
  readonly message: string;
}> {}
