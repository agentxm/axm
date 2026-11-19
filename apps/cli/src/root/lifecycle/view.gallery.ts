import * as Schema from "effect/Schema";

import {
  ArchivalTransitionSchema,
  DeprecationTransitionSchema,
} from "@agentxm/registry-protocol/unstable/registry";

import { galleryModule } from "../../test-support/gallery/fixture.js";
import { archivalDoc, deprecationDoc } from "./view.js";

const deprecation = Schema.decodeUnknownSync(DeprecationTransitionSchema)({
  target: "@acme/skills/review",
  before: null,
  after: {
    deprecatedAt: "2026-09-19T00:00:00.000Z",
    reason: "superseded",
    message: "Move review workflows to the reviewer subagent",
    replacement: { status: "available", fqn: "@acme/skills/reviewer" },
  },
  disposition: "created",
  revision: "rev-2026-09-19-01",
});

const archival = Schema.decodeUnknownSync(ArchivalTransitionSchema)({
  target: "@acme/skills/changelog",
  before: null,
  after: { archivedAt: "2026-09-19T00:00:00.000Z", message: "No longer maintained" },
  disposition: "created",
  revision: "rev-2026-09-19-02",
});

/**
 * Registry lifecycle transitions as records: the verdict names what changed,
 * and the state move, revision, and guidance sit on the value column.
 */
export default galleryModule(
  { _tag: "document", name: "record--deprecate", doc: deprecationDoc(deprecation) },
  { _tag: "document", name: "record--archive", doc: archivalDoc(archival) },
);
