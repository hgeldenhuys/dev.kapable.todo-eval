# Todo-Eval: Kapable Platform Eval Rubric

**App:** todo-eval.kapable.run
**Date:** 2026-03-05 (retest after k8way fixes)
**Method:** Single KAIT session (Sonnet), single natural-language prompt, browser-verified

---

## Scoring Legend

| Score | Meaning |
|-------|---------|
| 3 | Full pass — feature works correctly end-to-end |
| 2 | Partial — works with workarounds or minor issues |
| 1 | Attempted — feature exists but broken or incomplete |
| 0 | Not tested / not applicable |

---

## 1. Platform Features Exercised

| # | Feature | Score | Evidence / Notes |
|---|---------|-------|------------------|
| 1.1 | **Dynamic Data API — Create** | 3 | POST /v1/todos works, including tags (jsonb) and priority fields |
| 1.2 | **Dynamic Data API — Read** | 3 | GET /v1/todos with order_by/order query params works |
| 1.3 | **Dynamic Data API — Update** | 3 | PATCH /v1/todos/:id toggles completed status |
| 1.4 | **Dynamic Data API — Delete** | 3 | DELETE /v1/todos/:id removes todo |
| 1.5 | **Real-time SSE** | 1 | **Retest:** SSE never connects — 0 bytes received through proxy chain (Caddy → kapable-proxy → BFF → API). Browser shows "Disconnected (reconnecting...)" permanently. The BFF `fetch()` to upstream SSE hangs, never returning headers to the client. Not a k8way issue — it's the BFF-to-API SSE proxy that's broken. |
| 1.6 | **Serverless Functions** | 2 | count-incomplete endpoint works via API proxy (not actual WASM function — uses filter query). Proves the pattern but not the runtime. |
| 1.7 | **Auth (API Key)** | 3 | Bearer token auth via KAPABLE_API_KEY env var, proxied through BFF |
| 1.8 | **Connect App Deploy** | 3 | Deployed via pipeline, running at todo-eval.kapable.run |
| 1.9 | **Schema (table creation)** | 2 | Table created via Dynamic Data API auto-create. Required manual ALTER TABLE for tags jsonb column — platform doesn't auto-alter on new fields. |
| 1.10 | **Git Push from KAIT** | 3 | KAIT session committed and pushed to GitHub (after fixing GitHub App access) |

**Platform Features Score: 26 / 30**

---

## 2. KAIT Session Quality

| # | Dimension | Score | Notes |
|---|-----------|-------|-------|
| 2.1 | **Session creation speed** | 3 | ~5s (clone + container + CLI startup) — excellent |
| 2.2 | **Single-prompt completeness** | 3 | One prompt produced 5 features: tags, filters, count-incomplete, animations, progress bar |
| 2.3 | **Code correctness** | 2 | Template literal escaping bug (`\'` → needed `\\'`). Required manual fix. |
| 2.4 | **Git operations** | 3 | Read, edit, commit, push — all worked after GitHub App fix |
| 2.5 | **Cost efficiency** | 3 | $0.15 for full session (6 turns, 565 tokens). Previous session was $0.76 for 5 features. |
| 2.6 | **Tool usage** | 3 | Appropriate use of Read, Edit, Bash (git commands) |
| 2.7 | **Error recovery** | 1 | Original session's push failure was not self-diagnosed. No retry or alternative suggested. |

**KAIT Score: 18 / 21**

---

## 3. App Functionality (What KAIT Built)

| # | Feature | Score | Notes |
|---|---------|-------|-------|
| 3.1 | **Todo CRUD** | 3 | Add, toggle, delete all work |
| 3.2 | **Priority levels** | 3 | High/Medium/Low with color-coded badges |
| 3.3 | **Tags** | 3 | Comma-separated input, rendered as pills |
| 3.4 | **Priority filter** | 3 | All/High/Med/Low buttons, client-side filtering |
| 3.5 | **Status filter** | 3 | All/Active/Completed buttons |
| 3.6 | **Progress bar** | 3 | Green bar showing % complete |
| 3.7 | **Count Incomplete** | 2 | **Retest:** Returns 7 instead of 6 — `filter=completed.eq.false` silently ignored. Platform filter bug on dynamic tables confirmed with CLI test. |
| 3.8 | **Animations** | 3 | Slide-in on add, slide-out on delete |
| 3.9 | **SSE event log** | 1 | **Retest:** Event log exists with correct markup but never fires — SSE connection broken means 0 events delivered. Added a todo and it only appeared after manual page refresh. |
| 3.10 | **Responsive design** | 3 | Mobile breakpoint, flex-wrap, dark theme |

