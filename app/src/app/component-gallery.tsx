import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { SearchBar } from '@/components/ui/SearchBar';
import { MovieCard } from '@/components/ui/MovieCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { Toast, ToastType } from '@/components/ui/Toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { SeatLegend } from '@/components/seat-map/SeatLegend';
import { SeatMap } from '@/components/seat-map/SeatMap';
import { MOCK_FEATURED_MOVIE, MOCK_COMING_SOON_MOVIES } from '@/data/mockMovies';
import { generateAuditoriumLayout, APPROVED_BASE_PRICE_KOBO, SeatModel } from '@/data/mockSeats';
import { toggleSeatSelection, DEFAULT_MAX_SEATS_PER_BOOKING } from '@/data/seatSelectionEngine';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export default function ComponentGalleryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Interactive state demos
  const [buttonClickCount, setButtonClickCount] = useState(0);
  const [selectedChipIndex, setSelectedChipIndex] = useState(0);
  const [inputText, setInputText] = useState('Dune: Part Two');
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [toastConfig, setToastConfig] = useState<{
    visible: boolean;
    message: string;
    type: ToastType;
  }>({
    visible: false,
    message: '',
    type: 'info',
  });

  // Lazy mounting for SeatMap test bench (prevents heavy mount until user toggles)
  const [isSeatMapMounted, setIsSeatMapMounted] = useState(false);
  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<string>>(new Set());

  // Reuse existing 320-seat layout
  const auditorium = useMemo(() => {
    return generateAuditoriumLayout(APPROVED_BASE_PRICE_KOBO);
  }, []);

  const handleToggleSeat = (seat: SeatModel) => {
    setSelectedSeatIds((prevSet) => {
      const result = toggleSeatSelection(
        prevSet,
        seat,
        auditorium.seatsById,
        DEFAULT_MAX_SEATS_PER_BOOKING
      );
      return result.success ? result.selectedIds : prevSet;
    });
  };

  const showToast = (type: ToastType, message: string) => {
    setToastConfig({
      visible: true,
      message,
      type,
    });
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top Header */}
      <SafeAreaView edges={['top']} style={styles.topHeader}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.back()}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Go back to profile"
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerInfoCol}>
          <Text variant="heading2" color="textPrimary" numberOfLines={1}>
            Component Gallery
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            Design System Showcase &bull; SCR-11
          </Text>
        </View>

        <Badge label="DEV TOOLS" variant="highlight" size="sm" />
      </SafeAreaView>

      {/* Active Floating Toast Notification */}
      <View style={styles.toastOverlay}>
        <Toast
          visible={toastConfig.visible}
          type={toastConfig.type}
          message={toastConfig.message}
          onDismiss={() => setToastConfig((prev) => ({ ...prev, visible: false }))}
        />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 60 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Category 1: Typography / Text */}
        <Card variant="surface" padding="base" style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="text-outline" size={20} color={colors.primary} />
            <Text variant="heading2" color="textPrimary" style={styles.sectionTitle}>
              1. Typography &amp; Text Variants
            </Text>
          </View>
          <Text variant="caption" color="textSecondary">
            Cinema After Dark typography scale powered by Inter fonts:
          </Text>

          <View style={styles.typographyStack}>
            <Text variant="display" color="textPrimary">
              Display Large (32pt)
            </Text>
            <Text variant="heading1" color="textPrimary">
              Heading 1 (28pt)
            </Text>
            <Text variant="heading2" color="primary">
              Heading 2 (22pt Accent)
            </Text>
            <Text variant="body" color="textPrimary">
              Body Regular (16pt): Paul Atreides unites with Chani and the Fremen while seeking revenge.
            </Text>
            <Text variant="supporting" color="textSecondary">
              Supporting Text (14pt): Filmhouse IMAX Lekki &bull; 13:30 (IMAX 2D Laser)
            </Text>
            <Text variant="caption" color="highlight">
              Caption Medium (12pt Highlight): Standard Seating &bull; Rows B&ndash;J &bull; ₦7,000
            </Text>
          </View>
        </Card>

        {/* Category 2: Buttons */}
        <Card variant="surface" padding="base" style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="hand-left-outline" size={20} color={colors.primary} />
            <Text variant="heading2" color="textPrimary" style={styles.sectionTitle}>
              2. Button Variants, Sizes &amp; States
            </Text>
          </View>

          <View style={styles.buttonGrid}>
            <Button
              title={`Primary Action (${buttonClickCount} taps)`}
              variant="primary"
              size="md"
              iconRight={<Ionicons name="sparkles" size={16} color={colors.background} />}
              onPress={() => {
                setButtonClickCount((c) => c + 1);
                showToast('success', `Interactive button clicked (${buttonClickCount + 1} times)!`);
              }}
            />

            <Button
              title="Secondary Action"
              variant="secondary"
              size="md"
              onPress={() => showToast('info', 'Secondary button tapped')}
            />

            <Button
              title="Outline Action"
              variant="outline"
              size="md"
              onPress={() => showToast('warning', 'Outline action triggered')}
            />

            <Button
              title="Ghost Action"
              variant="ghost"
              size="sm"
              onPress={() => showToast('info', 'Ghost button tapped')}
            />

            <Button
              title="Disabled State"
              variant="primary"
              size="md"
              disabled={true}
            />
          </View>
        </Card>

        {/* Category 3: Cards */}
        <Card variant="surface" padding="base" style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="albums-outline" size={20} color={colors.primary} />
            <Text variant="heading2" color="textPrimary" style={styles.sectionTitle}>
              3. Card Surfaces &amp; Elevation
            </Text>
          </View>

          <Card variant="surface" padding="sm" style={styles.subCard}>
            <Text variant="supporting" color="textPrimary" style={styles.boldText}>
              Surface Card (Default)
            </Text>
            <Text variant="caption" color="textSecondary">
              Base surface background with subtle obsidian borders.
            </Text>
          </Card>

          <Card variant="elevated" padding="sm" style={styles.subCard}>
            <Text variant="supporting" color="primary" style={styles.boldText}>
              Elevated Card
            </Text>
            <Text variant="caption" color="textSecondary">
              Higher visual elevation with elevated contrast for focus panels.
            </Text>
          </Card>
        </Card>

        {/* Category 4: MovieCards */}
        <Card variant="surface" padding="base" style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="film-outline" size={20} color={colors.primary} />
            <Text variant="heading2" color="textPrimary" style={styles.sectionTitle}>
              4. MovieCards (2:3 Aspect Ratio)
            </Text>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.movieCardsRow}>
            <MovieCard
              movie={MOCK_FEATURED_MOVIE}
              onPress={(m) => showToast('info', `Selected movie: ${m.title}`)}
            />
            {MOCK_COMING_SOON_MOVIES.length > 0 && (
              <MovieCard
                movie={MOCK_COMING_SOON_MOVIES[0]}
                onPress={(m) => showToast('info', `Coming soon: ${m.title}`)}
              />
            )}
          </ScrollView>
        </Card>

        {/* Category 5: Inputs */}
        <Card variant="surface" padding="base" style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="create-outline" size={20} color={colors.primary} />
            <Text variant="heading2" color="textPrimary" style={styles.sectionTitle}>
              5. Input Fields &amp; Search Bars
            </Text>
          </View>

          <Input
            label="Default Text Input"
            placeholder="Enter full name..."
            value={inputText}
            onChangeText={setInputText}
            iconLeft={<Ionicons name="person-outline" size={18} color={colors.textSecondary} />}
          />

          <Input
            label="Input with Error State"
            placeholder="name@cinema.ng"
            value="invalid-email"
            error="Please enter a valid cinema email address."
            iconLeft={<Ionicons name="mail-outline" size={18} color={colors.error} />}
          />

          <Input
            label="Disabled Input"
            value="Lagos, Nigeria (Fixed Location)"
            disabled={true}
            iconLeft={<Ionicons name="location-outline" size={18} color={colors.textSecondary} />}
          />

          <SearchBar
            placeholder="Search bar with clear action..."
            value="Sci-Fi Blockbusters"
            onChangeText={() => {}}
            onClear={() => showToast('info', 'Search cleared')}
          />
        </Card>

        {/* Category 6: Chips */}
        <Card variant="surface" padding="base" style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="pricetag-outline" size={20} color={colors.primary} />
            <Text variant="heading2" color="textPrimary" style={styles.sectionTitle}>
              6. Interactive Chips &amp; Filter States
            </Text>
          </View>

          <View style={styles.chipWrapRow}>
            {['All', 'IMAX', 'VIP Recliner', 'Couple Pod', 'Accessible'].map((label, idx) => (
              <Chip
                key={label}
                label={label}
                selected={selectedChipIndex === idx}
                onPress={() => setSelectedChipIndex(idx)}
              />
            ))}
          </View>
        </Card>

        {/* Category 7: Badges */}
        <Card variant="surface" padding="base" style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="ribbon-outline" size={20} color={colors.primary} />
            <Text variant="heading2" color="textPrimary" style={styles.sectionTitle}>
              7. Badges &amp; Format Indicators
            </Text>
          </View>

          <View style={styles.badgesWrapRow}>
            <Badge label="IMAX 2D Laser" variant="format" size="md" />
            <Badge label="8.8" variant="rating" size="md" icon={<Ionicons name="star" size={12} color={colors.highlight} />} />
            <Badge label="DEMO PREVIEW" variant="highlight" size="md" />
            <Badge label="CONFIRMED" variant="status" size="md" />
            <Badge label="ACCESSIBLE" variant="outline" size="md" />
          </View>
        </Card>

        {/* Category 8: BottomSheets */}
        <Card variant="surface" padding="base" style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="layers-outline" size={20} color={colors.primary} />
            <Text variant="heading2" color="textPrimary" style={styles.sectionTitle}>
              8. BottomSheets &amp; Modal Overlays
            </Text>
          </View>
          <Text variant="caption" color="textSecondary">
            Lightweight, animated bottom-anchored modal with drag handle and safe area insets:
          </Text>

          <Button
            title="Open Interactive BottomSheet"
            variant="outline"
            size="md"
            iconRight={<Ionicons name="arrow-up-circle-outline" size={16} color={colors.primary} />}
            onPress={() => setIsBottomSheetOpen(true)}
          />
        </Card>

        {/* Category 9: Skeletons */}
        <Card variant="surface" padding="base" style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="pulse-outline" size={20} color={colors.primary} />
            <Text variant="heading2" color="textPrimary" style={styles.sectionTitle}>
              9. Skeleton Shimmer Placeholders
            </Text>
          </View>

          <View style={styles.skeletonDemoBox}>
            <View style={styles.skeletonAvatarRow}>
              <Skeleton variant="circle" width={48} height={48} />
              <View style={styles.skeletonLinesCol}>
                <Skeleton variant="line" width="70%" height={14} />
                <Skeleton variant="line" width="45%" height={12} />
              </View>
            </View>
            <Skeleton variant="card" width="100%" height={70} />
          </View>
        </Card>

        {/* Category 10: Toasts */}
        <Card variant="surface" padding="base" style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="notifications-outline" size={20} color={colors.primary} />
            <Text variant="heading2" color="textPrimary" style={styles.sectionTitle}>
              10. Toast Notification Banners
            </Text>
          </View>

          <View style={styles.toastTriggerRow}>
            <Button
              title="Success Toast"
              variant="outline"
              size="sm"
              onPress={() => showToast('success', 'Seats held successfully for 10 minutes.')}
            />
            <Button
              title="Error Toast"
              variant="outline"
              size="sm"
              onPress={() => showToast('error', 'Seat was claimed by another customer.')}
            />
            <Button
              title="Warning Toast"
              variant="outline"
              size="sm"
              onPress={() => showToast('warning', '2 minutes remaining to complete hold.')}
            />
            <Button
              title="Info Toast"
              variant="outline"
              size="sm"
              onPress={() => showToast('info', 'Wheelchair seats include free companion slot.')}
            />
          </View>
        </Card>

        {/* Category 11: EmptyStates */}
        <Card variant="surface" padding="base" style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="cube-outline" size={20} color={colors.primary} />
            <Text variant="heading2" color="textPrimary" style={styles.sectionTitle}>
              11. EmptyState Layouts
            </Text>
          </View>

          <EmptyState
            iconName="cloud-offline-outline"
            title="Simulated Offline State"
            message="This demonstrates how Matinee renders network interruption with a retry action."
            actionTitle="Simulate Reconnect"
            onActionPress={() => showToast('success', 'Network simulation reconnected!')}
          />
        </Card>

        {/* Category 12: SeatMap */}
        <Card variant="surface" padding="base" style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <Ionicons name="grid-outline" size={20} color={colors.primary} />
            <Text variant="heading2" color="textPrimary" style={styles.sectionTitle}>
              12. Auditorium SeatMap &amp; Legend
            </Text>
          </View>
          <Text variant="caption" color="textSecondary">
            Reuses the 320-seat auditorium engine (Standard, VIP, Couple, Wheelchair):
          </Text>

          <SeatLegend />

          {!isSeatMapMounted ? (
            <Button
              title="Mount Interactive 320-Seat Map Test Bench"
              variant="secondary"
              size="md"
              iconRight={<Ionicons name="expand-outline" size={16} color={colors.textPrimary} />}
              onPress={() => setIsSeatMapMounted(true)}
              style={styles.mountSeatBtn}
            />
          ) : (
            <View style={styles.seatMapWrapper}>
              <View style={styles.seatMapNotice}>
                <Text variant="caption" color="primary">
                  Interactive Test Bench Active ({selectedSeatIds.size} seats selected)
                </Text>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setIsSeatMapMounted(false)}
                >
                  <Text variant="caption" color="textSecondary" style={styles.boldText}>
                    Collapse
                  </Text>
                </TouchableOpacity>
              </View>

              <SeatMap
                layout={auditorium}
                selectedSeatIds={selectedSeatIds}
                onToggleSeat={handleToggleSeat}
              />
            </View>
          )}
        </Card>
      </ScrollView>

      {/* Interactive BottomSheet Instance */}
      <BottomSheet
        visible={isBottomSheetOpen}
        onClose={() => setIsBottomSheetOpen(false)}
        title="Sample Design System BottomSheet"
      >
        <View style={styles.sheetContent}>
          <Text variant="body" color="textPrimary">
            This BottomSheet is fully working and responsive. It anchors to the bottom of the display and dismisses cleanly via swipe, close icon, or backdrop tap.
          </Text>
          <Button
            title="Close Sheet"
            variant="primary"
            size="md"
            onPress={() => setIsBottomSheetOpen(false)}
            style={styles.sheetBtn}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topHeader: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.full,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerInfoCol: {
    flex: 1,
  },
  toastOverlay: {
    position: 'absolute',
    top: 90,
    left: spacing.base,
    right: spacing.base,
    zIndex: 999,
  },
  scrollContent: {
    padding: spacing.base,
    gap: spacing.base,
  },
  sectionCard: {
    gap: spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  sectionTitle: {
    fontWeight: '700',
  },
  typographyStack: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  buttonGrid: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  subCard: {
    gap: 2,
  },
  boldText: {
    fontWeight: '700',
  },
  movieCardsRow: {
    gap: spacing.base,
    paddingVertical: spacing.xs,
  },
  chipWrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  badgesWrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    alignItems: 'center',
  },
  skeletonDemoBox: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  skeletonAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  skeletonLinesCol: {
    flex: 1,
    gap: spacing.xs,
  },
  toastTriggerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  mountSeatBtn: {
    marginTop: spacing.xs,
  },
  seatMapWrapper: {
    height: 480,
    marginTop: spacing.xs,
  },
  seatMapNotice: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: spacing.xs,
  },
  sheetContent: {
    gap: spacing.base,
    paddingTop: spacing.xs,
  },
  sheetBtn: {
    marginTop: spacing.sm,
  },
});
