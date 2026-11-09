# Merchant Portal — Senior Frontend Take-Home (Angular)

A merchant-onboarding portal where **Sales** create applications through a multi-step wizard with auto-saved drafts, **Reviewers** record risk decisions, and **Admins** see everything and assign reviewers. Sensitive banking fields are masked by default with audited, role-based reveal.

| | |
|---|---|
| Framework | Angular 22 (standalone, zoneless, `@if` / `@for` / `@switch` / `@let`) |
| State | Signals (`signal`, `computed`, `linkedSignal`, `input`, `output`) + RxJS for async flows |
| Forms | Typed Reactive Forms, sync / async / cross-field validators, debounced auto-save |
| UI | Bootstrap 5 (Sass), responsive SCSS, keyboard + screen-reader friendly |
| Routing | Lazy `loadComponent` / `loadChildren`, `canActivate`, `canMatch` role guards, `canDeactivate` |
| HTTP | Functional interceptors: bearer + **single-flight refresh**, in-browser mock API |
| Tests | Vitest + Angular TestBed — **60 tests, 10 files** |

---

## Quick start

```bash
npm ci
npm start          # http://localhost:4200
npm test           # Vitest, single run
npm run build      # production build (with auto-generated CSP)
```

No backend needed: an in-browser mock API (`src/app/core/mock`) serves every `/api` call. Pick a demo persona on the login screen — there are **no passwords or credentials anywhere in the repo**.

| Persona | Role | What to try |
|---|---|---|
| Sita Sales / Sam Sales | SALES | Create an application, watch auto-save, submit. Sam can't open Sita's applications. |
| Riya Reviewer / Ravi Reviewer | REVIEWER | Open an assigned application, reveal account number, approve / reject / request info. |
| Asha Admin | ADMIN | See all applications, assign reviewers, reveal sensitive data. |

### Dev toolbar (top of every page)
- **Expire token + fire 3 parallel requests** — invalidates the access token server-side, then fires 3 requests at once. The toolbar shows `3 requests got 401 → 1 refresh call → all 3 replayed OK`.
- **Simulate flaky API** — 30% of list and draft-save calls return 503. Use it to see dashboard error/retry and auto-save backoff/recovery.

---

## Architecture

```
src/app
├── core/                       # app-wide, no UI
│   ├── auth/
│   │   ├── auth.service.ts     # session, memory-only access token, single-flight refresh()
│   │   ├── auth.interceptor.ts # bearer + 401 → refresh once → replay
│   │   ├── guards.ts           # authGuard, guestGuard, roleGuard (canMatch)
│   │   └── permissions.ts      # ONE permission matrix, used by UI *and* mock API
│   ├── api/applications.api.ts # typed HTTP client
│   ├── mock/                   # mock server (pure TS) + interceptor that serves it
│   └── models/
├── shared/
│   ├── ui/                     # StatusBadge, MaskedValue, Pagination, FieldError
│   └── util/                   # loadState() operator, error messages
├── layout/                     # Shell (nav), DevToolbar
└── features/
    ├── auth/login.page.ts
    └── applications/           # lazy-loaded feature
        ├── dashboard/          # A. server-side table
        ├── wizard/             # B. + C. multi-step form, auto-save
        └── detail/             # D. + F. sections, risk history, review, reveal
```

### Key decisions

**One permission matrix (`core/auth/permissions.ts`).** `canView / canEdit / canReview / canAssign / canReveal` are pure functions. Components use them to show/hide controls; the mock API calls the *same* functions to enforce access. Hiding a button is never the only defence — e.g. a SALES user who forges a `POST /review` gets a 403, and someone else's application returns **404** (not 403) so IDs can't be probed.

**URL is the source of truth for dashboard filters.** `page`, `pageSize`, `status`, `search` live in query params → shareable links, reload-safe, back button works. Params are sanitised (`parseQuery`) because URLs are user input.

**`loadState()` operator.** `combineLatest([query$, retry$]) → switchMap(fetch) → scan` produces `{ loading, data, error }`. `switchMap` cancels stale requests when filters change; errors are caught *per request* so the stream survives and **Retry** works; previous data stays on screen while reloading (no table flash).

**Signals for view state, RxJS for async.** Signals hold what the template reads. RxJS handles time and concurrency (debounce, retry with backoff, cancellation, queueing) and is bridged with `toSignal` / `toObservable`.

---

## Requirement walkthrough

### HTTP interceptor — single refresh for concurrent 401s
`auth.interceptor.ts` + `AuthService.refresh()`

