# Matinee — Mobile Screen Inventory

## 1. Navigation Architecture

Matinee uses a standard, accessible mobile navigation hierarchy built on React Navigation / Expo Router:

```
Root Stack
├── Main Tabs (Bottom Navigation)
│   ├── Home Tab (Discovery Stack)
│   │   ├── Home Screen (SCR-01)
│   │   ├── Movie Details Screen (SCR-03)
│   │   ├── Cinema & Showtime Picker Screen (SCR-04)
│   │   ├── Seat Selection Screen (SCR-05)
│   │   ├── Checkout Screen (SCR-06)
│   │   └── Booking Confirmation Screen (SCR-07)
│   ├── Search Tab (Explore Stack)
│   │   ├── Search & Filter Screen (SCR-02)
│   │   └── Movie Details Screen (SCR-03)
│   ├── Bookings Tab (Tickets Stack)
│   │   ├── My Bookings Screen (SCR-08)
│   │   └── Ticket Detail Screen (SCR-09)
│   └── Profile / More Tab
│       ├── Profile & Settings Screen (SCR-10)
│       └── Component Gallery Screen (SCR-11) [Dev / Design System Showcase]
└── Global Modals & Overlays
    ├── Seat Hold Expiry Modal (SCR-MODAL-01)
    ├── Cinema Location Picker Sheet (SCR-MODAL-02)
    └── Filter Options Sheet (SCR-MODAL-03)
```

---

## 2. Screen Specifications

### SCR-01: Home Screen (Movie Discovery)
- **Purpose**: Primary landing screen featuring curated film releases, promotions, and quick access to today's showtimes.
- **Key Sections**:
  - Top Bar: Matinee logo, current cinema/city selector pill, search icon button.
  - Hero Carousel: Featured blockbuster banner with backdrop image, title, genre chips, and "Book Now" CTA.
  - Now Playing Carousel: Horizontal scroll of MovieCards with TMDB ratings and release format badges.
  - Coming Soon Carousel: Horizontal scroll of upcoming titles with "Remind Me" / "Details" actions.
  - Top Rated / Trending Grid: 2-column grid of curated recommendations.
- **States**:
  - *Loading*: Skeleton carousels with shimmer effect matching MovieCard aspect ratio (2:3).
  - *Success*: Rich image-loaded feeds with smooth fading.
  - *Empty / Error*: EmptyState component with retry CTA.
- **Components Used**: Text, Button, Card, MovieCard, Chip, Badge, Skeleton, EmptyState.

### SCR-02: Search & Filter Screen
- **Purpose**: Search titles, cast, directors, or cinemas with instant filtering.
- **Key Sections**:
  - Search Header: Input component with clear button, auto-focus, and voice/clear icons.
  - Filter Bar: Scrollable Chip row (Today, IMAX, Dolby, VIP, Action, Drama, Sci-Fi).
  - Search Results: Vertical list of MovieCards in compact horizontal format (poster thumbnail, title, runtime, genre chips, star rating).
  - Recent Searches: Chip pills of previous search queries with clear history button.
- **States**:
  - *Empty Initial*: "Search for movies, actors, or cinemas" illustration with trending suggestions.
  - *Zero Results*: EmptyState component ("No movies found matching '...'") with "Clear filters" CTA.
  - *Loading*: Vertical list of Skeleton cards.
- **Components Used**: Input, Chip, MovieCard, Text, EmptyState, Skeleton.

### SCR-03: Movie Details Screen
- **Purpose**: Comprehensive information about a selected film to drive the booking decision.
- **Key Sections**:
  - Header Hero: Full-width TMDB backdrop image with gradient scrim, back button, share button, and play trailer overlay button.
  - Metadata Row: Rating badge (PG-13 / R), release year, runtime (e.g. 2h 45m), language, TMDB user score badge.
  - Genre Chips: Horizontal row of genres (e.g. Sci-Fi, Adventure, IMAX).
  - Synopsis Block: Truncated text with "Read more" toggle.
  - Cast & Crew Rail: Circular avatars with actor names and character names.
  - Sticky Bottom Bar: "Select Cinema & Showtimes" primary Button with price range label.
