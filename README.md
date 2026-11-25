# Matinee — Cinema Ticket Booking Application

Matinee is an independent cinema ticket booking mobile application engineered for high-concurrency seat selection, real-time ticket holds, and seamless digital ticketing.

---

## Workspace Structure

```
matinee-mobile/
├── app/                  # Mobile application source (Expo / React Native / TypeScript)
├── server/               # Backend API service (Node.js / Express / TypeScript)
├── docs/                 # Product, design, and architecture documentation
│   ├── product-overview.md
│   ├── screen-inventory.md
│   ├── design-system.md
│   └── decisions/
│       ├── 0001-technology-stack.md
│       └── 0002-booking-invariants-and-concurrency.md
├── load-tests/           # Concurrency and performance test suites (k6)
└── .gitignore
```

---

## Documentation Index

- [Product Overview & User Journeys](file:///C:/Users/USER/matinee-mobile/docs/product-overview.md)
- [Complete Screen Inventory](file:///C:/Users/USER/matinee-mobile/docs/screen-inventory.md)
- [Design Token & Component Specification (12 Components)](file:///C:/Users/USER/matinee-mobile/docs/design-system.md)
- [ADR 0001: Technology Stack Selection](file:///C:/Users/USER/matinee-mobile/docs/decisions/0001-technology-stack.md)
- [ADR 0002: Critical Booking Invariants & Concurrency](file:///C:/Users/USER/matinee-mobile/docs/decisions/0002-booking-invariants-and-concurrency.md)

---

## Project Status

- **Task M05.17B Checkpoint**: Presentation polish, staging integration, and evidence review completed locally; changes remain uncommitted pending approval.
- **Git Repository**: [https://github.com/Bellonaire1/matinee-mobile](https://github.com/Bellonaire1/matinee-mobile)
- **Live Staging API**: `https://matinee-staging-api.onrender.com/api/v1`
- **Mobile Build**: Android preview APK, version `1.0.0 (6)`, EAS build `dc0226bb-5b50-48a4-aa61-534209f38052` ([build details](https://expo.dev/accounts/bellonaire/projects/matinee/builds/dc0226bb-5b50-48a4-aa61-534209f38052), [APK](https://expo.dev/artifacts/eas/5LC_Rh3SwFDTZX3_jpGS4aoFqLgUSX-YgDQQqZie2uM.apk)).
- **Backend Architecture**: Express.js with PostgreSQL (Neon serverless) and Redis hold engine (Render Redis).
- **Verified Staging Flow**: A real four-seat Android reservation was independently verified against staging PostgreSQL. The booking remains `PENDING` and tickets remain `PENDING_PAYMENT` because payments are disabled.
- **Admission Safety**: Unpaid tickets do not receive a valid admission QR; no entry should be implied until payment succeeds.
- **Graduation Gaps**: Signed QR generation/scanning, refunds ledger, waiting-room live updates, background jobs, sandbox payment/webhook verification, Figma exports, demonstration video, and LinkedIn submission remain incomplete or evidence-pending.

---

## Local Development & Testing

### Mobile App (`app/`)
```bash
cd app
npm install
npm run typecheck      # TypeScript compilation check
npm run test:seats     # Seat selection QA test harness (97/97 tests)
npm run test:checkout  # Checkout simulation invariant harness
```

### Backend Server (`server/`)
```bash
cd server
npm install
npx tsc --noEmit       # TypeScript compilation check
npm test               # Vitest unit & integration test suites
```