1. Adds `Authorization: Bearer …` only to calls to our API base URL — never to third-party hosts.
2. On a 401, calls `auth.refresh()`. That method stores the in-flight request as a shared observable (`shareReplay`), so **every concurrent 401 subscribes to the same `POST /auth/refresh`**. It is cleared in `finalize`.
3. Each failed request is replayed **once** with the new token, marked with an `HttpContextToken` so it can never loop.
4. **Race handled:** if a slow request was sent with an old token and its 401 arrives *after* another refresh already finished, it's replayed with the current token — no second refresh.
5. Refresh failure, or a replay that 401s again → logout with "session expired".
6. Refresh tokens are **rotated** by the server (single use); replaying an old one fails.

Tests: `auth.interceptor.spec.ts` (3 concurrent 401s → exactly 1 refresh → 3 replays, stale-token race, refresh failure, no-loop, non-401 passthrough).

### A. Dashboard
Server-side pagination, search (debounced 300 ms), status filter, page size, status counts as quick filters (optional enhancement), skeleton on first load, progress bar on reload, error banner with Retry, empty states. Columns adapt to role (owner column for Admin, no reviewer column for Reviewers) and to screen width. Row actions: **Edit** only when `canEdit`, otherwise **Open**.

### B. Multi-step wizard
Five steps: Business → Contact → Processing → Banking → Review. One `FormGroup` per step, so each step validates on its own.

| Validation | Example |
|---|---|
| Built-in | required, email, maxLength, min, requiredTrue |
| Custom sync (named errors) | E.164 phone, https-only URL, SWIFT/BIC, registration format |
| Cross-field (group) | postal code format depends on country; max ticket ≥ average; average ≤ monthly volume. The error is mirrored onto the right child control so the message shows next to the field. |
| Async | registration number uniqueness (debounced inside the validator; fails *open* on network error because the server re-validates) |
| Conditional | reviewer note required only for Reject / Request info |
| Server | 422 field errors from submit are mapped back to controls and the wizard jumps to the first bad step |

**Next** marks the step touched, focuses the first invalid field, and waits for pending async validators instead of skipping them. Completed steps are clickable in the stepper.

### C. Draft & auto-save — `wizard/auto-save.ts`
```
valueChanges ─ debounce(1.5s) ─┐
Retry / saveNow() ─────────────┼─▶ concatMap(save latest snapshot) ─ retry(backoff, transient only) ─ catchError
runExclusive(submit) ──────────┘
```
- **`concatMap`, not `switchMap`:** saves never overlap or arrive out of order. Cancelling an HTTP request doesn't cancel it on the server, so `switchMap` could race two writes.
- **Snapshot read at save time** + identical snapshots skipped → a burst of triggers becomes one request.
- First save `POST`s (creates the draft, URL becomes `/applications/:id/edit` via `replaceState`); later saves `PUT`. Serial execution guarantees no double-create.
- **Retries** 2× with exponential backoff, only for transient errors (network, 408, 429, 5xx) — not 4xx.
- **Errors never touch form state.** Status shows "Couldn't save · Retry now"; the next edit also retries.
- **Submit runs through `runExclusive`**, so it waits behind any in-flight auto-save.
- Status is honest: if you keep typing while a save is in flight, it shows *Unsaved changes*, not *Saved*.
- **Local backup** of *non-sensitive* fields in `localStorage` survives a crash / closed tab; on return you're offered Restore / Discard.
- `canDeactivate` guard warns before leaving with pending, in-flight, or failed saves.

### D. Detail & review
Sectioned view (Business, Contact, Processing, Banking, People, Risk history timeline). Review panel and assignment panel are **not rendered at all** unless `canReview` / `canAssign` is true (SALES never gets them in the DOM). The decision response updates the page in place via `linkedSignal` — no refetch.

### F. Sensitive information
- The API **never returns** account number or tax ID in clear text from read endpoints — only `•••• 1234`. Secrets are stored apart from the rest of the record so they can't leak through a generic serializer.
- **Reveal** (`MaskedValue`) calls `POST /applications/:id/reveal`. The server re-checks role + visibility and writes a **REVEAL audit event** to the risk history. The clear value lives only in that component's memory and **re-masks after 30 s**, on Hide, or when you navigate away.
- In the wizard, sensitive inputs are `type="password"`, `autocomplete="off"`. Auto-save only sends them once they're **complete and valid** (no half-typed account numbers). When a value is already on file, the input starts empty with "On file: •••• 1234 — leave blank to keep".
- **Access token is memory-only** (never in storage). The refresh token sits in `sessionStorage` *only because the mock API has no cookie jar* — in production it would be an `httpOnly; Secure; SameSite=Strict` cookie that JavaScript can't read.
- `returnUrl` after login only accepts internal paths (blocks open redirects). Merchant-supplied website URLs are shown as text, not links.

### Content Security Policy (CSP)

**What it protects against.** CSP is an HTTP header that tells the browser which sources of script, style, images, etc. are allowed. If an attacker manages to inject markup (stored XSS in a merchant name, a compromised dependency injecting a `<script>`), the browser refuses to run it. For a portal that can reveal bank details, it's the second line of defence after Angular's template sanitisation.

