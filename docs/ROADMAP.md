# Current Roadmap

Electron frontend + Rust judge backend

---

## How to use this roadmap
- Pick one milestone/feature at a time.
- Each milestone has a short description, acceptance criteria, rough complexity, and dependencies.
- After a milestone is implemented, add small tests or a smoke-run so the project remains green.

---

## Milestone 0 — Repo health & developer UX

- Create `README.md` (minimal) with build/run steps for Windows.
- Add scripts to `electron/package.json` for `dev` (already present) and a `start:prod` helper.
- Ensure Rust backend builds with `cargo build` and the electron main looks for the debug exe (already present).

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

Dependencies: IPC path for judge RPC (either spawn `dsa-judge --stdio` from main or reuse existing backend process). Backend already has `--stdio` mode.

---

## Milestone 3 — Wire judge IPC & standardize protocol (Backend + Electron)

Tasks:
- Use the existing `--stdio` mode in `rust-backend` to accept JSON RPC lines.
- Add IPC methods in `preload.cjs` and `main.ts` to send JSON requests and receive responses (id-based), with timeouts and error handling.
- Implement `judge:run` and `judge:envCheck` handlers.

Acceptance:
- From the Electron renderer, you can call `window.api.judgeRun(request)` and receive a parsed `JudgeResponse` JSON.

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
