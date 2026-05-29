---
title: Global flags
description: Global flags accepted by AXM commands.
---

# Global flags

These flags are accepted across the AXM command tree.

| Name                | Type    | Required | Description                                            |
| ------------------- | ------- | -------- | ------------------------------------------------------ |
| `--help`, `-h`      | boolean | No       | Show help information                                  |
| `--version`         | boolean | No       | Show version information                               |
| `--non-interactive` | boolean | No       | Disable all interactive prompts                        |
| `--verbose`, `-v`   | boolean | No       | Show additional diagnostic details for errors          |
| `--debug`           | boolean | No       | Show full debug details for errors (implies --verbose) |
| `--quiet`, `-q`     | boolean | No       | Suppress non-essential output                          |
| `--json`, `-j`      | boolean | No       | Output machine-readable JSON                           |