**App Score: 27 / 30**

---

## 4. Platform Bugs Discovered

| # | Bug | Severity | IMP |
|---|-----|----------|-----|
| 4.1 | GitHub App "selected repos" doesn't auto-include new repos for KAIT push | Medium | IMP-795 |
| 4.2 | SSE completely broken through proxy chain — 0 bytes delivered, BFF fetch hangs | **High** | Needs IMP |
| 4.3 | Dynamic Data API doesn't auto-alter table when POST includes new columns | Medium | Needs IMP |
| 4.4 | `filter=completed.eq.false` returns wrong count on typed tables | Medium | Needs IMP |
| 4.5 | Template literal escaping (`\'`) in Bun output — KAIT system prompt should warn | Low | Documented in kait-architecture.md |
| 4.6 | Enter key in KAIT UI sends message instead of newline | Low | Needs IMP |
| 4.7 | OAuth login redirects to /dashboard instead of original URL | Medium | IMP-794 |
| 4.8 | KAIT repo selector doesn't refresh after GitHub App changes | Low | IMP-796 |

**Bugs found: 8** (1 high, 3 medium, 4 low) — good signal for platform hardening.

---

## 5. Process Metrics

| Metric | Value |
|--------|-------|
| Total KAIT sessions | 2 (feature build + git push test) |
| Total KAIT cost | ~$0.30 |
| Manual fixes needed | 3 (escaping, query params, ALTER TABLE) |
| Commits | 5 (KAIT features, escaping fix, query param fix, KAIT push test, cleanup) |
| Time to first working deploy | ~30 min (including debugging) |
| Lines of code | 633 (single-file app) |
| Platform features exercised | 10 |

---

## Overall Score

| Category | Score | Max | Percentage |
|----------|-------|-----|------------|
| Platform Features | 26 | 30 | 87% |
| KAIT Session Quality | 18 | 21 | 86% |
| App Functionality | 27 | 30 | 90% |
| **Total** | **71** | **81** | **88%** |

### Grade: B+

**Summary (retest 2026-03-05):** The Kapable platform supports building and deploying a feature-rich todo app from a single KAIT session. Dynamic Data API CRUD, auth, filters, and Connect App pipeline all work well. **Two critical gaps remain:**

1. **SSE is fully broken through the proxy chain** — the BFF's fetch-and-stream pattern never delivers data to the browser (0 bytes received, permanent "Disconnected"). This means new items don't appear until manual page refresh. The k8way fixes did not address this — the issue is in the BFF→API SSE proxy, not k8way.

2. **API filters are silently ignored** — `filter=completed.eq.false` returns all rows, making count-incomplete report 7 instead of 6. This is a platform-level Dynamic Data API bug.

KAIT's code generation quality remains high — one prompt produced 5 features at $0.15. GitHub App push is now fixed (IMP-795 resolved).

### Recipe for Reproducing

1. Create repo with `package.json` (bun-server), `kapable.yaml` (framework: bun-server), `tsconfig.json`, `src/index.ts` (minimal Bun.serve)
2. Register as Connect App in Kapable Console, get app ID
3. Set env vars: `KAPABLE_API_URL`, `KAPABLE_API_KEY`, `KAPABLE_PROJECT_ID`
4. Add repo to `kapable-develop` GitHub App installation
5. Create KAIT session pointing at repo
6. Single prompt: "Build a todo app with [features] using the Dynamic Data API at /v1/todos"
7. KAIT builds, commits, pushes
8. Deploy via pipeline: `POST /v1/apps/{id}/environments/production/deploy`
9. Verify at `{slug}.kapable.run`
