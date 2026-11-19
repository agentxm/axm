import * as Schema from "effect/Schema";

import { ShareWorkspaceDocumentSchema } from "@agentxm/workspace-features/sharing";

import { galleryModule } from "../../test-support/gallery/fixture.js";
import { shareDoc } from "./view.js";

const shared = Schema.decodeUnknownSync(ShareWorkspaceDocumentSchema)({
  command: "share",
  origin: "https://github.com/acme/platform-services",
  locator: "github:acme/platform-services",
  availability: "available",
  extensions: [
    { type: "skill", name: "incident-review", selector: "skills/incident-review" },
    { type: "subagent", name: "reviewer", selector: "subagents/reviewer" },
  ],
  installCommand: "axm install github:acme/platform-services --all",
  packageMetadata: {
    ecosystem: "npm",
    location: "package.json",
    tag: "agentExtensions",
    content: '"agentExtensions": [\n  { "ref": "github:acme/platform-services" }\n]',
  },
});

/**
 * `axm share` as a record: what it shares and from where, the package
 * metadata to commit as a pass-through section, and the install command as
 * the next step.
 */
export default galleryModule({ _tag: "document", name: "record--share", doc: shareDoc(shared) });
