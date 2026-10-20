export { makeMemoryFileSystem, type FileStore } from "./memory-file-system.js";
export { withoutNativeIo } from "./native-io-guard.js";
export { makeNativeFileStore } from "./native-file-store.js";
export { snapshotTree } from "./tree-snapshot.js";
export {
  WORKSPACE_PROTECTED_STATE,
  snapshotProtectedState,
  type ProtectedStateSnapshot,
} from "./protected-state.js";
