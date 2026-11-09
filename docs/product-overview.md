# Matinee — Product Overview & User Journeys

## 1. Product Vision & Scope

**Matinee** is an independent, premium mobile cinema ticket booking application designed for modern moviegoers who value seamless discovery, rapid showtime selection, and friction-free seating reservations.

Matinee bridges film lovers with curated and mainstream cinema experiences, pairing real-time cinema inventory with rich film metadata powered by The Movie Database (TMDB) through an isolated, secure backend proxy.

### Core User Capabilities
- **Discover Movies**: Browse Now Playing, Upcoming, and Trending movies with TMDB metadata (synopsis, ratings, genres, trailers, runtime, cast/crew) cached and sanitized via the Matinee backend.
- **Cinema & Showtime Browsing**: Filter by cinema location, screen format (Standard, IMAX, Dolby Cinema, VIP), and date/time slots.
- **Interactive Seat Selection**: View auditorium layout (supporting 300+ seats per hall) with tiering (VIP, Premium, Standard, Accessible) and real-time availability.
- **Atomic Temporary Seat Holds**: Reserve selected seats temporarily (e.g., 10-minute hold window) with real-time countdown timer before checkout.
- **Test-Mode Checkout**: Process payments via a test-mode payment gateway with complete idempotency protection.
- **QR-Code Digital Ticketing**: Instantly generate offline-scannable digital tickets with unique QR codes, booking reference, and auditorium details.
- **Booking History**: Access active/upcoming tickets and historical reservations anytime.

### Core System Invariant
The system guarantees **zero double bookings** under high concurrency through atomic Redis hold leases backed by serializable database constraints.

---

## 2. Target Audience & Personas

1. **The Casual Weekend Moviegoer ("Alex")**: Looks for what's trending, checks ratings, chooses nearby cinemas, books 2–4 seats quickly, and expects a friction-free payment and apple/google wallet-friendly ticket.
2. **The Cinema Enthusiast ("Priya")**: Tracks upcoming releases, books premiere tickets on opening weekend, cares deeply about specific seat placement (center audio sweet-spot, VIP recliners), and demands real-time seat availability without ghost holds.
3. **The Group Planner ("Marcus")**: Organizes movie nights for friends/family, needs clear visual seat layouts for large seat clusters, and requires reliable holding time to coordinate seat numbers.

---

## 3. Main User Journeys

```
[Discovery] ──> [Cinema/Showtime] ──> [Seat Map] ──> [Atomic Hold] ──> [Payment] ──> [QR Ticket]
      │                                                                                  ▲
      └──────────────────────── [Booking History] ───────────────────────────────────────┘
```

### Journey 1: Movie Discovery to Showtime Selection
1. **Entry**: User opens Matinee; the Home screen displays curated carousels (Featured Hero, Now Showing, Coming Soon, Trending).
2. **Search & Filter**: User searches for a title or filters by genre, language, or rating.
3. **Film Details**: User taps a movie card to open the Movie Details screen containing synopsis, trailer preview, runtime, age rating, user score, and cast credits.
4. **Select Date & Location**: User taps "Book Tickets", views available dates (horizontal date picker) and nearby cinemas with available screen formats (Standard 2D, IMAX 3D, Dolby Atmos).
5. **Showtime Selection**: User selects a cinema and a specific showtime pill (e.g., "7:30 PM - Screen 1").

### Journey 2: Seat Selection and Temporary Hold
1. **Auditorium Initialization**: Mobile client loads the interactive Seat Map for the selected showtime.
2. **Seat Selection**: User navigates the 300+ seat layout (pan, pinch-to-zoom, mini-map preview), viewing seat status: *Available*, *Selected*, *Held by others*, *Booked*, and *Accessible*.
3. **Seat Tiers**: User selects seats across tiers (e.g., VIP Recliner @ $18, Standard @ $12). Price summary updates dynamically.
4. **Trigger Hold**: Upon tapping "Confirm Seats", the client requests a temporary hold lease from `/api/v1/holds`.
5. **Hold Active**: Backend validates availability atomically in Redis and grants a 10-minute lease. The mobile app transitions to the Checkout screen with an active countdown timer.
6. **Contention Handling**: If another user holds any selected seat milliseconds earlier, the backend returns a `409 Conflict` specifying the conflicting seat IDs, prompting the user to reselect without crashing or stale state.

### Journey 3: Checkout and Test-Mode Payment
1. **Summary Review**: User reviews booking details (Movie, Cinema, Screen, Seats, Date/Time, Price breakdown including booking fee and tax).
2. **Contact & Guest Info**: User confirms email and phone number for ticket receipt.
3. **Payment Method**: User selects test-mode payment (Mock Card / Test Gateway).
4. **Submission**: User taps "Pay Now". The client attaches a unique `Idempotency-Key` header (UUID v4) to prevent accidental double charges on retry.
5. **Payment Processing & Webhook**:
   - Backend initiates payment charge.
   - Payment provider emits asynchronous webhook or synchronous test completion.
   - Database creates definitive `Booking` record within an ACID transaction, transitioning seat state to `BOOKED` and releasing the Redis hold key.
6. **Timeout Scenario**: If the countdown expires before payment completes, the hold is automatically evicted by Redis TTL, and the user is gracefully notified with an option to return to seat selection.

### Journey 4: Digital Ticket & Check-in
1. **Confirmation Screen**: Upon successful booking, user sees an animated success screen with booking reference, seat numbers, cinema address, and a high-contrast QR code.
2. **Offline Availability**: Ticket payload and QR data are cached locally on device storage (AsyncStorage / SecureStore) for guaranteed access at the cinema door even without cellular connection.
3. **Add to Wallet / Share**: Quick action buttons allow saving to system calendar, sharing booking details, or adding to mobile wallet.

### Journey 5: Booking History & Management
1. **History Tab**: User accesses the "My Bookings" tab, divided into "Upcoming" and "Past".
2. **Ticket Details**: Tapping any booking card reveals the full digital ticket, directions to cinema, cancellation policies, and price receipt.

---

## 4. Key Edge Cases & Business Rules

| Scenario | System Behavior | User Experience |
| :--- | :--- | :--- |
| **Simultaneous Seat Hold Attempt** | Redis Lua script executes atomic check-and-set. First caller succeeds; second caller fails immediately. | Instant toast: *"Seats B12, B13 were just reserved by another guest. Please pick alternate seats."* |
| **Hold Expiration during Checkout** | Redis TTL auto-expires key after 600s. Backend rejects `/api/v1/bookings` with `410 Gone`. | Bottom sheet: *"Your reservation expired. Return to seat selection to re-reserve."* |
| **Network Loss during Payment** | Client retries `/api/v1/bookings` with the identical `Idempotency-Key`. | App safely recovers existing booking or retrieves status without double charge. |
| **App Backgrounded / Closed** | Local countdown timer syncs with server timestamp upon resume. | Accurate remaining time displayed immediately upon app focus. |
| **Cinema Auditorium Scale (300+ seats)** | Canvas / SVG virtualization prevents frame drops on mobile devices during pan and zoom. | Butter-smooth 60fps pan/zoom interaction with responsive seat touch targets (min 44x44pt). |
