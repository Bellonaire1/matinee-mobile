# Matinee — Design System Specification

## 1. Design Token Specification

### 1.1 Color Palette & Semantic Tokens
Matinee uses a cinema-inspired dark-first color aesthetic ("Velvet & Neon Cinema") with deep obsidian backgrounds, rich theatrical crimson accents, and crisp golden highlights.

#### Base Primitives
```
Neutrals:
- Neutral-950: #0B0C10 (Obsidian Void — Darkest background)
- Neutral-900: #12141A (Deep Cinema Canvas — Surface background)
- Neutral-800: #1E222D (Elevated Surface / Card background)
- Neutral-700: #2C3240 (Borders, Dividers, Inactive state)
- Neutral-600: #4B5565 (Muted icons, disabled text)
- Neutral-400: #9AA4B2 (Secondary body text)
- Neutral-200: #E3E8EF (Primary headings, high-contrast text)
- Neutral-50:  #F8FAFC (Pure light surface)

Primary Brand (Theatrical Crimson):
- Primary-600: #B91C1C (Crimson Pressed / Darker)
- Primary-500: #E50914 (Signature Cinema Red — Primary Action CTA)
- Primary-400: #F87171 (Crimson Hover / Light)
- Primary-100: #FEE2E2 (Light Crimson Tint)
- Primary-900: #450A0A (Dark Crimson Container)

Secondary Brand (Cinematic Amber / Gold):
- Amber-500:   #F59E0B (VIP Seating, TMDB Ratings Star, Featured Highlights)
- Amber-400:   #FBBF24 (Warning highlights)
- Amber-900:   #451A03 (Amber glow container)

Semantic Feedback:
- Success-500: #10B981 (Confirmed, Available seats, Active Hold)
- Warning-500: #F59E0B (Seat Hold Expiry Warning, Filling Fast)
- Danger-500:  #EF4444 (Error, Payment Failed, Expired Hold)
- Info-500:    #3B82F6 (Information, Seat Tier Information)

Seat Status Colors:
- Seat-Available:   #334155 (Muted Slate / Unoccupied)
- Seat-Selected:    #E50914 (Primary Red / High Visibility)
- Seat-Held:        #F59E0B (Amber Gold / Temporary lease)
- Seat-Booked:      #1E222D (Deep surface / Inactive / Disabled)
- Seat-VIP:         #8B5CF6 (Royal Violet Recliner)
- Seat-Wheelchair:  #38BDF8 (Accessible Sky Blue)
```

#### Theme Mapping (Light vs. Dark Mode)
Matinee defaults to **Dark Mode** by nature of cinema environments, but provides full semantic token mapping for **Light Mode**:

| Semantic Token | Dark Mode (Default) | Light Mode |
| :--- | :--- | :--- |
| `background.canvas` | `#0B0C10` | `#F8FAFC` |
| `background.surface` | `#12141A` | `#FFFFFF` |
| `background.elevated` | `#1E222D` | `#F1F5F9` |
| `text.primary` | `#F8FAFC` | `#0F172A` |
| `text.secondary` | `#9AA4B2` | `#475569` |
| `text.muted` | `#64748B` | `#94A3B8` |
| `border.default` | `#2C3240` | `#E2E8F0` |
| `border.focused` | `#E50914` | `#E50914` |
| `action.primary` | `#E50914` | `#E50914` |
| `action.primaryText`| `#FFFFFF` | `#FFFFFF` |

---

### 1.2 Typography System

Font Family:
- Primary Sans: `Inter` (or System Sans: SF Pro on iOS, Roboto on Android)
- Display / Headings: `Inter Display` / `Plus Jakarta Sans`
- Monospace (Booking codes, Timers): `JetBrains Mono` / `SF Mono`

| Style Token | Font Size | Line Height | Weight | Letter Spacing | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `display.large` | 34pt | 40pt | 800 (ExtraBold) | -0.5px | Hero Banner Title |
| `heading.1` | 28pt | 34pt | 700 (Bold) | -0.4px | Screen Headers (e.g. Movie Details) |
| `heading.2` | 22pt | 28pt | 700 (Bold) | -0.3px | Section Headers (e.g. Now Playing) |
| `heading.3` | 18pt | 24pt | 600 (SemiBold)| -0.2px | Card Titles, Modal Headers |
| `subtitle.1` | 16pt | 22pt | 600 (SemiBold)| 0px | Sub-headings, Cinema Names |
| `body.regular` | 15pt | 22pt | 400 (Regular) | 0px | Synopses, Descriptions |
| `body.medium` | 15pt | 22pt | 500 (Medium) | 0px | Form Inputs, Table cells |
| `body.bold` | 15pt | 22pt | 700 (Bold) | 0px | Emphasized text |
| `caption` | 12pt | 16pt | 400 (Regular) | +0.2px | Timestamps, Disclaimers |
| `caption.bold` | 12pt | 16pt | 600 (SemiBold)| +0.2px | Badges, Seat row labels |
| `code.timer` | 16pt | 20pt | 700 (Bold) | +0.5px | Seat hold countdown timer |

