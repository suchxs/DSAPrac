# Current Roadmap

Electron frontend + Rust judge backend

---

## How to use this roadmap
- Pick one milestone/feature at a time.
- Each milestone has a short description, acceptance criteria, rough complexity, and dependencies.
- After a milestone is implemented, add small tests or a smoke-run so the project remains green.

---


## Milestone 1 — Basic Exam Mode (Frontend only)
Why: Secure/controlled exam UX should be in place early.

What to implement:
- Add `exam.html` (new static page) and wire `open-exam` to load it.
- When entering exam mode: switch window to fullscreen, remove close controls (where possible), and start a timer if provided.
- Detect focus/visibility loss (window blur / document.visibilitychange) and cancel exam (show failure modal) when user tabs out.
- Add a simple confirmation and 'Start Exam' button before switching to locked fullscreen.

Acceptance criteria:
- Exam button on main menu launches `exam.html` in fullscreen.
- Tabbing out triggers a cancel flow and returns to menu.
- Exam can be started and cancelled with UI.


---

## Milestone 2 — Add Monaco Editor + Run/Submit flow (Frontend)

What to implement:
- Add `editor.html` and bundle Monaco via CDN for dev (or locally later).
- Provide theme toggle (dark/light) and language mode (C / C++).
- Add Run / Submit buttons. Run sends code and problem via IPC to the backend.
- Add a Debug Console pane to show compiler output, runtime stdout/stderr, execution time, and per-test results summary.

Acceptance:
- Monaco loads and can edit C code.
- Clicking Run compiles + executes on the Rust judge and shows results in Debug Console.