**What this project does.**
1. **Angular's built-in protections:** interpolation is auto-escaped; there is **no** `innerHTML`, no `bypassSecurityTrust*`, no `eval`, and no inline event handlers.
2. **`security.autoCsp: true`** in the production build (`angular.json`). Angular hashes its own bootstrap script and injects a strict, hash-based policy:
   ```
   script-src 'strict-dynamic' 'sha256-…' https: 'unsafe-inline'; object-src 'none'; base-uri 'self';
   ```
   With `'strict-dynamic'` + hashes, modern browsers **ignore** `https:` and `'unsafe-inline'` (they're only fallbacks for very old browsers). Only the hashed bootstrap script and scripts it loads can run.
3. **No inline `style=""` attributes** in templates (they were removed on purpose), so styles can be locked down too.

**Recommended production header** (set by the server/CDN, which is stronger than a `<meta>` tag and adds directives a meta tag can't):
```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'strict-dynamic' 'sha256-<from build>';
  style-src 'self' 'nonce-<per-request>';   # Angular sets component styles with ngCspNonce
  img-src 'self' data:;
  connect-src 'self' https://api.example.com;
  font-src 'self';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';                   # clickjacking (meta tags can't do this)
  upgrade-insecure-requests;
  report-to csp-endpoint;
```
Plus `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: strict-origin-when-cross-origin`. Roll out with `Content-Security-Policy-Report-Only` first, watch reports, then enforce.

---

## Accessibility & responsive
Skip link; landmarks (`nav`, `main`, `aside`); every input has a `<label>`, `aria-describedby` to its error/help text, and errors use `role="alert"`; `aria-live` for save status, result counts, step changes and reveals; focus moves to the step heading on step change and to the first invalid field on failed Next/Submit; `aria-current` on stepper and pagination; visible `:focus-visible` rings; `prefers-reduced-motion` respected. Layout tested at 390 px (no horizontal scroll — table columns collapse by breakpoint) and 1280 px.

## Tests (Vitest + TestBed)

| File | Covers |
|---|---|
| `core/auth/auth.interceptor.spec.ts` | bearer only on API, **3 concurrent 401 → 1 refresh**, stale-token race, refresh failure → logout, no infinite loop, token never in storage |
| `core/auth/permissions.spec.ts` | full role × status matrix |
| `core/auth/guards.spec.ts` | role guard redirect, auth guard returnUrl |
| `core/mock/mock-server.spec.ts` | **server-side** authz (404 for others' apps, 403 for review/reveal), token expiry + rotation, secrets never in read responses, full Sales → Admin → Reviewer workflow, reveal audit, 422 validation |
| `wizard/auto-save.spec.ts` | debounce, no-op skip, backoff retry, error keeps state + recovers, no retry on 4xx, ordering (no overlap), honest status, `runExclusive` |
| `wizard/validators.spec.ts` | https URL, cross-field postal/ticket rules, async uniqueness (debounce, fail-open) |
| `wizard/wizard.page.spec.ts` | Next blocked + errors rendered, advances when valid; sensitive fields only sent when valid; backup excludes secrets |
| `dashboard/dashboard.page.spec.ts` | role-aware controls, error → Retry, empty state, URL param sanitising |
| `detail/detail.page.spec.ts` | review/assign/reveal visibility per role, risk history |
| `shared/ui/masked-value.spec.ts` | masked by default, no reveal without permission, reveal → auto re-mask, Hide |

## Trade-offs & what I'd do next
- **Mock API in the browser** keeps the repo zero-setup and lets the *real* auth interceptor run against realistic 401s. It persists its fake database to `sessionStorage` so reloads behave like a real backend; that storage stands in for a server DB. Next step: move it to a tiny Node/Express server (same `MockServer` class) to show real CSP / cookie headers.
- **Optimistic concurrency:** detail has a `version`; I'd send `If-Match` on save/review to catch two people editing at once.
- **Real-time (optional, skipped):** Socket.IO `status-changed` events would feed a `Subject` merged into the dashboard's `retry$`, so the list refreshes without polling.
- **E2E:** Playwright for the full Sales → Admin → Reviewer journey (I ran this flow manually with a Playwright script while building; it isn't committed as a suite).
- Bootstrap is imported whole (~23 kB gzipped CSS); importing only the used partials would trim it.

## Data
All data is synthetic: invented names, `.test` / `.example` domains, generated digit strings for account and tax numbers. No real people, customers, or card data.

## AI assistance disclosure
I used an AI coding assistant (Claude) to help scaffold and draft parts of this project. I reviewed and understand every file, and verified the result by:
- running `npm test` (60 passing) and `npm run build` (production build with CSP),
- walking through every role in the browser, including the dev-toolbar 401 burst and flaky-API mode,
- running a Playwright script over the full flow at desktop and mobile widths with zero console errors.
