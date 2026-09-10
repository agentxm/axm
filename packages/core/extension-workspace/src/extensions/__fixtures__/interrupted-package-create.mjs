import * as nodeFs from "node:fs";
import * as nodePath from "node:path";

const canonicalPath = process.argv[2];
if (canonicalPath === undefined) process.exit(2);

const stagingPath = `${canonicalPath}.axm-staging`;
nodeFs.mkdirSync(nodePath.join(stagingPath, "src"), { recursive: true });
nodeFs.writeFileSync(nodePath.join(stagingPath, "package.json"), "{}\n");
nodeFs.writeFileSync(nodePath.join(stagingPath, "src", "content.md"), "complete\n");
process.kill(process.pid, "SIGKILL");
