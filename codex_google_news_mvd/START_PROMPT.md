# Codex Development Start Prompt

Read `CODEX_IMPLEMENTATION_BRIEF.md` and `AGENTS.md` in full before changing files.

Act as the Sol High technical owner. Confirm the active model and reasoning level with `/status`. Then:

1. Inspect the current repository, dependency files, branch, and `git status`.
2. Compare the repository with the target MVD and preserve useful existing code.
3. Create or update `docs/implementation-status.md` with Phase 1–7 checkboxes.
4. Propose the minimum Phase 1 change set.
5. Keep architecture, Move invariants, crypto formats, and security boundaries on the parent.
6. Delegate the deterministic Google News RSS parser, normalizer, deduper, and 24-hour fixture tests to the appropriate Luna agents after freezing their interfaces.
7. Wait for delegated work, inspect every diff, run tests yourself, and correct any scope drift.
8. Complete only Phase 1 first: repository/shared schemas plus a fully offline-tested `google_news_rss/v1` workflow core.
9. Do not implement Nautilus, TEE, arbitrary workflow execution, full article crawling, Fork, royalties, or a seller UI.
10. At the end, report the phase using the completion-report format in the brief and identify the exact next command or decision for Phase 2.

Do not claim completion based on scaffolding. Phase 1 ends only when strict typechecking and all deterministic RSS tests pass.
