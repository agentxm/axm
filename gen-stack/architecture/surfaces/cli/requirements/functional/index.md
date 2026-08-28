# Functional Requirements

Required interaction and output behavior of the AXM CLI.

- [Machine mode never prompts](machine-mode-never-prompts.md) - The AXM CLI
  never prompts for interactive input while operating in machine output mode.
- [Output channels separate results from diagnostics](output-channel-separation.md) -
  AXM commands present the primary result on stdout and emit diagnostics on
  stderr without corrupting it.
