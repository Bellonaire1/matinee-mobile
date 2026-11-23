# Matinee: Design System Component Architecture (COMPONENTS.md)
## Formal Documentation of the Twelve Reusable Primitives

This document specifies the twelve reusable core components of the Matinee mobile design system, built in **React Native** and **Expo SDK 58** under the **Cinema After Dark** design theme (Obsidian `#0A0D14`, Velvet Charcoal `#121620`, Imperial Gold `#D4AF37`, and Midnight Violet `#B78AF7`).

All twelve components are rendered interactively in the in-app test bench:
- **Route**: `/component-gallery`
- **Source**: [app/src/app/component-gallery.tsx](file:///c:/Users/USER/matinee-mobile/app/src/app/component-gallery.tsx) (SCR-11)
- **Automated QA Verification**: `npm --prefix app run test:seats` (Suite 15: Component Gallery & Design System Invariants — 9/9 tests passed).

---

## Component Index

1. [Button](#1-button)
2. [Text](#2-text)
3. [Card](#3-card)
4. [MovieCard](#4-moviecard)
5. [Input](#5-input)
6. [Chip](#6-chip)
7. [Badge](#7-badge)
8. [BottomSheet](#8-bottomsheet)
9. [Skeleton](#9-skeleton)
10. [Toast](#10-toast)
11. [EmptyState](#11-emptystate)
12. [SeatMap](#12-seatmap)

---

### 1. Button

- **Implementation Path**: [app/src/components/ui/Button.tsx](file:///c:/Users/USER/matinee-mobile/app/src/components/ui/Button.tsx)
- **TypeScript Props**:
  ```typescript
  export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  export type ButtonSize = 'sm' | 'md' | 'lg';

  export interface ButtonProps extends TouchableOpacityProps {
    title: string;
    onPress?: () => void;
    variant?: ButtonVariant;
    size?: ButtonSize;
    iconLeft?: React.ReactNode;
    iconRight?: React.ReactNode;
    disabled?: boolean;
    fullWidth?: boolean;
    style?: StyleProp<ViewStyle>;
  }
  ```
- **Variants**: `primary` (Imperial gold `#D4AF37`), `secondary` (Elevated charcoal `#292536`), `outline` (Border `#3A344D`), `ghost` (Transparent), `danger` (Crimson `#FF7185`).
- **Interactive States**: Default, Pressed (opacity 0.85), Disabled (opacity 0.45, non-interactive pointer events).
- **Design Tokens Used**: `colors.primary`, `colors.elevated`, `colors.border`, `radii.sm` (8pt), `radii.md` (12pt), `spacing.sm` (8pt), `spacing.md` (16pt). Minimum touch target: 44pt height for `md`/`lg`.
- **Accessibility**: Enforces `accessible={true}`, `accessibilityRole="button"`, and `accessibilityState={{ disabled }}`.
- **Test Coverage**: Verified in `test-seat-selection.js` Suite 15 and interactive test bench.
- **Validation Gaps**: Automated visual regression snapshot tests across device resolutions.

---

### 2. Text

- **Implementation Path**: [app/src/components/ui/Text.tsx](file:///c:/Users/USER/matinee-mobile/app/src/components/ui/Text.tsx)
- **TypeScript Props**:
  ```typescript
  export type TypographyVariant =
    | 'display'      // Inter Bold 32/40
    | 'heading1'     // Inter Bold 28/36
    | 'heading2'     // Inter SemiBold 22/30
    | 'body'         // Inter Regular 16/24
    | 'supporting'   // Inter Regular 14/20
    | 'caption';     // Inter Medium 12/16

  export interface TextProps extends RNTextProps {
    variant?: TypographyVariant;
    color?: keyof Colors | string;
    align?: 'left' | 'center' | 'right';
  }
  ```
- **Variants**: `display`, `heading1`, `heading2`, `body`, `supporting`, `caption`.
- **Design Tokens Used**: `typography.*`, `colors.textPrimary` (`#FAF8FF`), `colors.textSecondary` (`#AEA8BF`), `colors.textMuted` (`#6B657D`).
- **Accessibility**: Minimum normal text contrast ratio $\ge 4.5:1$ against obsidian background (`#0A0D14`). Supports system dynamic font scaling.
- **Test Coverage**: Audited in `test:seats` Suite 15; verified across all 10 application screens.
- **Validation Gaps**: Automated WCAG contrast checker test script in CI.

---

### 3. Card

- **Implementation Path**: [app/src/components/ui/Card.tsx](file:///c:/Users/USER/matinee-mobile/app/src/components/ui/Card.tsx)
- **TypeScript Props**:
  ```typescript
  export interface CardProps extends ViewProps {
    variant?: 'surface' | 'elevated';
    padding?: keyof typeof spacing;
  }
  ```
- **Variants**: `surface` (Velvet Charcoal `#1C1926` with border `#2E2A3D`), `elevated` (Elevated `#292536` with subtle drop shadow).
- **Design Tokens Used**: `colors.surface`, `colors.elevated`, `radii.md` (12pt), `spacing.base` (16pt), `spacing.sm` (8pt).
- **Accessibility**: Containers marked with `accessible={false}` to allow child screen-reader traversal.
- **Test Coverage**: Verified in `test:seats` Suite 15 and component gallery.
- **Validation Gaps**: None.

---

### 4. MovieCard

- **Implementation Path**: [app/src/components/ui/MovieCard.tsx](file:///c:/Users/USER/matinee-mobile/app/src/components/ui/MovieCard.tsx)
- **TypeScript Props**:
  ```typescript
  export interface MovieCardProps {
    movie: Movie;
    onPress?: (movie: Movie) => void;
    style?: StyleProp<ViewStyle>;
    width?: number;
  }
  ```
- **Interactive States**: Default, Pressed (activeOpacity 0.8), Coming Soon badge overlay ("Showtimes Open Soon").
- **Design Tokens Used**: `radii.md` (12pt), `colors.surface`, `colors.primary`, 2:3 vertical poster aspect ratio, TMDB image CDN caching.
- **Accessibility**: `accessible={true}`, `accessibilityRole="button"`, `accessibilityLabel="View details for {movie.title}"`.
- **Test Coverage**: Tested in `test-discovery-adapter.js` and Home/Search rails.
- **Validation Gaps**: Cached offline image placeholder rendering when device network disconnected mid-scroll.

---

### 5. Input

- **Implementation Path**: [app/src/components/ui/Input.tsx](file:///c:/Users/USER/matinee-mobile/app/src/components/ui/Input.tsx)
- **TypeScript Props**:
  ```typescript
  export interface InputProps extends Omit<TextInputProps, 'style'> {
    label?: string;
    error?: string;
    helperText?: string;
    iconLeft?: React.ReactNode;
    iconRight?: React.ReactNode;
    containerStyle?: StyleProp<ViewStyle>;
    disabled?: boolean;
  }
  ```
- **Interactive States**: Unfocused (border `#2E2A3D`), Focused (golden border `#D4AF37`), Error (crimson border `#FF7185`), Disabled (opacity 0.5).
- **Design Tokens Used**: `colors.surface`, `colors.border`, `colors.primary`, `radii.sm` (8pt), `spacing.sm` (8pt). Minimum height: 48pt.
- **Accessibility**: Screen reader reads `label`, `helperText`, and dynamically announces `error` message via `accessibilityLiveRegion="polite"`.
- **Test Coverage**: Tested in Component Gallery test bench.
- **Validation Gaps**: Automated keyboard avoid and scroll-into-view regression tests.

---

### 6. Chip

- **Implementation Path**: [app/src/components/ui/Chip.tsx](file:///c:/Users/USER/matinee-mobile/app/src/components/ui/Chip.tsx)
- **TypeScript Props**:
  ```typescript
  export interface ChipProps {
    label: string;
    selected?: boolean;
    onPress?: () => void;
    icon?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
  }
  ```
- **Interactive States**: Unselected (surface `#1C1926` with border), Selected (gold tint with primary border `#D4AF37`), Pressed.
- **Design Tokens Used**: `colors.surface`, `colors.primary`, `radii.full` (pill shape), `spacing.xs` (4pt), `spacing.sm` (8pt).
- **Accessibility**: `accessibilityRole="checkbox"` or `"button"`, `accessibilityState={{ selected }}`.
- **Test Coverage**: Used across Search genre filters and Showtime date selectors; verified in `test:seats` Suite 14.
- **Validation Gaps**: None.

---

### 7. Badge

- **Implementation Path**: [app/src/components/ui/Badge.tsx](file:///c:/Users/USER/matinee-mobile/app/src/components/ui/Badge.tsx)
- **TypeScript Props**:
  ```typescript
  export type BadgeVariant = 'default' | 'primary' | 'highlight' | 'outline' | 'success' | 'danger';

  export interface BadgeProps {
    label: string;
    variant?: BadgeVariant;
    size?: 'sm' | 'md';
    icon?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
  }
  ```
- **Variants**: `default` (elevated), `primary` (gold), `highlight` (amber `#F6BE63`), `outline` (bordered), `success` (`#4ADE80`), `danger` (`#FF7185`).
- **Design Tokens Used**: `radii.full` / `radii.sm`, micro-typography `caption` (12pt).
- **Accessibility**: Informative status text rendered with sufficient contrast.
- **Test Coverage**: Verified in `test:seats` Suite 14 (search summaries and seat tiers).
- **Validation Gaps**: None.

---

### 8. BottomSheet

- **Implementation Path**: [app/src/components/ui/BottomSheet.tsx](file:///c:/Users/USER/matinee-mobile/app/src/components/ui/BottomSheet.tsx)
- **TypeScript Props**:
  ```typescript
  export interface BottomSheetProps {
    visible: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
    style?: StyleProp<ViewStyle>;
  }
  ```
- **Interactive States**: Hidden, Entering (slide up with backdrop fade), Open, Drag/Dismiss, Backdrop tap dismiss.
- **Design Tokens Used**: Modal backdrop `rgba(0,0,0,0.75)`, surface background `#1C1926`, `radii.lg` (16pt top corners), top drag handle `#3A344D`.
- **Accessibility**: Focus trapped within open sheet; hardware Android back button dismisses sheet via `onRequestClose`.
- **Test Coverage**: Interactive demo in `component-gallery.tsx`.
- **Validation Gaps**: Gesture-handler velocity-based swipe-to-dismiss automated test.

---

### 9. Skeleton

- **Implementation Path**: [app/src/components/ui/Skeleton.tsx](file:///c:/Users/USER/matinee-mobile/app/src/components/ui/Skeleton.tsx)
- **TypeScript Props**:
  ```typescript
  export type SkeletonVariant = 'rect' | 'circle' | 'text';

  export interface SkeletonProps {
    width?: DimensionValue;
    height?: DimensionValue;
    borderRadius?: number;
    variant?: SkeletonVariant;
    style?: StyleProp<ViewStyle>;
  }
  ```
- **Variants**: `rect` (content blocks), `circle` (avatars), `text` (typography bars).
- **Interactive States**: Smooth loop pulse animation oscillating opacity between 0.3 and 0.7.
- **Design Tokens Used**: Base elevated color `#292536`, `radii.sm`, animated loop timing 1000ms.
- **Accessibility**: Marked with `accessibilityLabel="Loading..."` and `accessibilityElementsHidden={true}` to prevent screen reader noise during fetch.
- **Test Coverage**: Tested in `component-gallery.tsx`.
- **Validation Gaps**: Low-power mode reduced-motion OS setting compliance check.

---

### 10. Toast

- **Implementation Path**: [app/src/components/ui/Toast.tsx](file:///c:/Users/USER/matinee-mobile/app/src/components/ui/Toast.tsx)
- **TypeScript Props**:
  ```typescript
  export type ToastType = 'info' | 'success' | 'error' | 'warning';

  export interface ToastProps {
    visible: boolean;
    message: string;
    type?: ToastType;
    onDismiss?: () => void;
    actionTitle?: string;
    onActionPress?: () => void;
    durationMs?: number;
    style?: StyleProp<ViewStyle>;
  }
  ```
- **Variants**: `info` (blue `#38BDF8`), `success` (green `#4ADE80`), `error` (crimson `#FF7185`), `warning` (amber `#F6BE63`).
- **Interactive States**: Auto-dismiss timer (default 4,000ms), interactive action button tap, dismiss swipe.
- **Design Tokens Used**: Dark elevated background `#292536`, `radii.md`, shadow strong, floating bottom position with safe area insets.
- **Accessibility**: Screen reader announcement via `accessibilityLiveRegion="assertive"` for errors, `"polite"` for info.
- **Test Coverage**: Tested in Component Gallery.
- **Validation Gaps**: Rapid consecutive toast queueing test.

---

### 11. EmptyState

- **Implementation Path**: [app/src/components/ui/EmptyState.tsx](file:///c:/Users/USER/matinee-mobile/app/src/components/ui/EmptyState.tsx)
- **TypeScript Props**:
  ```typescript
  export interface EmptyStateProps {
    iconName?: keyof typeof Ionicons.glyphMap;
    title: string;
    message: string;
    actionTitle?: string;
    onActionPress?: () => void;
    secondaryActionTitle?: string;
    onSecondaryActionPress?: () => void;
    style?: StyleProp<ViewStyle>;
  }
  ```
- **Design Tokens Used**: Centered layout, icon container background `#292536`, `colors.highlight`, heading 2 typography, secondary button styles.
- **Accessibility**: Clean hierarchical reading order: Icon $\to$ Title $\to$ Message $\to$ Action Button.
- **Test Coverage**: Verified in `test:seats` Suite 14 (No Search Results, No Bookings, 404 Route).
- **Validation Gaps**: None.

---

### 12. SeatMap

- **Implementation Path**: [app/src/components/seat-map/SeatMap.tsx](file:///c:/Users/USER/matinee-mobile/app/src/components/seat-map/SeatMap.tsx)
- **TypeScript Props**:
  ```typescript
  export interface SeatMapProps {
    layout: AuditoriumLayout;
    selectedSeatIds: Set<string>;
    onToggleSeat: (seat: SeatModel) => void;
    maxSeats?: number;
  }
  ```
- **Auditorium Scale**: Exactly **320 seats** arranged in 20 rows ($A$ through $V$, omitting $I$ and $O$) of 16 columns.
- **Supported Seat States & Colors**:
  - `AVAILABLE`: Obsidian surface with border.
  - `SELECTED`: Imperial gold (`#D4AF37`) with dark text.
  - `HELD`: Charcoal velvet (`#3A344D`, non-interactive).
  - `SOLD`: Dark muted with strike-through (`#1C1926`, non-interactive).
  - `ACCESSIBLE`: Row $A$ wheelchair icon.
  - `COUPLE`: Rows $S$–$V$ connected double pod with atomic partner selection.
- **Interactive Gestures**: Pinch-to-zoom and pan via React Native ScrollView and touch targets ($\ge 44\text{pt}$).
- **Accessibility**: `accessible={true}`, `accessibilityRole="button"`, `accessibilityLabel="Row {row}, Seat {col}, Tier {tier}, Price {price}, Status {status}"`.
- **Test Coverage**: Verified by 97 automated tests in `test-seat-selection.js` (Suites 1–15). Smoke-tested live on physical Samsung Galaxy S22.
- **Validation Gaps**: 60fps automated performance benchmark during rapid multi-touch zooming on low-end Android hardware.
