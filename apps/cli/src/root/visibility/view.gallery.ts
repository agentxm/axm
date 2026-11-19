import * as Schema from "effect/Schema";

import {
  VisibilityEvaluationSchema,
  VisibilityMutationResultSchema,
} from "@agentxm/registry-protocol/unstable/publish";

import { galleryModule } from "../../test-support/gallery/fixture.js";
import { visibilityChangeDoc, visibilityEvaluationDoc } from "./view.js";

const evaluation = Schema.decodeUnknownSync(VisibilityEvaluationSchema)({
  target: "@acme/skills/review",
  intent: null,
  request: null,
  resolved: null,
  actual: null,
  comparison: "not-established",
  findings: [
    {
      code: "visibility/intent-required",
      severity: "warning",
      message: "Declare visibility in the manifest before publishing a new extension",
    },
  ],
});

const change = Schema.decodeUnknownSync(VisibilityMutationResultSchema)({
  target: "@acme/skills/review",
  before: "private",
  after: "public",
  authority: { kind: "operator" },
  result: "changed",
  revision: "rev-7",
});

/**
 * Visibility as a detail record with what needs attention as conditions, and
 * a settled change as a verdict with the revision it settled at.
 */
export default galleryModule(
  { _tag: "document", name: "record--visibility-status", doc: visibilityEvaluationDoc(evaluation) },
  { _tag: "document", name: "record--visibility-set", doc: visibilityChangeDoc(change) },
);
