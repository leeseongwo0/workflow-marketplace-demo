# Codex Setup — Sol High + Luna Max

This bundle configures:

- primary technical-owner session: `gpt-5.6-sol`, High;
- mechanical implementation agent: `gpt-5.6-luna`, Max;
- test agent: `gpt-5.6-luna`, Max;
- security reviewer: `gpt-5.6-sol`, High.

## 1. Put the project files in the repository

Copy these files/directories to the repository root:

```text
CODEX_IMPLEMENTATION_BRIEF.md
AGENTS.md
START_PROMPT.md
.codex/
```

Project-local `.codex` settings are applied only when Codex trusts the repository.

## 2. Install the user profiles

```bash
mkdir -p ~/.codex
cp codex-profiles/sol-high.config.toml ~/.codex/sol-high.config.toml
cp codex-profiles/luna-max.config.toml ~/.codex/luna-max.config.toml
cp codex-profiles/luna-xhigh-fallback.config.toml ~/.codex/luna-xhigh-fallback.config.toml
```

The files in this bundle already use the correct profile-file naming convention.

## 3. Start the primary session

From the repository root:

```bash
codex --profile sol-high
```

Then run:

```text
/status
```

Confirm:

```text
model: gpt-5.6-sol
reasoning: high
```

Paste the contents of `START_PROMPT.md`.

## 4. Delegation behavior

The Sol parent reads `AGENTS.md` and should spawn:

- `luna_builder` for bounded implementation;
- `luna_tester` for tests and fixtures;
- `sol_reviewer` for read-only security/correctness review.

For more reliable routing, explicitly say:

```text
Delegate this bounded task to luna_builder, wait for it, inspect the diff, and run the tests yourself.
```

or:

```text
Delegate the fixtures and deterministic tests to luna_tester. Do not let it change production interfaces.
```

## 5. Manual Luna session

For a standalone narrow task:

```bash
codex --profile luna-max
```

Non-interactive:

```bash
codex exec --profile luna-max "Implement only the specified parser tests. Do not change production interfaces."
```

A CLI override has the highest precedence and is useful if a project config elsewhere pins another model:

```bash
codex \
  --model gpt-5.6-luna \
  --config model_reasoning_effort='"max"'
```

## 6. Max compatibility fallback

Model-selection documentation exposes Max, and custom-agent documentation permits `max`, but the configuration-reference enum can lag and list only through `xhigh`. If the installed CLI reports an invalid reasoning effort:

1. update Codex to the newest stable build;
2. use `/model` and select Luna → Max interactively when available;
3. otherwise replace `max` with `xhigh`;
4. use `--profile luna-xhigh-fallback`.

Fallback command:

```bash
codex --profile luna-xhigh-fallback
```

Do not silently fall back. Check `/status`.

## 7. Token-cost note

Luna is the lower-cost model, but **Luna Max is not the cheapest Luna setting**. Max deliberately spends more reasoning on a single task. The requested setup is useful when mechanical work still needs careful verification; for truly trivial formatting, linting, or boilerplate, Luna Medium or High will usually save more tokens.

## 8. Network and approvals

The project config uses:

```toml
approval_policy = "on-request"
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
network_access = true
```

Network access is needed for dependency installation and live Testnet/RSS integration. Keep approval review on and never approve commands that expose `.env`, private keys, or the local keyring.
