export interface CliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface RunCliOptions {
  readonly cwd?: string;
  /** Undefined removes an inherited variable from the child environment. */
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly timeout?: number;
  /** Keep output exactly as written, including its final newline. */
  readonly exactOutput?: boolean;
  /** Close the read end of stdout at spawn, so the process's first stdout write fails. */
  readonly closedStdout?: boolean;
}

export interface TempDirContext {
  readonly path: string;
  readonly cleanup: () => void;
}
