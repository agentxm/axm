/** Raw bytes of a workspace source file (path + literal content). */
export interface RawSourceBytes {
  readonly path: string;
  readonly bytes: string;
}