---

### 1.3 Spacing System (4pt / 8pt Scale)
All layout, margins, paddings, and component sizes conform strictly to an 8pt base grid with a 4pt micro-adjustment scale:

| Token | Dimension | Common Use |
| :--- | :--- | :--- |
| `space.1` | 4pt | Icon-to-text micro gap, border offsets |
| `space.2` | 8pt | Internal chip padding, tight element grouping |
| `space.3` | 12pt | Button vertical padding (compact), badge padding |
| `space.4` | 16pt | Standard screen horizontal gutter, card internal padding |
| `space.5` | 20pt | Form field vertical separation |
| `space.6` | 24pt | Section margin, bottom sheet content gap |
| `space.8` | 32pt | Major section vertical padding |
| `space.10` | 40pt | Large hero offsets |
| `space.12` | 48pt | Bottom navigation bar clearance |

---

### 1.4 Border Radii
| Token | Value | Applied To |
| :--- | :--- | :--- |
| `radius.xs` | 4pt | Badges, Seat map cell representation |
| `radius.sm` | 8pt | Form Inputs, Toast containers, Chips |
| `radius.md` | 12pt | Standard Cards, MovieCard posters |
| `radius.lg` | 16pt | Featured Hero Cards, Modal Dialogs |
| `radius.xl` | 24pt | BottomSheet top edges |
| `radius.full`| 9999pt| Circular Avatar, Pill Buttons, Floating Action Buttons |

---

### 1.5 Shadow & Elevation System
Shadows in dark mode rely on subtle rim borders (`border.default`) and deep ambient blurs:

| Elevation Level | Android `elevation` | iOS Shadow (`color`, `offset`, `opacity`, `radius`) | Usage |
| :--- | :--- | :--- | :--- |
| `elevation.none` | 0 | `transparent` | Flat cards, inputs |
| `elevation.low` | 2 | `rgba(0,0,0,0.4)`, `{width:0, height:2}`, `0.25`, `4` | MovieCards, Chips |
| `elevation.medium` | 6 | `rgba(0,0,0,0.6)`, `{width:0, height:4}`, `0.35`, `8` | Sticky Selection Bar, Toasts |
| `elevation.high` | 12 | `rgba(0,0,0,0.85)`, `{width:0, height:8}`, `0.5`, `16` | BottomSheets, Modals |

---

## 2. The 12 Required Design System Components

The Matinee design system enforces exact specifications for the 12 core components:

### 1. Text
- **Variants**: `display`, `h1`, `h2`, `h3`, `subtitle`, `body`, `caption`, `timer`.
- **Colors**: `primary`, `secondary`, `muted`, `accent`, `error`, `success`.
- **Props**: `children`, `variant`, `color`, `align`, `numberOfLines`, `accessible`.
- **Accessibility**: Scales automatically with OS Dynamic Type / font scaling.

### 2. Button
- **Variants**: `primary` (Solid Crimson), `secondary` (Neutral Slate), `outline` (Bordered), `ghost` (Text only), `danger` (Red).
- **Sizes**: `sm` (36pt height), `md` (44pt height — WCAG minimum touch target), `lg` (54pt height).
- **States**: `default`, `pressed`, `hover`, `disabled`, `loading` (shows ActivityIndicator).
- **Props**: `title`, `onPress`, `variant`, `size`, `disabled`, `loading`, `iconLeft`, `iconRight`, `fullWidth`.

### 3. Card
- **Variants**: `flat`, `elevated`, `outlined`, `interactive` (with press feedback).
- **Props**: `children`, `variant`, `onPress`, `padding`, `style`.
- **Styling**: `radius.md` (12pt), border `border.default`, elevation mapping.

