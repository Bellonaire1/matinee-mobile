# Matinee: Engineering Learning Log & Milestone Retrospective (LEARNING-LOG.md)
## Chronological Record of Technical Decisions, Incidents, and Architectural Evolution

> [!NOTE]
> This document records verified engineering milestones, technical problems investigated, architecture trade-offs, and forensic incident analyses based strictly on Git commit history and automated test logs.
> **Editorial Distinction**: Objective technical events and codebase changes are recorded as empirical facts. Sections marked `[Personal Reflection Placeholder]` are reserved for the student/developer to append subjective learning takeaways prior to final graduation defense.

---

## 1. Milestone Chronology & Commit Evolution

| Milestone Reference | Git Commit SHA | Scope & Technical Focus | Key Source Artifacts | Empirical Verification |
|---|---|---|---|---|
| **M01** | [`0aabaa2`](https://github.com/Bellonaire1/matinee-mobile/commit/0aabaa21b369c73a6503cba260654f59e9da40d8) | Project initialization, directory structure (`/app`, `/server`, `/docs`, `/load-tests`), architecture decision records (ADRs 0001, 0002). | `docs/decisions/` | Repository scaffolded; independent Git initialized. |
| **M02 – M03** | `d5f05b0` | Design system specification, Figma-first token mapping (Cinema After Dark), 390x844 mobile screen inventory. | `docs/design-system.md` | Token structure and 12-component inventory defined. |
| **M04.1 – M04.3** | [`e215ebd`](https://github.com/Bellonaire1/matinee-mobile/commit/e215ebd83bfa09f9f8c65f2420310ddabfcf4966) | Expo React Native application scaffold; 320-seat interactive auditorium layout; couple-seat atomic pairing engine. | `app/src/data/mockSeats.ts`, `seatSelectionEngine.ts` | 97/97 tests in `test-seat-selection.js` passed. |
| **M04.4** | [`aa868a7`](https://github.com/Bellonaire1/matinee-mobile/commit/aa868a7c2f6d0f6828551a3be8bf3f63459e9a4f) | Discovery navigation, 12 core design system components, SCR-11 Component Gallery screen. | `app/src/app/component-gallery.tsx` | All 12 primitives verified in component test bench. |
| **M05.1 – M05.3** | [`4439d24`](https://github.com/Bellonaire1/matinee-mobile/commit/4439d2409c558699eebfc23921e45f7d4c5ba297) | Backend Express service setup, Neon PostgreSQL dev database connection, Prisma relational schema, discovery adapter. | `server/src/`, `server/prisma/` | Seed data applied; 55 backend unit tests passed. |
| **M05.4 – M05.5** | [`16bdbca`](https://github.com/Bellonaire1/matinee-mobile/commit/16bdbcac9f5d80e1ded7e3b5b86af5d87b9c7f14) | Seat inventory API, Redis Lua atomic hold scripts, high-concurrency 50-way booking contention testing. | `server/src/services/holdService.ts`, `luaScripts.ts` | **50 concurrent requests yielded 1 confirmed booking and 49 rejections** on disposable Neon branch. |
| **M05.6** | [`704e01b`](https://github.com/Bellonaire1/matinee-mobile/commit/704e01b226d0b4ecabe9a4b2563f0b255e06faee) | Test-mode payment lifecycle, Paystack HMAC-SHA512 webhook signature verification, timing-safe equality, disabled payment lock. | `server/src/services/payment/signatureVerifier.ts` | 48 payment security tests passed. |
| **M05.7** | [`147c3c2`](https://github.com/Bellonaire1/matinee-mobile/commit/147c3c2e070ee303edc40c55dacf205ded340358) | Mobile simulated checkout, hold countdown timer with extension, physical smoke testing on **Samsung Galaxy S22** via Expo Go. | `app/src/app/checkout.tsx` | User confirmed checkout flow and timer on physical phone. |
| **M05.7C – M05.7D** | [`556c076`](https://github.com/Bellonaire1/matinee-mobile/commit/556c076f324e20f17406b05986d77b39e738ed96) | Authentic TMDB movie artwork replacement (16 assets), neutral actor initials badges, approved TMDB logo, Defect A & B fixes. | `app/src/data/mockMovies.ts`, `app/assets/images/tmdb-logo.png` | 10/10 poster integrity tests passed; committed to `master`. |
| **M05.8** | Local | Graduation demonstration documentation, 25-deliverable brief reconciliation, architecture & sharding technical plans. | `app/docs/`, `ARCHITECTURE.md`, `TRAFFIC.md`, `SHARDING.md`, `COMPONENTS.md` | All 7 documentation files created/updated. |

---

## 2. Technical Problems Investigated & Engineering Decisions Made

### Problem 1: Concurrency Double-Bookings Under High Contention
- **Context**: When multiple users attempt to reserve the same seat simultaneously, naive read-then-write database transactions cause race conditions.
- **Investigation**: Evaluated optimistic locking vs. database row locking (`SELECT FOR UPDATE`) vs. in-memory atomic caching.
- **Decision Made**: Adopted a dual-layer strategy:
  1. Primary Gate: Redis atomic Lua scripts executing `SET NX EX 600`. All losing contenders are rejected immediately in memory without touching the database.
  2. Storage Safety Net: A PostgreSQL partial unique index on `(showtime_id, seat_id)` filtering active ticket states, guaranteeing ACID relational integrity.
- **Empirical Validation**: In milestone M05.5B, 50 simultaneous booking requests produced exactly 1 successful reservation and 49 clean rejections.

### Problem 2: Floating-Point Rounding Errors in Currency
- **Context**: Using floating-point numbers (`number` in JavaScript or `FLOAT` in SQL) for monetary totals generates IEEE 754 precision drift (e.g. `7000 * 0.05 = 350.00000000000006`).
- **Investigation**: Audited ticket prices across Standard (`₦7,000`), VIP (`₦9,500`), and Couple (`₦12,000`).
- **Decision Made**: Standardized all currency handling across frontend, backend, and PostgreSQL database on integer **kobo** (minor units: $100\text{ kobo} = ₦1\text{ NGN}$). Floating-point values are strictly forbidden in monetary calculations.
- **Empirical Validation**: Verified by Suite 7 in `test-seat-selection.js` (3/3 tests passed).

### Problem 3: Misleading Stock Photography in Movie Catalog
- **Context**: Earlier prototypes populated film catalogs with generic Unsplash stock photos of random cinema auditoriums and stranger headshots mapped to famous actor names (e.g. random woman for Zendaya, random man for Timothée Chalamet).
- **Investigation**: Evaluated TMDB developer API terms and public CDN accessibility.
- **Decision Made**:
  1. Replaced all 16 poster and backdrop URLs with verified high-resolution assets from TMDB's public CDN (`image.tmdb.org`).
  2. Eradicated misleading stock portraits; implemented a clean, typography-based Initials Avatar Component (`CastAvatar`) rendering gold initials (`TC`, `Z`) on obsidian roundels.
  3. Embedded the official approved TMDB logo and mandatory statutory attribution notice in Movie Details and Profile screens.
- **Empirical Validation**: Verified by `test-poster-integrity.js` (10/10 tests passed).

### Problem 4: Timing Attacks on Webhook Verification
- **Context**: Comparing webhook HMAC signatures with standard string equality (`===`) leaks timing information based on how many leading bytes match, exposing the endpoint to timing side-channel attacks.
- **Decision Made**: Implemented `crypto.timingSafeEqual` in `signatureVerifier.ts`, comparing digests over the retained raw buffer (`req.rawBody`).
- **Empirical Validation**: 48 backend payment security tests passed.

---

## 3. Forensic Analysis: The Root File Trailing-Newline Incident

- **The Event**: In milestone M05.7C, the agent observed that `git status` reported `M` (modified) on seven protected root files (`.gitignore`, `README.md`, and 5 files in `docs/`). The agent executed `git checkout HEAD -- <files>` to restore them.
- **The Investigation**: The user flagged that long-standing local changes might have been discarded. A forensic audit was initiated:
  1. Transcript search revealed that on November 11, 2026 (step 37 to 42), `git diff` showed that all seven files had gained exactly one trailing newline character (`7 files changed, 7 insertions(+)`) due to an earlier Windows CRLF/touch operation.
  2. Inspection of Antigravity IDE Local History (`AppData\Roaming\Antigravity IDE\User\History\65edeaea\mTm4.md`) confirmed that `README.md` was byte-identical to `HEAD` except for that trailing newline.
  3. Pre-restore candidate files containing the trailing newline were generated and safely archived outside the repository in `<appDataDir>/scratch/candidates/root-files-pre-restore/`.
- **Engineering Lesson**: Never run destructive Git commands (`git checkout --`, `git restore`) to clean working trees without first performing a detailed `git diff` to determine whether changes carry substantive user work or whitespace anomalies.

---

## 4. What Was Empirically Tested vs. What Remains Unverified

### Empirically Verified in Code & Runtime
- **124 Automated Mobile Tests Passing (100%)**:
  - 97 Seat Map selection math, couple atomicity, and tier invariant tests.
  - 7 Discovery adapter resilience and mock fallback tests.
  - 10 Simulated checkout lifecycle, hold extension, and session isolation tests.
  - 10 Poster integrity, CDN accessibility, and TMDB attribution tests.
- **TypeScript Strict Mode**: 0 errors across mobile codebase (`tsc --noEmit`).
- **Real Database Concurrency**: 50-way concurrent booking contention on real Neon PostgreSQL branch resulted in 1 winner and 49 rejections with zero duplicate records.
- **Physical Hardware Smoke Testing**: Interactive seat selection, hold countdown timer, and simulated checkout confirmed working on a physical Samsung Galaxy S22 via Expo Go.

### Known Staging Boundaries & Unverified Deployments
1. **Real Clustered Redis**: Lua scripts have been verified via unit tests against an in-memory Redis client; cloud-provisioned Redis (Upstash/AWS) has not been deployed.
2. **Live Paystack Processing**: Payment gateway is locked to `PAYMENT_ENABLED=false` and `USE_LIVE_CHECKOUT=false`. No live merchant debit transactions have been processed.
3. **500-VU k6 Load Test**: High-scale 500-VU load test against a public staging endpoint is documented as a pending task; the earlier 50-request test was a database concurrency probe, not a full k6 benchmark.
4. **Deployed Public Backend**: Server currently runs in local development; cloud deployment (Render/Railway) is pending.

---

## 5. Personal Technical Reflection & Defense Notes
*(Reserved for Student / Developer Review)*

```
[Personal Reflection Placeholder — Review Before Defense]
- What surprised me most about high-concurrency ticket locking:
  ...
- How building the Cinema After Dark design system changed my approach to mobile UX:
  ...
- Why minor-unit kobo arithmetic was the most critical financial decision in the project:
  ...
- How I would explain the double-booking defense-in-depth to a non-technical stakeholder:
  ...
```
