import type { ShareWorkspaceDocument } from "@agentxm/workspace-features/sharing";
import { count, recordDoc, type Doc } from "../../screen/index.js";

/**
 * What sharing the workspace's authored extensions gives another project:
 * where they come from and whether that origin is reachable, the package
 * metadata to commit where one applies, and the command that installs them.
 */
export const shareDoc = (result: ShareWorkspaceDocument): Doc =>
  recordDoc({
    tone: result.availability === "available" ? "ok" : "warn",
    verdict: `Share ${count(result.extensions.length, "extension")}`,
    facts: [result.availability === "available" ? "origin available" : "origin unavailable"],
    fields: [{ label: "Origin", value: result.origin }],
    ...(result.packageMetadata === undefined
      ? {}
      : {
          sections: [
            {
              title: `${result.packageMetadata.ecosystem}: ${result.packageMetadata.location}`,
              children: [{ _tag: "raw", content: result.packageMetadata.content }],
            },
          ],
        }),
    next: [
      { description: "Install these extensions in another project", cmd: result.installCommand },
    ],
  });
