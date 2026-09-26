export {
  makeMemoryFileSystem,
  type MemoryFileSystem,
  type MemoryFileSystemCall,
  type FileStore,
  type MemoryFileType,
} from "./memory-file-system.js";
export { withoutNativeIo } from "./native-io-guard.js";
export { makeNativeFileStore } from "./native-file-store.js";
export { snapshotPath, snapshotTree } from "./tree-snapshot.js";
export {
  WORKSPACE_PROTECTED_STATE,
  snapshotProtectedState,
  type ProtectedStateSnapshot,
} from "./protected-state.js";
