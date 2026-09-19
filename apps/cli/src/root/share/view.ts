import type { ShareWorkspaceDocument } from "@agentxm/workspace/sharing";
import type { Doc } from "../../screen/index.js";

const packageMetadataDoc = (result: ShareWorkspaceDocument): Doc =>
  result.packageMetadata === undefined
    ? []
    : [
        {
          _tag: "section",
          title: `${result.packageMetadata.ecosystem}: ${result.packageMetadata.location}`,
          children: [{ _tag: "raw", content: result.packageMetadata.content }],
        },
      ];

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
  ...packageMetadataDoc(result),
];
