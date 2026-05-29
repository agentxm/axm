---
title: axm auth
description: Manage registry authentication.
---

# axm auth

Manage registry authentication.

## When to use

Use this command family when signing in, signing out, or managing tokens.

## Usage

```bash
axm auth <subcommand> [flags]
```

## Arguments

None.

## Flags

None.

Global flags are documented on [Global flags](./global-flags).

## Examples

**Sign in to the default registry**

```bash
axm auth login
```

**Check who you're authenticated as**

```bash
axm auth whoami
```

**Print your auth token for scripting**

```bash
axm auth token
```

## Subcommands

| Command                             | Summary                             |
| ----------------------------------- | ----------------------------------- |
| [axm auth login](#axm-auth-login)   | Sign in to a registry               |
| [axm auth logout](#axm-auth-logout) | Sign out of a registry              |
| [axm auth whoami](#axm-auth-whoami) | Show current authenticated identity |
| [axm auth token](#axm-auth-token)   | Output current auth token to stdout |

### axm auth login

Sign in to a registry

```bash
axm auth login [flags]
```

### axm auth logout

Sign out of a registry

```bash
axm auth logout [flags]
```

### axm auth whoami

Show current authenticated identity

```bash
axm auth whoami [flags]
```

### axm auth token

Output current auth token to stdout

```bash
axm auth token <subcommand> [flags]
```

## Requirements

None.

## Side effects

None.