### 4. MovieCard
- **Variants**:
  - `poster`: Vertical 2:3 aspect ratio (e.g. 140x210pt) for carousels and grids.
  - `horizontal`: List row layout (poster thumbnail + title, genres, rating, duration).
  - `hero`: Full-width banner (16:9) with gradient scrim and floating action button.
- **Overlays**: TMDB Star Rating Badge (Amber), Age Rating Badge (PG-13, R), New/Featured Badge.
- **Props**: `id`, `title`, `posterUrl`, `rating`, `genreList`, `releaseDate`, `onPress`, `layout`.

### 5. Input
- **Variants**: `standard`, `search`, `password`, `numeric`.
- **States**: `default`, `focused` (1.5pt Crimson border), `filled`, `error` (Danger border + error message), `disabled`.
- **Accessories**: `leftIcon` (e.g. Search magnifying glass), `rightIcon` (e.g. Clear cross, password visibility toggle).
- **Accessibility**: Accessible label, hint, error announcement via `accessibilityLiveRegion`.

### 6. Chip
- **Variants**: `filter` (toggle state), `choice` (radio behavior), `action` (executable pill).
- **States**: `unselected`, `selected` (Crimson filled), `disabled`.
- **Props**: `label`, `icon`, `selected`, `onPress`, `removable`, `onRemove`.

### 7. Badge
- **Variants**: `status` (Success, Warning, Danger, Info), `cinemaFormat` (IMAX, Dolby, VIP, 4DX), `counter` (numeric badge).
- **Props**: `label`, `variant`, `size` (`sm`, `md`).
- **Styling**: Compact padding (4pt vertical, 8pt horizontal), `radius.xs` (4pt), high-contrast text.

### 8. BottomSheet
- **Features**: Drag handle, snap points (e.g. `25%`, `50%`, `90%`), backdrop scrim with tap-to-dismiss, keyboard avoiding.
- **Props**: `isOpen`, `onClose`, `snapPoints`, `children`, `title`, `headerActions`.
- **Accessibility**: Traps focus when open, ESC/hardware back button dismisses.

### 9. Skeleton
- **Variants**: `text`, `circle` (avatar), `rect` (card/image), `moviePoster`.
- **Animation**: Continuous subtle shimmering linear gradient from `Neutral-800` to `Neutral-700` and back (1.5s loop).
- **Props**: `width`, `height`, `borderRadius`, `variant`.

### 10. Toast
- **Variants**: `success` (green checkmark), `error` (red exclamation), `warning` (amber alert), `info` (blue info).
- **Position**: Floating at top safe area or bottom above sticky action bar.
- **Behavior**: Auto-dismiss after 4000ms with manual swipe-to-dismiss.
- **Props**: `message`, `type`, `actionLabel`, `onAction`, `duration`.

### 11. EmptyState
- **Variants**: `noSearchResults`, `noBookings`, `noInternet`, `genericError`.
- **Components**: Vector illustration / icon, title text, descriptive body text, primary CTA button, secondary CTA button.
- **Props**: `icon`, `title`, `description`, `actionTitle`, `onAction`.

### 12. SeatMap (High Capacity: 300+ Seats)
- **Scale Requirements**: Architected to render and interactively manage auditoriums containing **at least 300 seats** (typical multiplex hall: 15–20 rows, 18–24 seats per row = 300–450 seats).
- **Architecture & Performance**:
  - Pan and Zoom Viewport using React Native Skia / SVG with gesture handlers (`react-native-gesture-handler` + `react-native-reanimated`).
  - Viewport virtualization: avoids rendering off-screen DOM nodes or unnecessary re-renders.
  - Distinct Seat Types: `Standard`, `Premium`, `VIP Recliner`, `Wheelchair Accessible`, `Companion`.
  - Distinct Seat States: `Available`, `Selected` (by current user), `Held` (temporary lock by another user), `Booked` (sold out), `Disabled`.
  - Mini-map overview: Small thumbnail radar in the corner showing current viewport in relation to the entire 300-seat auditorium.
  - Touch Target: Even at 100% zoom-out, seat targets feature an invisible minimum 44x44pt hit-box expansion or pinch-to-zoom requirement before selection to prevent mis-clicks.
- **Props**: `auditoriumLayout`, `seatStatusMap`, `selectedSeatIds`, `onSeatToggle`, `maxSelectableSeats`, `currencySymbol`.

---

## 3. Accessibility Requirements (WCAG 2.1 AA Compliance)

