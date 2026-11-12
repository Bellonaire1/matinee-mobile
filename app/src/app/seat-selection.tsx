import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SeatMap } from '@/components/seat-map/SeatMap';
import { getMovieById } from '@/data/mockMovies';
import { LAGOS_CINEMAS } from '@/data/mockCinemas';
import {
  generateAuditoriumLayout,
  SeatModel,
  formatKoboToNgn,
  APPROVED_BASE_PRICE_KOBO,
} from '@/data/mockSeats';
import {
  toggleSeatSelection,
  calculateSelectionTotals,
  DEFAULT_MAX_SEATS_PER_BOOKING,
  formatSelectionModalSubtitle,
} from '@/data/seatSelectionEngine';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

const MAX_SEATS_PER_BOOKING = DEFAULT_MAX_SEATS_PER_BOOKING;

export default function SeatSelectionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    movieId?: string;
    cinemaId?: string;
    showtimeId?: string;
    date?: string;
  }>();

  // Validate parameters against typed catalog
  const movie = params.movieId ? getMovieById(params.movieId) : undefined;
  const cinema = params.cinemaId
    ? LAGOS_CINEMAS.find((c) => c.id === params.cinemaId)
    : undefined;

  const showtimeSlot = useMemo(() => {
    if (!cinema || !movie || !params.showtimeId) return undefined;
    const slots = cinema.showtimesByMovie[movie.id] || [];
    return slots.find((s) => s.id === params.showtimeId);
  }, [cinema, movie, params.showtimeId]);

  // Derive auditorium layout using approved tier pricing model (Standard base: ₦7,000 = 700,000 kobo)
  const auditorium = useMemo(() => {
    return generateAuditoriumLayout(APPROVED_BASE_PRICE_KOBO);
  }, []);

  // Local Selection State (Set of Seat IDs)
  const [selectedSeatIds, setSelectedSeatIds] = useState<Set<string>>(new Set());
  const [isNoticeModalVisible, setIsNoticeModalVisible] = useState(false);

  // Toggle seat selection with memoized callback and domain invariant enforcement
  const handleToggleSeat = useCallback(
    (seat: SeatModel) => {
      setSelectedSeatIds((prevSet) => {
        const result = toggleSeatSelection(
          prevSet,
          seat,
          auditorium.seatsById,
          MAX_SEATS_PER_BOOKING
        );

        if (!result.success) {
          Alert.alert(
            result.error === 'MAX_LIMIT_EXCEEDED'
              ? 'Maximum Seats Reached'
              : result.error === 'PARTNER_UNAVAILABLE'
              ? 'Couple Pod Unavailable'
              : 'Seat Unavailable',
            result.message
          );
          return prevSet;
        }

        return result.selectedIds;
      });
    },
    [auditorium.seatsById]
  );

  // Derived Selection Calculations via Pure Engine
  const selectionTotals = useMemo(() => {
    return calculateSelectionTotals(selectedSeatIds, auditorium.seatsById);
  }, [selectedSeatIds, auditorium.seatsById]);

  const selectedSeatsList = selectionTotals.selectedSeats;
  const totalKobo = selectionTotals.totalKobo;
  const selectedSeatLabels = selectionTotals.seatLabels;

  // Graceful Handling for Invalid Session Parameters
  if (!movie || !cinema || !showtimeSlot) {
    return (
      <SafeAreaView style={styles.notFoundContainer}>
        <EmptyState
          iconName="alert-circle-outline"
          title="Invalid Session"
          message="The selected cinema, movie, or showtime session could not be verified."
          actionTitle="Back to Showtimes"
          onActionPress={() => router.back()}
          secondaryActionTitle="Discover Movies"
          onSecondaryActionPress={() => router.replace('/')}
        />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top Header Bar */}
      <SafeAreaView edges={['top']} style={styles.topHeader}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.back()}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Go back to showtimes"
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerInfoCol}>
          <Text variant="heading2" color="textPrimary" numberOfLines={1}>
            {movie.title}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {cinema.name} • {showtimeSlot.time} ({showtimeSlot.format})
          </Text>
        </View>

        <View style={styles.hallBadge}>
          <Badge label="320 SEATS" variant="format" size="sm" />
        </View>
      </SafeAreaView>

      {/* Local Selection Notice Pill */}
      <View style={styles.localNoticeBanner}>
        <Ionicons name="shield-checkmark-outline" size={14} color={colors.primary} />
        <Text variant="caption" color="primary" style={styles.localNoticeText}>
          Local Seat Selection Demo • Prices stored in minor units (kobo)
        </Text>
      </View>

      {/* Main Content Area */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: selectedSeatsList.length > 0 ? 150 + insets.bottom : 80 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <SeatMap
          layout={auditorium}
          selectedSeatIds={selectedSeatIds}
          onToggleSeat={handleToggleSeat}
          maxSeats={MAX_SEATS_PER_BOOKING}
        />
      </ScrollView>

      {/* Sticky Booking Summary Footer */}
      <View
        style={[
          styles.stickyFooter,
          { paddingBottom: Math.max(insets.bottom, 16) },
        ]}
      >
        {selectedSeatsList.length > 0 ? (
          <View style={styles.selectionSummaryRow}>
            <View style={styles.selectedPillsCol}>
              <View style={styles.countBadgeRow}>
                <Badge
                  label={`${selectedSeatsList.length} ${
                    selectedSeatsList.length === 1 ? 'Seat' : 'Seats'
                  } Selected`}
                  variant="highlight"
                  size="sm"
                />
                <Text variant="caption" color="textSecondary">
                  (Max {MAX_SEATS_PER_BOOKING})
                </Text>
              </View>

              <Text
                variant="supporting"
                color="textPrimary"
                numberOfLines={1}
                style={styles.seatPillsText}
              >
                Seats: {selectedSeatLabels}
              </Text>
            </View>

            <View style={styles.totalCol}>
              <Text variant="caption" color="textSecondary" align="right">
                Estimated Total
              </Text>
              <Text variant="heading2" color="primary" align="right" style={styles.totalPrice}>
                {formatKoboToNgn(totalKobo)}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.emptyPromptRow}>
            <Ionicons name="information-circle-outline" size={20} color={colors.textSecondary} />
            <Text variant="supporting" color="textSecondary">
              Tap available seats to select. Up to 8 seats per booking.
            </Text>
          </View>
        )}

        {/* Continue Action */}
        <Button
          title={
            selectedSeatsList.length > 0
              ? `Continue (${formatKoboToNgn(totalKobo)})`
              : 'Select at least 1 seat'
          }
          variant="primary"
          size="lg"
          disabled={selectedSeatsList.length === 0}
          iconRight={
            <Ionicons
              name="arrow-forward"
              size={18}
              color={selectedSeatsList.length > 0 ? colors.background : colors.textSecondary}
            />
          }
          onPress={() => setIsNoticeModalVisible(true)}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Continue to checkout notice"
          accessibilityHint="Proceeds with current seat selection"
        />
      </View>

      {/* Booking Safety Modal (Notice that checkout is not yet implemented) */}
      <Modal
        visible={isNoticeModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsNoticeModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Card variant="surface" padding="base" style={styles.modalCard}>
            <View style={styles.modalIconBox}>
              <Ionicons name="checkmark-done-circle" size={40} color={colors.primary} />
            </View>

            <Text variant="heading1" color="textPrimary" align="center" style={styles.modalTitle}>
              Local Selection Complete
            </Text>

            <Text variant="body" color="textSecondary" align="center" style={styles.modalSubtitle}>
              {formatSelectionModalSubtitle(selectedSeatsList.length, movie.title)}
            </Text>

            {/* Itemized Selection Summary */}
            <View style={styles.modalReceipt}>
              <View style={styles.receiptRow}>
                <Text variant="supporting" color="textSecondary">
                  Seats:
                </Text>
                <Text variant="supporting" color="textPrimary" style={styles.receiptBold}>
                  {selectedSeatLabels}
                </Text>
              </View>

              <View style={styles.receiptRow}>
                <Text variant="supporting" color="textSecondary">
                  Auditorium:
                </Text>
                <Text variant="supporting" color="textPrimary">
                  {auditorium.hallName}
                </Text>
              </View>

              <View style={styles.receiptRow}>
                <Text variant="supporting" color="textSecondary">
                  Cinema:
                </Text>
                <Text variant="supporting" color="textPrimary">
                  {cinema.name} ({cinema.neighborhood})
                </Text>
              </View>

              <View style={styles.receiptDivider} />

              <View style={styles.receiptRow}>
                <Text variant="body" color="textPrimary" style={styles.receiptBold}>
                  Estimated Amount:
                </Text>
                <Text variant="heading2" color="primary">
                  {formatKoboToNgn(totalKobo)}
                </Text>
              </View>
            </View>

            {/* Architecture Invariant Label */}
            <View style={styles.modalSafetyBox}>
              <Ionicons name="shield-outline" size={16} color={colors.highlight} />
              <Text variant="caption" color="textSecondary" style={styles.modalSafetyText}>
                Task M04.3 establishes local interactive seat selection only. Backend atomic Redis holds, database double-booking locks, and payment checkout will be implemented in subsequent modules.
              </Text>
            </View>

            <View style={styles.modalActionsRow}>
              <Button
                title="Keep Selecting"
                variant="secondary"
                size="md"
                onPress={() => setIsNoticeModalVisible(false)}
                style={styles.modalBackBtn}
              />
              <Button
                title="Back to Home"
                variant="primary"
                size="md"
                onPress={() => {
                  setIsNoticeModalVisible(false);
                  router.replace('/');
                }}
                style={styles.modalHomeBtn}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  notFoundContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
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
    width: 44, // WCAG 44pt touch target
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
  hallBadge: {
    alignSelf: 'center',
  },
  localNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(183, 138, 247, 0.08)',
    paddingHorizontal: spacing.base,
    paddingVertical: 6,
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderColor: 'rgba(183, 138, 247, 0.2)',
  },
  localNoticeText: {
    fontWeight: '500',
    fontSize: 11,
  },
  scrollContent: {
    paddingTop: spacing.xs,
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    elevation: 16,
  },
  selectionSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  selectedPillsCol: {
    flex: 1,
    marginRight: spacing.sm,
  },
  countBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
  },
  seatPillsText: {
    fontWeight: '700',
  },
  totalCol: {
    alignItems: 'flex-end',
  },
  totalPrice: {
    fontWeight: '800',
  },
  emptyPromptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingVertical: spacing.xs,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.base,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  modalIconBox: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.base,
  },
  modalTitle: {
    fontWeight: '800',
    marginBottom: 2,
  },
  modalSubtitle: {
    marginBottom: spacing.base,
  },
  modalReceipt: {
    width: '100%',
    backgroundColor: colors.elevated,
    borderRadius: radii.md,
    padding: spacing.base,
    gap: spacing.xs,
    marginBottom: spacing.base,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptBold: {
    fontWeight: '700',
  },
  receiptDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  modalSafetyBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: 'rgba(246, 190, 99, 0.08)',
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(246, 190, 99, 0.25)',
    marginBottom: spacing.xl,
  },
  modalSafetyText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  modalBackBtn: {
    flex: 1,
  },
  modalHomeBtn: {
    flex: 1,
  },
});

