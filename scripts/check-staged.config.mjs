// lint-staged owns backup, index isolation, and working-change restoration.
// A function prevents appending or chunking the repository-wide file list.
export default () => "bash scripts/check-staged.sh --index-visible";
