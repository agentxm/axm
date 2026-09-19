import type { ShareWorkspaceDocument } from "@agentxm/workspace/sharing";
import type { Doc } from "../../screen/index.js";

export const shareDoc = (result: ShareWorkspaceDocument): Doc => [
  {
    _tag: "paragraph",
    text: [
      { text: "Origin: " },
      { text: result.origin },
      {
        text: ` (${result.availability})`,
        tone: result.availability === "available" ? "ok" : "warn",
      },
    ],
  },
  { _tag: "paragraph", text: result.installCommand },
];