1. **Touch Targets**: All interactive elements (Buttons, Chips, Showtime Pills, Seat cells) must provide a minimum bounding hit target of **44 × 44 points** (iOS Human Interface Guidelines) and **48 × 48 dp** (Android Material Design).
2. **Color Contrast Ratios**:
   - Text to background: Minimum **4.5:1** for standard body text; minimum **3:1** for large headings (>= 18pt bold or >= 24pt regular).
   - Non-text UI components (borders, active seat status icons): Minimum **3.0:1** contrast against adjacent background.
3. **Screen Reader Accessibility (VoiceOver / TalkBack)**:
   - All interactive controls provide `accessible={true}`, descriptive `accessibilityLabel`, `accessibilityRole`, and `accessibilityHint`.
   - SeatMap accessibility: Matrix navigational structure or accessible list fallback allowing screen reader users to hear: *"Row G, Seat 14, Premium, $14.50, Available. Double tap to select."*
4. **Motion & Reduced Motion**:
   - Respect user's `prefers-reduced-motion` OS setting: disable heavy shimmers, parallax poster effects, and seat zoom animations in favor of simple crossfades.
5. **Dynamic Type & Scalability**:
   - All text tokens scale smoothly with the user's OS text enlargement setting up to 200% without layout clipping.

---

## 4. Figma Implementation Checklist

> [!IMPORTANT]
> The official project brief requires all screens and components to be designed in Figma before mobile implementation begins.
> **Verification Status**: No Figma file currently exists or has been verified yet. It must be created and linked prior to front-end implementation.

### Figma Setup & Foundations Checklist
- [ ] **Figma Project Created**: Name: `Matinee Cinema App - Mobile UI`
- [ ] **Design Tokens / Variables**:
  - [ ] Color Variables defined (Primitives, Semantic, Light & Dark modes)
  - [ ] Typography Styles defined (Inter / Inter Display scale)
  - [ ] Spacing & Grid System configured (4pt / 8pt Auto Layout grids)
  - [ ] Corner Radius & Shadow Elevation Effects styles created
- [ ] **12 Core Components Created (with Auto Layout & Variants)**:
  - [ ] Button (Primary, Secondary, Outline, Ghost, Danger × sm, md, lg × default, pressed, disabled, loading)
  - [ ] Text (All 8 typography variants with semantic color tokens)
  - [ ] Card (Flat, Elevated, Outlined, Interactive)
  - [ ] MovieCard (Poster 2:3, Horizontal row, Hero banner)
  - [ ] Input (Default, Focused, Error, Search, Disabled with left/right icons)
  - [ ] Chip (Filter, Choice, Action × Unselected, Selected)
  - [ ] Badge (Status types, Cinema format tags, Counters)
  - [ ] BottomSheet (Peek, Half, Full with drag handle & scrim)
  - [ ] Skeleton (Text, Poster, Card shimmer variants)
  - [ ] Toast (Success, Error, Warning, Info)
  - [ ] EmptyState (No results, No bookings, Offline, Error)
  - [ ] SeatMap (Full 300+ seat layout, screen curve, legend, row labels, mini-map)
- [ ] **All Screens Wireframed & High-Fidelity**:
  - [ ] SCR-01: Home Screen (Curated feeds, Hero banner, Now Playing carousels)
  - [ ] SCR-02: Search & Filter Screen (Active search, filters, results list, empty state)
  - [ ] SCR-03: Movie Details Screen (Backdrop, synopsis, ratings, cast, sticky book button)
  - [ ] SCR-04: Cinema & Showtime Selection Screen (Date picker ribbon, cinema cards, showtime pills)
  - [ ] SCR-05: Seat Selection Screen (300+ seat map, legend, sticky selection tray with price)
  - [ ] SCR-06: Checkout Screen (Hold timer banner, summary card, payment method, pay button)
  - [ ] SCR-07: Booking Confirmation & Digital Ticket Screen (QR code, perforated ticket, share options)
  - [ ] SCR-08: My Bookings Screen (Upcoming vs. Past tabs)
  - [ ] SCR-09: Ticket Detail Screen (High-brightness QR view, cinema policies, itemized breakdown)
  - [ ] SCR-10: Profile & Settings Screen (Dark mode switch, test mode info, dev tools)
  - [ ] SCR-11: Component Gallery Screen (Live showcase of all 12 components)
- [ ] **Figma Verification**:
  - [ ] Verify accessibility contrast on all screens using Stark / Figma Contrast Checker.
  - [ ] Prototype user flow linking SCR-01 through SCR-07.
