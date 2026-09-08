/** Populated project and user workspaces whose authoritative inputs cannot be decoded. */
import * as fs from "node:fs";
import * as path from "node:path";

export const writeMalformedWorkspaceState = (projectRoot: string, userHome: string): void => {
  const userWorkspace = path.join(userHome, ".axm", "workspace");
  for (const [label, root] of [
    ["project", projectRoot],
    ["user", userWorkspace],
  ] as const) {
    fs.mkdirSync(path.join(root, "agent_extensions", "retained"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "agent_extensions", "retained", "content.md"),
      `${label} acquired content to preserve.\n`,
    );
    fs.writeFileSync(
      path.join(root, "axm.json"),
      `{"agents":["claude-code"],"skills":{"retained":"workspace"},"unfinished":`,
    );
    fs.writeFileSync(
      path.join(root, "axm-lock.yaml"),
      "lockfileVersion: 7\nskills: [unterminated\n",
    );
  }
  for (const [label, root] of [
    ["project", projectRoot],
    ["user", userHome],
  ] as const) {
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".claude", "settings.json"),
      JSON.stringify({ retained: label }),
    );
    fs.writeFileSync(path.join(root, "AGENTS.md"), `${label} authored instructions to preserve.\n`);
  }
};
