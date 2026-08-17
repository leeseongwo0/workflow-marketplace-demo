# AGENTS.md — Model Routing and Development Rules

## Project objective

Build the MVD specified in `CODEX_IMPLEMENTATION_BRIEF.md`.

The primary session is the technical owner. It must protect the product scope and cross-layer invariants while delegating only well-bounded mechanical work.

---

## Mandatory model routing

### Keep on the Sol High parent

The parent session must use **GPT-5.6 Sol with High reasoning** for:

- architecture and scope decisions;
- Sui Move object ownership and abilities;
- payment and license invariants;
- on-chain replay prevention;
- wallet/executor signature formats;
- BCS compatibility between TypeScript and Move;
- AES-GCM AAD and key-custody boundaries;
- Walrus integrity checks;
- Seal policy design;
- security-sensitive API sequencing;
- ambiguous bugs spanning multiple packages;
- final review and acceptance.

Never delegate those decisions to a Luna agent.

### Delegate to `luna_builder`

Use **GPT-5.6 Luna Max** for narrowly specified implementation after interfaces and acceptance conditions are fixed:

- repository scaffolding;
- React presentational components;
- Zod schema wiring;
- Google News URL construction;
- RSS XML parsing;
- normalization and deduplication;
- API DTO plumbing;
- environment parsing;
- scripts with already-defined inputs/outputs;
- repetitive refactors;
- lint and formatting fixes.

Give the agent exact files, constraints, expected behavior, and tests. Do not ask it to redesign the architecture.

### Delegate to `luna_tester`

Use **GPT-5.6 Luna Max** for:

- deterministic XML fixtures;
- unit and integration tests;
- frozen-clock cases;
- mocks and fakes;
- typecheck/test failure triage;
- mechanical fixes proven by failing tests.

Tests must not depend on live Google News, Sui Testnet, Walrus, or Seal.

### Use `sol_reviewer`

Use the read-only Sol reviewer after:

- Move package completion;
- executor security flow completion;
- receipt integration completion;
- final end-to-end implementation.

The parent owns the final decision and fixes.

---

## Delegation protocol

For each delegated task, the parent must specify:

1. exact scope;
2. files the agent may edit;
3. interfaces that are frozen;
4. acceptance tests;
5. prohibited changes;
6. required return format.

Suggested prompt:

```text
Delegate this to luna_builder.
Scope: <one mechanical task>.
Allowed files: <paths>.
Frozen interfaces: <symbols/schemas>.
Acceptance: <commands and assertions>.
Do not change: Move design, crypto formats, key handling, license rules, dependencies outside this package.
Wait for the agent, inspect its diff, run the tests yourself, and report any corrections.
```

Do not spawn agents for tasks that modify the same files concurrently.

Keep at most three subagent threads open. Close completed threads after their results are incorporated.

---

## Parent review requirement

A delegated result is not accepted merely because the agent reports success.

The Sol parent must:

- inspect the actual diff;
- check scope compliance;
- check error handling;
- run the relevant tests;
- verify no secrets or live-network dependencies entered unit tests;
- verify no protected interface was changed;
- either accept, revise, or revert the work.

When routing is unclear, keep the task on Sol.

---

## Development behavior

- Read `CODEX_IMPLEMENTATION_BRIEF.md` before editing.
- Inspect the existing repository and `git status`.
- Preserve unrelated code and user changes.
- Do not use destructive Git commands.
- Work phase by phase.
- Maintain `docs/implementation-status.md`.
- Prefer a working vertical slice over broad incomplete scaffolding.
- Stop and surface a concrete issue when an unresolved security or contract choice blocks correctness.
- Do not pretend Seal or Nautilus is implemented.
- Never add Nautilus or TEE code in this MVD.
- Never scrape full Google News article pages.
- Never execute workflow-supplied code.
- Never expose DEKs, executor private keys, or decrypted bundles to the browser.
- Test the 24-hour RSS cutoff with a frozen clock.
- Use Testnet only.
- Run `/status` at session start and confirm the active parent model is Sol High.