Implementation notes (coding exam UX):
- Use Monaco Editor as the canonical editor in the app. Include a bundled dark theme and allow the user to switch themes; default to dark for exam/editor pages.
- Configure Monaco for common languages (C, C++, Python, JavaScript). Expose editor settings (tab size, font family, minimap off for exams).
- Provide two primary actions: "Run" (fast, runs visible/sample tests or a single selected test) and "Submit" (full run including hidden tests). Make the "Run" path especially fast by reusing compiled artifacts when possible.
- Add a small settings panel for runtime flags and compiler flags when developers need them.
- UX: stream per-test output to the Debug Console as results arrive (don't wait for all tests to finish).

Dependencies: IPC path for judge RPC (either spawn `dsa-judge --stdio` from main or reuse existing backend process). Backend already has `--stdio` mode.

---

## Milestone 3 — Wire judge IPC & standardize protocol (Backend + Electron)

Tasks:
- Use the existing `--stdio` mode in `rust-backend` to accept JSON RPC lines.
- Add IPC methods in `preload.cjs` and `main.ts` to send JSON requests and receive responses (id-based), with timeouts and error handling.
- Implement `judge:run` and `judge:envCheck` handlers.

Acceptance:
- From the Electron renderer, you can call `window.api.judgeRun(request)` and receive a parsed `JudgeResponse` JSON.

Additional judge integration requirements:
- Support 'run-samples' vs 'submit' modes. 'run-samples' should only execute visible tests and return results quickly; 'submit' executes the full suite including hidden tests.
- Support running a single testcase from the editor ("Check test case") so students get near-instant feedback for that case.
- Ensure the judge protocol supports three basic operations: compile-only, run-only (reuse compiled binary), and compile+run. That lets the frontend request minimal work when the user iterates.
- Stream partial results and logs to the renderer (in JSON events) for immediate UI updates.

---

## Milestone 4 — Question data model & CRUD UI (Frontend + Files)

Tasks:
- Define a JSON schema for problems (id, title, description, difficulty, tags, time_limit, memory_limit, test_cases[]).
- Implement a lightweight question-creator UI (`creator.html`) to add problems and testcases; save as JSON files under `questions/` (organized into folders already present).
- Implement listing of practical problems in Practice page and ability to mark complete (calls existing `progress:setPracticalDone`).
- Support tagging and filtering by tags.

Acceptance:
- Add/edit/delete problems via UI and they persist to `questions/` folder.
- Problems appear in Practice -> Practical listing.

Theoretical questions (file-first approach + optional SQLite index):
- Store each theoretical question as a Markdown file with YAML frontmatter for metadata. Example path: `content/theory/section-3/adt-priority-queue.md`.
- Frontmatter fields: id, title, tags, difficulty, created_at, updated_at, answered, total, srs (ease, interval, repetitions, due).
- The Markdown body contains the question, optional multiple-choice options, and an explanation/answer section.
- Keep SRS metadata in the frontmatter (so cards remain portable). Build a small background indexer that mirrors essential metadata into a local SQLite DB for fast querying, filtering by tag/section/due, and aggregated stats.
- UI: add a card editor that writes markdown files and validates frontmatter. Also add import/export (zip of markdown files) for sharing decks.

Theory exam (randomized MCQ card session):
- Exam configuration: provide a configuration page where the user selects scope (tags, sections, difficulty), number of questions, and whether to include previously-missed items.
- Session behavior: the app randomizes questions from the selected scope and starts an exam session. Each question is presented as a multiple-choice card with at least 6 choices (realistic distractors should be generated or authored for MCQs).
- Question format: store MCQ choices in the frontmatter or as structured data in the card file (choice text + is_correct flag). Ensure a minimum of 6 choices per MCQ; for cards authored with fewer choices, the editor should require adding distractors or auto-generate plausible distractors when possible.
- Answering & scoring: during the session the user picks one answer per question. At the end of the session, show a score summary (correct count, total, percentage) and optionally per-question feedback (correct answer and explanation).
- Post-session persistence (future SQLite): when SQLite indexing is enabled, store each exam attempt: attempt_id, date, scope, question results (question_id, chosen_choice, correct_boolean, time_taken). This enables tracking performance over time and per-question statistics.
- Cram session suggestions: use stored per-question performance to recommend a cram session consisting of questions the user performed poorly on (wrong answers or low accuracy). The recommendation can be by tag or a quick "Remedial session" option.
- Acceptance: "Start Theory Quiz" launches a randomized MCQ session based on config, enforces >=6 choices per MCQ, scores correctly, and stores attempt data when SQLite indexing is enabled.


---

## Milestone 5 — Autosave / Drafts / Local backups (Frontend)

Tasks:
- Autosave Monaco buffer every 5–10s to `userData/drafts/{problemId}.json`.
- Restore if app restarts.
- Add manual Save / Revert controls.

Acceptance:
- Editor reopens with last autosaved draft for a problem.

---

## Milestone 6 — Result analytics UI (Frontend)
Why: Visualize per-test results, compile time, execution time, memory.

Tasks:
- Render `SubmissionResult` into a readable modal: overall score, per-test pass/fail, stdout/stderr, execution time and compile time.
- Store submissions history in `userData/submissions.json` for future analytics.

Acceptance:
- After Submit, a Result modal shows detailed info; history stores submissions.

---

## Milestone 7 — Exam Mode enforcement (Backend + Frontend improvements)

What to implement:
- Exam locking improvements: Start a watchdog timer in main process; listen for renderer blur events and invalidate exam.
- Optionally integrate a minimal OS-level prevention like disabling DevTools (already disabled by removing menu) and warn on Alt-Tab.

Acceptance:
- If renderer loses focus or devtools opened, exam invalidates and logs the event.


---

## Milestone 8 — Performance & Compilation speedups (Backend)
Why: Fast iteration when pressing Run or Check test case.

What to implement:
- Improve compiler caching (already hashed) — ensure cache eviction policy and reuse with identical flags.
- Consider incremental compilation strategies for interpreted languages later.
- Warm-up the judge process to avoid cold start on each request (use the `--stdio` server mode already implemented).

Acceptance:
- Run/Compile is snappy (e.g., < 1s for trivial programs on modern dev machines). Measured in-house.

Performance tips specific to the app:
- Keep a persistent judge process (`--stdio` server) to avoid spawn/teardown overhead.
- Implement a compiled artifact cache keyed by (language, sources hash, compile-flags) and allow the frontend to request "compile-only" so subsequent runs are instant.
- For single-test checks, only run the test case input against the cached binary; do not recompile or run the full suite whenever possible.
- Order testcases by estimated runtime to surface fast feedback earlier and stream results to the UI.


---

## Milestone 9 — Memory accounting & improved sandboxing (Backend)
Why: Safety and accurate analytics.

Tasks:
- Implement continuous memory sampling during execution and record peak memory usage using `sysinfo` or platform-specific APIs.
- Replace or augment `Sandbox` with a more robust approach (e.g., running in a constrained job object on Windows, or using third-party sandbox tools). Document trade-offs.

Acceptance:
- ExecutionResult.memory_usage shows non-zero and reasonable values; sandbox provides better isolation.


---

## Milestone 10 — Auto-update & What's New modal (Frontend + Build)

Tasks:
- Integrate `electron-updater` or implement a simple GitHub release check.
- Add 'What's new?' modal that shows changelog pulled from repo or release notes.

Acceptance:
- App can check for updates and show changelog; auto-update test works in a controlled environment.

---

## Milestone 11 — Anki-style reviewer for Exam Mode (Frontend)

Tasks:
- After exam, extract questions answered incorrectly and create a scheduled review queue (store in progress/activity or a new `anki/` store).
- Provide a lightweight reviewer UI that shows flashcard-like question prompt and reveals solution + reasoning.

Acceptance:
- Review queue builds automatically from exam results and allows scheduled revisits.

---

## Milestone 12 — Import problems from 450dsa.com (Optional / Research)
Why: Populate question bank.

Notes:
- Confirm legal and terms-of-service constraints before scraping.
- Implement a scraper + transform mapping to local problem JSON format.


---

## Appendix — Implementation order suggestion
1. Milestone 0 (dev DX) — ensure easy local runs.
2. Milestone 1 (Exam Mode frontend) — get secure UX early.
3. Milestone 3 (Judge IPC) — so Run/Submit can be wired reliably.
4. Milestone 2 (Monaco editor) — now hook editor to judge IPC.
5. Milestones 4 & 5 (Question CRUD + Autosave) — content + safety.
6. Milestone 6 (Results UI) — build analytics UI.
7. Milestone 8 & 9 (perf, sandbox) — backend hardening.
8. Milestone 7 (Exam enforcement enhancements) — augment with backend checks.
9. Milestone 10 & 11 (Auto-update, Anki) — polish & learning aids.
10. Milestone 12 — content import if you get permission.

---
