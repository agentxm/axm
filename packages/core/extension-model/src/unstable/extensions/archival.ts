/**
 * Identity archival vocabulary carried by resolved extension references.
 *
 * Archival blocks new publication while leaving historical releases
 * resolvable. Publisher-management composites stay in
 * `@agentxm/registry-protocol`.
 *
 * @experimental This API is unstable and may change without notice.
 */

import * as Schema from "effect/Schema";
import { DateTimeUtcSchema } from "../date-time.js";

export const ArchivalViewSchema = Schema.Struct({
  archivedAt: DateTimeUtcSchema,
  reason: Schema.optional(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(500))),
}).annotate({
  identifier: "ArchivalView",
  description: "Canonical authorization-safe extension archival state.",
});

export type ArchivalView = typeof ArchivalViewSchema.Type;
