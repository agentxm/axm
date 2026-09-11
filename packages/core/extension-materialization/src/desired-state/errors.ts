/**
 * Failures deciding a retained re-materialization.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";

/**
 * A retained transition asked to restore content the workspace accepted, and
 * that content is not usable. The transition refuses rather than re-resolving
 * the source, because re-acquiring is a different decision than restoring.
 */
export class RetainedContentUnusable extends Schema.TaggedError<RetainedContentUnusable>()(
  "RetainedContentUnusable",
  {
    extensionType: Schema.String,
    name: Schema.String,
    /** The canonical observation status that made restoration impossible. */
    status: Schema.String,
  },
) {
  get detail(): string {
    return `Cannot rematerialize retained ${this.extensionType} ${this.name}: canonical content is ${this.status}`;
  }
}
