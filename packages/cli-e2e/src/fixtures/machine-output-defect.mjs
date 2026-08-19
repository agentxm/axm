import { runCliMain } from "../../../core/dist/src/unstable/cli-runtime/index.js";

await runCliMain(
  () => {
    throw new Error("Unexpected built-runtime fixture defect: token=e2e-secret-sentinel");
  },
  { args: process.argv.slice(2) },
);
