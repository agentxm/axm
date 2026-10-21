import { join } from "node:path";

const gate = join(import.meta.dirname, "check-staged.sh");

// lint-staged owns backup, index isolation, and working-change restoration.
// A function prevents appending or chunking the repository-wide file list.
export default () => `bash "${gate}" --index-visible`;
