export interface CliOutputEnvironment {
  readonly stdoutIsTTY: boolean | undefined;
  readonly stderrIsTTY: boolean | undefined;
  readonly env: NodeJS.ProcessEnv;
}

export interface CliOutputPolicy {
  /** Whether any stream is styled; per-stream truth lives in `stdoutColors` and `stderrColors`. */
  readonly colors: boolean;
  /** ANSI styling on stdout: only when stdout is itself a terminal. */
  readonly stdoutColors: boolean;
  /** ANSI styling on stderr: only when stderr is itself a terminal. */
  readonly stderrColors: boolean;
  readonly animate: boolean;
  readonly interactiveActivity: boolean;
  readonly quiet: boolean;
  /** Symbol set the painter uses: Unicode glyphs, or seven-bit ASCII where the terminal or locale cannot show them. */
  readonly glyphs: "unicode" | "ascii";
}

const terminalFormattingPattern =
  // eslint-disable-next-line no-control-regex -- plain output must remove ANSI CSI and OSC sequences.
  /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001b]*(?:\u0007|\u001b\\))/gu;

export const stripTerminalFormatting = (value: string): string =>
  value.replace(terminalFormattingPattern, "");

const hasNonEmptyEnv = (env: NodeJS.ProcessEnv, name: string): boolean => {
  const value = env[name];
  return value !== undefined && value !== "";
};

const hasCi = (env: NodeJS.ProcessEnv): boolean => hasNonEmptyEnv(env, "CI");

const hasNoColor = (env: NodeJS.ProcessEnv): boolean => hasNonEmptyEnv(env, "NO_COLOR");

const hasForceColor = (env: NodeJS.ProcessEnv): boolean => {
  const value = env["FORCE_COLOR"];
  return value !== undefined && value !== "" && value !== "0";
};

const hasDisabledForceColor = (env: NodeJS.ProcessEnv): boolean => {
  const value = env["FORCE_COLOR"];
  return value !== undefined && (value === "" || value === "0");
};

const hasDumbTerminal = (env: NodeJS.ProcessEnv): boolean => env["TERM"] === "dumb";

const LOCALE_VARIABLES = ["LC_ALL", "LC_CTYPE", "LANG"] as const;

const localeLacksUnicode = (env: NodeJS.ProcessEnv): boolean => {
  const declared = LOCALE_VARIABLES.map((name) => env[name]).filter(
    (value): value is string => value !== undefined && value !== "",
  );
  return declared.length > 0 && !declared.some((value) => /utf-?8/iu.test(value));
};

const resolveGlyphs = (env: NodeJS.ProcessEnv): CliOutputPolicy["glyphs"] =>
  hasNonEmptyEnv(env, "AXM_ASCII") || hasDumbTerminal(env) || localeLacksUnicode(env)
    ? "ascii"
    : "unicode";

export const resolveCliOutputPolicy = (
  environment?: Partial<CliOutputEnvironment> & { readonly quiet?: boolean },
): CliOutputPolicy => {
  // eslint-disable-next-line no-restricted-properties -- Centralized env access for CLI output policy detection.
  const env = environment?.env ?? process.env;
  const stdoutIsTTY = environment?.stdoutIsTTY ?? process.stdout.isTTY;
  const stderrIsTTY = environment?.stderrIsTTY ?? environment?.stdoutIsTTY ?? process.stderr.isTTY;
  const animate =
    stderrIsTTY === true &&
    !hasCi(env) &&
    !hasNoColor(env) &&
    !hasDisabledForceColor(env) &&
    !hasDumbTerminal(env);
  // Color is decided per stream: a pipe remains plain even when another
  // stream is a terminal or FORCE_COLOR requests styling.
  const colorCapable =
    (!hasCi(env) || hasForceColor(env)) &&
    !hasNoColor(env) &&
    !hasDisabledForceColor(env) &&
    !hasDumbTerminal(env);
  const stdoutColors = colorCapable && stdoutIsTTY === true;
  const stderrColors = colorCapable && stderrIsTTY === true;

  return {
    colors: stdoutColors || stderrColors,
    stdoutColors,
    stderrColors,
    animate,
    interactiveActivity: animate,
    quiet: environment?.quiet ?? false,
    glyphs: resolveGlyphs(env),
  };
};
