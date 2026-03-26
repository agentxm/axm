import { createCliRunner, createTempDir } from "@axm.sh/e2e-utils";

export const runCli = createCliRunner(new URL("../../cli-spike/dist/src/main.js", import.meta.url));
export { createTempDir };