- **States**:
  - *Loading*: Backdrop skeleton, title skeleton, text lines skeleton.
  - *Error*: Fullscreen EmptyState with "Failed to load movie details" and retry button.
- **Components Used**: Text, Button, Badge, Chip, Card, Skeleton, BottomSheet.

### SCR-04: Cinema & Showtime Selection Screen
- **Purpose**: Select the viewing date, cinema location, screen format, and time slot.
- **Key Sections**:
  - Date Ribbon: Horizontal calendar picker displaying Day of Week, Date Number, and Month abbreviation (e.g., Fri 14 Nov).
  - Cinema Filter: Dropdown/sheet to filter by distance or brand.
  - Cinema Accordion / Card List:
    - Cinema Name, distance (e.g., 2.4 km), and address.
    - Format sections (Standard 2D, IMAX 3D, VIP Recliner).
    - Showtime Pills: Accessible Chip buttons indicating time (e.g., 18:30, 21:00) with occupancy indicator (Green: Available, Amber: Filling fast).
- **States**:
  - *No Showtimes*: EmptyState component ("No showtimes scheduled for this date").
  - *Loading*: Date ribbon skeleton + Cinema card skeletons.
- **Components Used**: Card, Chip, Badge, Button, Text, Skeleton, EmptyState.

### SCR-05: Interactive Seat Selection Screen
- **Purpose**: Interactive visual seat map for 300+ seat auditoriums, seat tier pricing, and temporary hold trigger.
- **Key Sections**:
  - Showtime Header: Movie title, cinema name, screen number, date/time in compact bar.
  - Cinema Screen Curve: Visual stylized representation of the screen at the top ("SCREEN THIS WAY").
  - SeatMap (300+ seats): Pan & pinch-to-zoom SVG/Canvas viewport with row letters (A–P) and seat numbers (1–24). Supports VIP, Premium, Standard, and Wheelchair accessible seating.
  - Legend Bar: Visual key (Available, Selected, Reserved/Held, Booked, Wheelchair).
  - Sticky Selection Tray:
    - Selected seats pills (e.g., "G12, G13 — Premium").
    - Total price calculation.
    - "Hold Seats & Continue" primary Button.
- **States**:
  - *Initial Load*: Skeleton seat grid representation.
  - *Conflict Toast*: Toast component notifying when a selected seat was claimed concurrently.
  - *Max Selection Alert*: Alert when user attempts to select more than maximum allowable seats (e.g. max 8).
- **Components Used**: SeatMap, Button, Text, Chip, Badge, Toast, BottomSheet, Skeleton.

### SCR-06: Checkout & Payment Screen
- **Purpose**: Review reservation details, countdown hold timer, enter contact details, and execute test-mode payment.
- **Key Sections**:
  - Hold Countdown Banner: High-urgency timer badge ("Seats held for 09:42").
  - Booking Summary Card: Movie poster thumbnail, title, cinema, screen, date, time, seat list.
  - Price Breakdown: Itemized ticket prices by tier, booking fee, local taxes, grand total.
  - Contact Details Input: Full name, email, phone number (auto-populated if authenticated).
  - Payment Selector: Test-mode payment provider selector (e.g., "Test Gateway — Mock 3DS Success", "Test Gateway — Trigger Failure").
  - Submit Button: Primary action Button ("Pay $36.00") with loading spinner state.
- **States**:
  - *Hold Expiry Warning*: Toast notification when timer drops under 2 minutes.
  - *Expired State*: Modal/BottomSheet blocking checkout when hold expires, prompting return to seat selection.
  - *Processing*: Button loading state, inputs disabled.
- **Components Used**: Card, Input, Button, Badge, Toast, BottomSheet, Text.

