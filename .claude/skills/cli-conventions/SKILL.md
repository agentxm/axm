---
name: cli-conventions
description: yargs + Effect CLI architecture. Use when adding commands, defining flags, or wiring handlers. Covers file organization and testing.
user-invocable: false
---

# CLI Design Conventions

Apply these conventions when working on CLI commands.

---

## yargs + Effect Architecture

yargs handles parsing; Effect handles business logic. Separate handler functions
for testability:

```typescript
// 1. Define args interface
interface DeployArgs {
  target: string;
  env: string;
}

// 2. Pure Effect handler (testable without yargs)
const handleDeploy = (args: DeployArgs) =>
  Effect.gen(function* () {
    // Business logic here
  });

// 3. CommandModule wires yargs to handler
export const deployCommand: CommandModule<{}, DeployArgs> = {
  command: "deploy <target>",
  describe: "Deploy to target environment",
  builder: (yargs) =>
    yargs
      .positional("target", { type: "string", demandOption: true })
      .option("env", { type: "string", default: "staging" }),
  handler: async (argv) => {
    await Effect.runPromise(handleDeploy(argv));
  },
};
```

### Architecture Checklist

- [ ] **yargs for parsing** — Type-safe argument parsing via yargs
- [ ] **Effect for logic** — Command handlers are Effect programs
- [ ] **Handler separation** — Effect handlers separate from CommandModule
- [ ] **Typed CommandModule** — Uses `CommandModule<ParentArgs, Args>` generics

---

## Command Structure

```bash
# Noun-verb structure with flags over positionals
mycli <resource> <action> [flags]
mycli deploy create --env staging
```

### Command Naming Checklist

- [ ] **Noun-verb structure** — Commands follow `<resource> <action>` pattern
- [ ] **2-3 levels max** — Command hierarchy limited to 2-3 levels
- [ ] **kebab-case** — Command names use kebab-case
- [ ] **Flags over positionals** — Positionals only for single obvious value
- [ ] **Consistent verbs** — Same verbs across resources (`create`, `list`, `delete`)

### File Organization

```
src/commands/
├── extensions.ts           # Parent command
├── extensions/             # Subcommands folder
│   ├── create.ts
│   ├── list.ts
│   └── utils.ts            # Shared utilities
└── init.ts                 # Standalone command
```

---

## Parent Command Behavior

Parent commands show help menu, exit 0 (not error):

```typescript
export const extensionsCommand: CommandModule = {
  command: "extensions",
  describe: "Manage extensions",
  builder: (yargs) =>
    yargs
      .command(addCommand)
      .command(listCommand)
      .demandCommand(1)
      .fail((msg, err, yargs) => {
        if (msg?.includes("Not enough non-option arguments")) {
          yargs.showHelp();
          process.exit(0); // Welcome, not error
        }
        console.error(msg);
        process.exit(1);
      }),
  handler: () => {},
};
```

---

## Standard Flags

| Flag                | Short | Purpose                       |
| ------------------- | ----- | ----------------------------- |
| `--verbose`         | `-v`  | Increase output detail        |
| `--quiet`           | `-q`  | Suppress non-essential output |
| `--json`            |       | Output as JSON                |
| `--non-interactive` |       | Disable all prompts           |
| `--yes`             | `-y`  | Skip confirmations            |

---

## Interactive Prompts

Use `@clack/prompts` for all interactive input:

```typescript
import * as p from "@clack/prompts";

const result = await p.select({
  message: "Select environment",
  options: [
    { value: "staging", label: "Staging" },
    { value: "production", label: "Production", hint: "requires approval" },
  ],
});

if (p.isCancel(result)) {
  p.cancel("Operation cancelled.");
  process.exit(0);
}
```

### Interactive Prompts Checklist

- [ ] **Uses clack** — All prompts use `@clack/prompts`
- [ ] **Cancellation handled** — `p.isCancel()` checked after every prompt
- [ ] **Cancel exits 0** — User cancellation exits cleanly
- [ ] **Non-interactive fallback** — Every prompt has an equivalent flag
- [ ] **TTY detection** — Prompts only shown when `process.stdin.isTTY`

---

## Output Conventions

- **stdout** — Data/results for piping
- **stderr** — Progress, spinners, errors

```typescript
if (process.stdout.isTTY) {
  // Interactive: colors, spinners, tables
} else {
  // Piped: plain text, no ANSI codes
}
```

Use clack output components:

```typescript
const spin = p.spinner();
spin.start("Deploying");
await deploy();
spin.stop("Deployed successfully");
```

---

## Error Handling

| Code | Meaning         |
| ---- | --------------- |
| 0    | Success         |
| 1    | Error           |
| 130  | SIGINT (Ctrl+C) |

Format errors with recovery guidance:

```
✗ Could not find configuration file
  Looked for: ./mycli.config.ts, ./mycli.config.json
  Run 'mycli init' to create one.
```

### Error Handling Checklist

- [ ] **Exit 0/1** — Success exits 0, all errors exit 1
- [ ] **What happened** — Error explains what went wrong
- [ ] **How to fix** — Error suggests resolution
- [ ] **Effect errors mapped** — Typed errors mapped to user-facing messages

---

## Testing Commands

Test yargs validation and Effect handlers separately:

```typescript
// yargs validation test
const createParser = () => yargs().command(deployCommand).exitProcess(false).fail(false);

it("requires target", () => {
  expect(() => createParser().parse("deploy")).toThrow();
});

// Effect handler test
it("deploys to target", async () => {
  const TestLayer = Layer.succeed(DeployService, mockService);
  const result = await Effect.runPromise(
    handleDeploy({ target: "prod", env: "staging" }).pipe(Effect.provide(TestLayer)),
  );
  expect(result).toEqual({ deployed: true });
});
```

### Testing Checklist

- [ ] **Parser isolation** — Fresh yargs instance per test
- [ ] **Exit disabled** — Uses `.exitProcess(false)`
- [ ] **Fail disabled** — Uses `.fail(false)` to throw
- [ ] **Handler unit tests** — Effect handlers tested independently
- [ ] **Test layers provided** — Handler tests provide test layers