### SCR-07: Booking Confirmation & Digital Ticket Screen
- **Purpose**: Display the confirmed ticket with an offline-scannable QR code and booking reference immediately following payment.
- **Key Sections**:
  - Confirmation Header: Animated success checkmark icon, "Booking Confirmed!".
  - Ticket Card: Perforated ticket styling containing:
    - Unique QR Code encoding booking reference, signature, and verification hash.
    - Booking Reference (e.g., `MAT-8942-X7`).
    - Film Poster, Title, Screen & Auditorium, Date & Showtime.
    - Seat numbers prominently highlighted.
  - Actions:
    - "Add to Apple Wallet / Google Wallet" button.
    - "Save to Photos / PDF" button.
    - "Directions to Cinema" button.
    - "Back to Home" button.
- **States**:
  - *Offline Mode*: Notice banner indicating ticket is cached and valid for entry.
- **Components Used**: Card, Badge, Button, Text, Toast.

### SCR-08: My Bookings Screen (History & Active)
- **Purpose**: Consolidated view of all active and historical cinema reservations.
- **Key Sections**:
  - Segmented Control / Tabs: "Upcoming (2)" vs "Past History".
  - Booking Card List:
    - Upcoming: Large Card with countdown days, cinema address, QR quick-tap icon, and "View Ticket" button.
    - Past: Compact Card with movie thumbnail, date attended, total paid, and "Book Again" shortcut.
- **States**:
  - *Empty State (No upcoming)*: EmptyState component with "No upcoming bookings. Discover the latest releases!" and "Explore Movies" CTA.
  - *Loading*: Card skeleton list.
- **Components Used**: Card, Badge, Button, Text, EmptyState, Skeleton.

### SCR-09: Ticket Detail Screen
- **Purpose**: In-depth view of a specific previous or upcoming ticket, including full receipts and terms.
- **Key Sections**:
  - Full-screen high-brightness QR display (automatic brightness boost for scanner readability).
  - Full itemized billing receipt.
  - Cinema policy notes (age verification, outside food rules, refund deadlines).
  - "Cancel Booking" action (if within cinema cancellation window).
- **Components Used**: Card, Badge, Button, Text, BottomSheet, Toast.

### SCR-10: Profile & Settings Screen
- **Purpose**: App preferences, account overview, and developer/testing utilities.
- **Key Sections**:
  - User Account Card (Name, Email, Member tier).
  - Preferences: Dark Mode Toggle (System / Light / Dark), Push notifications for upcoming showtimes.
  - Developer Tools:
    - Test Mode indicator badge.
    - "Open Component Gallery" navigation link.
    - Clear local hold cache.
    - Backend health status ping.
- **Components Used**: Card, Badge, Button, Text, Input.

### SCR-11: Component Gallery Screen (Design System Showcase)
- **Purpose**: Dedicated developer/designer screen displaying all 12 design system components in all their variants, sizes, and states.
- **Sections**:
  1. **Typography & Text**: Heading 1–4, Subtitle, Body (Default, Muted, Bold), Caption, Monospace.
  2. **Buttons**: Primary, Secondary, Outline, Ghost, Danger; sizes (Small, Medium, Large); states (Default, Pressed, Disabled, Loading with spinner).
  3. **Cards**: Standard card, elevated card, interactive card, bordered card.
  4. **MovieCards**: Poster view (2:3), Wide banner view, compact horizontal view, with/without rating badge.
  5. **Inputs**: Default, Focused, Filled, Error state with message, Disabled, Left/Right icon accessories, Search variant.
  6. **Chips**: Filter chip, Choice chip, Removable chip, Selected and Unselected states.
  7. **Badges**: Status badges (Success, Warning, Error, Info), format badges (IMAX, VIP, 4DX), numeric count badges.
  8. **BottomSheets**: Peek, Half-expanded, Full height, with handle, dismissible gestures.
  9. **Skeletons**: Text skeleton, Avatar skeleton, Card skeleton, MovieCard skeleton shimmer.
  10. **Toasts**: Success, Error, Info, Warning; auto-dismiss and action button variants.
  11. **EmptyStates**: No Search Results, No Bookings, No Internet Connection, Error with retry CTA.
  12. **SeatMap**: Interactive 300+ seat preview showing seat states (Available, Selected, Held, Booked, VIP, Wheelchair) with interactive pan/zoom test bench.
- **Components Used**: ALL 12 components.
