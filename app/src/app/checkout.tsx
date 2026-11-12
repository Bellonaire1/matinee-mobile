import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { generateAuditoriumLayout, APPROVED_BASE_PRICE_KOBO } from '@/data/mockSeats';
import { formatSeatCount } from '@/data/seatSelectionEngine';
import {
  validateCheckoutContext,
  CHECKOUT_DEMO_DISCLAIMER,
  CHECKOUT_DEMO_SUBTEXT,
  DEMO_CHECKOUT_STATES,
  DemoCheckoutState,
} from '@/data/checkoutEngine';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export default function CheckoutPreviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    movieId?: string;
    cinemaId?: string;
    showtimeId?: string;
    seatIds?: string;
  }>();

  // Active demonstration modal state
  const [activeDemoState, setActiveDemoState] = useState<DemoCheckoutState>('none');

  // Derive auditorium domain model with approved tier base pricing
  const auditorium = useMemo(() => {
    return generateAuditoriumLayout(APPROVED_BASE_PRICE_KOBO);
  }, []);

  // Validate session context and recalculate estimates strictly from pure engine
  const validationResult = useMemo(() => {
    return validateCheckoutContext(
      params,
      auditorium.seatsById,
      auditorium.hallName
    );
  }, [params, auditorium]);

  // Graceful Handling for Invalid or Missing Selection Parameters
  if (!validationResult.isValid) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topHeader}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.back()}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={styles.backBtn}
          >
            <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text variant="heading2" color="textPrimary">
            Checkout Preview
          </Text>
        </View>

        <EmptyState
          iconName="alert-circle-outline"
          title="Invalid Checkout Session"
          message={validationResult.errorMessage}
          actionTitle="Back to Seat Selection"
          onActionPress={() => router.back()}
          secondaryActionTitle="Discover Movies"
          onSecondaryActionPress={() => router.replace('/')}
        />
      </SafeAreaView>
    );
  }

  const {
    movie,
    cinema,
    showtime,
    auditoriumName,
    selectionTotals,
    tierReceipts,
    formattedTotal,
  } = validationResult;

  const demoStateMeta =
    activeDemoState !== 'none' ? DEMO_CHECKOUT_STATES[activeDemoState] : null;

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
          accessibilityLabel="Go back to seat selection"
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerInfoCol}>
          <Text variant="heading2" color="textPrimary" numberOfLines={1}>
            Checkout Preview
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            Demo &bull; Non-Transactional Simulation
          </Text>
        </View>

        <Badge label="DEMO" variant="highlight" size="sm" />
      </SafeAreaView>

      {/* Prominent Demo Disclaimer Banner */}
      <View style={styles.demoDisclaimerBanner}>
        <View style={styles.bannerIconBox}>
          <Ionicons name="information-circle" size={18} color={colors.highlight} />
        </View>
        <View style={styles.bannerTextBox}>
          <Text variant="caption" color="textPrimary" style={styles.bannerTitle}>
            {CHECKOUT_DEMO_DISCLAIMER}
          </Text>
          <Text variant="caption" color="textSecondary" style={styles.bannerSubtext}>
            {CHECKOUT_DEMO_SUBTEXT}
          </Text>
        </View>
      </View>

      {/* Scrollable Content */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Booking Summary Card */}
        <Card variant="surface" padding="base" style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="film-outline" size={18} color={colors.primary} />
            <Text variant="heading2" color="textPrimary" style={styles.cardTitle}>
              Film &amp; Showtime Summary
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text variant="supporting" color="textSecondary" style={styles.detailLabel}>
              Film Title:
            </Text>
            <Text variant="body" color="textPrimary" style={styles.detailValueBold}>
              {movie.title}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text variant="supporting" color="textSecondary" style={styles.detailLabel}>
              Cinema &amp; Hall:
            </Text>
            <Text variant="supporting" color="textPrimary" style={styles.detailValue}>
              {cinema.name} ({cinema.neighborhood}) &bull; {auditoriumName}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text variant="supporting" color="textSecondary" style={styles.detailLabel}>
              Showtime Session:
            </Text>
            <View style={styles.showtimeBadgeRow}>
              <Badge label={showtime.time} variant="highlight" size="sm" />
              <Badge label={showtime.format} variant="format" size="sm" />
            </View>
          </View>

          <View style={styles.detailRow}>
            <Text variant="supporting" color="textSecondary" style={styles.detailLabel}>
              Rating &amp; Runtime:
            </Text>
            <Text variant="caption" color="textSecondary" style={styles.detailValue}>
              {movie.rating} &bull; {movie.runtime} &bull; {movie.genres.join(', ')}
            </Text>
          </View>
        </Card>

        {/* Selected Seats Breakdown */}
        <Card variant="surface" padding="base" style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="grid-outline" size={18} color={colors.primary} />
            <Text variant="heading2" color="textPrimary" style={styles.cardTitle}>
              Selected Seats ({formatSeatCount(selectionTotals.count)})
            </Text>
          </View>

          <View style={styles.seatPillsWrap}>
            {selectionTotals.selectedSeats.map((seat) => {
              const tierBadgeVariant =
                seat.tier === 'vip'
                  ? 'rating'
                  : seat.tier === 'couple'
                  ? 'highlight'
                  : seat.tier === 'accessible'
                  ? 'outline'
                  : 'format';

              return (
                <View key={seat.id} style={styles.seatChip}>
                  <Text variant="supporting" color="textPrimary" style={styles.seatChipLabel}>
                    {seat.displayLabel}
                  </Text>
                  <Badge
                    label={
                      seat.tier === 'vip'
                        ? 'VIP'
                        : seat.tier === 'couple'
                        ? 'Couple'
                        : seat.tier === 'accessible'
                        ? 'Access'
                        : 'Standard'
                    }
                    variant={tierBadgeVariant}
                    size="sm"
                  />
                </View>
              );
            })}
          </View>

          <View style={styles.seatsSummaryTextRow}>
            <Text variant="caption" color="textSecondary">
              All seats: {selectionTotals.seatLabels}
            </Text>
          </View>
        </Card>

        {/* Itemized Price Breakdown */}
        <Card variant="surface" padding="base" style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="receipt-outline" size={18} color={colors.primary} />
            <Text variant="heading2" color="textPrimary" style={styles.cardTitle}>
              Estimated Price Breakdown
            </Text>
          </View>

          {tierReceipts.map((receipt) => (
            <View key={receipt.tier} style={styles.receiptLineRow}>
              <View style={styles.receiptLabelCol}>
                <Text variant="supporting" color="textPrimary">
                  {receipt.count} &times; {receipt.label}
                </Text>
                <Text variant="caption" color="textSecondary">
                  @{receipt.formattedPricePerSeat} each
                </Text>
              </View>
              <Text variant="supporting" color="textPrimary" style={styles.receiptAmount}>
                {receipt.formattedSubtotal}
              </Text>
            </View>
          ))}

          <View style={styles.receiptLineRow}>
            <Text variant="supporting" color="textSecondary">
              Convenience Fee (Preview):
            </Text>
            <Text variant="supporting" color="highlight" style={styles.receiptAmount}>
              &#8358;0 (Free Demo)
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.totalRow}>
            <View>
              <Text variant="body" color="textPrimary" style={styles.totalTitle}>
                Estimated Total
              </Text>
              <Text variant="caption" color="textSecondary">
                Calculated via approved tier pricing engine
              </Text>
            </View>
            <Text variant="heading1" color="primary" style={styles.totalAmount}>
              {formattedTotal}
            </Text>
          </View>
        </Card>

        {/* Demonstration States Playground */}
        <Card variant="elevated" padding="base" style={styles.demoPlaygroundCard}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="flask-outline" size={18} color={colors.highlight} />
            <Text variant="heading2" color="textPrimary" style={styles.cardTitle}>
              Simulate UI Demonstration States
            </Text>
          </View>
          <Text variant="caption" color="textSecondary" style={styles.demoSectionNote}>
            Explore how Matinee renders asynchronous checkout outcomes without charging real money or altering auditorium holds:
          </Text>

          <View style={styles.demoButtonsStack}>
            {/* 1. Pending Verification Demo */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setActiveDemoState('pending')}
              style={styles.demoActionTile}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="View payment verification pending demo"
            >
              <View style={[styles.demoTileIconBox, { backgroundColor: 'rgba(246, 190, 99, 0.15)' }]}>
                <Ionicons name="hourglass-outline" size={20} color={colors.highlight} />
              </View>
              <View style={styles.demoTileTextBox}>
                <View style={styles.demoTileHeader}>
                  <Text variant="supporting" color="textPrimary" style={styles.demoTileTitle}>
                    1. Payment Verification Pending
                  </Text>
                  <Badge label="Pending" variant="highlight" size="sm" />
                </View>
                <Text variant="caption" color="textSecondary">
                  Preview simulated polling/webhook confirmation screen.
                </Text>
              </View>
            </TouchableOpacity>

            {/* 2. Payment Failed Demo */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setActiveDemoState('failed')}
              style={styles.demoActionTile}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="View payment authorization failed demo"
            >
              <View style={[styles.demoTileIconBox, { backgroundColor: 'rgba(244, 67, 54, 0.15)' }]}>
                <Ionicons name="alert-circle-outline" size={20} color="#F44336" />
              </View>
              <View style={styles.demoTileTextBox}>
                <View style={styles.demoTileHeader}>
                  <Text variant="supporting" color="textPrimary" style={styles.demoTileTitle}>
                    2. Payment Authorization Failed
                  </Text>
                  <Badge label="Declined" variant="status" size="sm" />
                </View>
                <Text variant="caption" color="textSecondary">
                  Preview simulated bank card decline and retry flow.
                </Text>
              </View>
            </TouchableOpacity>

            {/* 3. Seat Selection Expired Demo */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setActiveDemoState('expired')}
              style={styles.demoActionTile}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="View seat selection expired demo"
            >
              <View style={[styles.demoTileIconBox, { backgroundColor: 'rgba(183, 138, 247, 0.15)' }]}>
                <Ionicons name="time-outline" size={20} color={colors.primary} />
              </View>
              <View style={styles.demoTileTextBox}>
                <View style={styles.demoTileHeader}>
                  <Text variant="supporting" color="textPrimary" style={styles.demoTileTitle}>
                    3. Seat Selection Expired
                  </Text>
                  <Badge label="Timeout" variant="outline" size="sm" />
                </View>
                <Text variant="caption" color="textSecondary">
                  Preview simulated 10-minute hold release recovery.
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </Card>
      </ScrollView>

      {/* Sticky Bottom Actions Footer */}
      <View style={[styles.stickyFooter, { paddingBottom: Math.max(insets.bottom, spacing.base) }]}>
        <View style={styles.footerPriceRow}>
          <View>
            <Text variant="caption" color="textSecondary">
              Estimated Total ({formatSeatCount(selectionTotals.count)})
            </Text>
            <Text variant="heading1" color="primary" style={styles.footerPriceText}>
              {formattedTotal}
            </Text>
          </View>

          <Button
            title="Explore Demo States"
            variant="primary"
            size="md"
            iconRight={<Ionicons name="sparkles-outline" size={16} color={colors.background} />}
            onPress={() => setActiveDemoState('pending')}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Explore demo payment verification states"
          />
        </View>
      </View>

      {/* Full Modal for Demonstration States */}
      {demoStateMeta && (
        <Modal
          visible={activeDemoState !== 'none'}
          transparent
          animationType="fade"
          onRequestClose={() => setActiveDemoState('none')}
        >
          <View style={styles.modalBackdrop}>
            <Card variant="surface" padding="base" style={styles.modalCard}>
              {/* Demo Badge */}
              <View style={styles.modalBadgeRow}>
                <Badge label={demoStateMeta.badgeLabel} variant="highlight" size="sm" />
              </View>

              {/* State Icon */}
              <View style={[styles.modalIconBox, { borderColor: demoStateMeta.iconColor }]}>
                {activeDemoState === 'pending' ? (
                  <ActivityIndicator size="large" color={demoStateMeta.iconColor} />
                ) : (
                  <Ionicons
                    name={demoStateMeta.iconName}
                    size={38}
                    color={demoStateMeta.iconColor}
                  />
                )}
              </View>

              {/* State Title & Description */}
              <Text variant="heading1" color="textPrimary" align="center" style={styles.modalTitle}>
                {demoStateMeta.title}
              </Text>
              <Text variant="body" color="textSecondary" align="center" style={styles.modalSubtitle}>
                {demoStateMeta.description}
              </Text>

              {/* Simulated Transaction Info Box */}
              <View style={styles.modalContextBox}>
                <View style={styles.contextLine}>
                  <Text variant="caption" color="textSecondary">
                    Simulated Session:
                  </Text>
                  <Text variant="caption" color="textPrimary" style={styles.contextValueBold}>
                    DEMO-{movie.id.toUpperCase()}-7729
                  </Text>
                </View>

                <View style={styles.contextLine}>
                  <Text variant="caption" color="textSecondary">
                    Selected Seats:
                  </Text>
                  <Text variant="caption" color="textPrimary" style={styles.contextValueBold}>
                    {selectionTotals.seatLabels}
                  </Text>
                </View>

                <View style={styles.contextLine}>
                  <Text variant="caption" color="textSecondary">
                    Simulated Amount:
                  </Text>
                  <Text variant="caption" color="primary" style={styles.contextValueBold}>
                    {formattedTotal}
                  </Text>
                </View>
              </View>

              {/* Technical / Architecture Explanation */}
              <View style={styles.modalExplanationBox}>
                <Ionicons name="information-circle-outline" size={16} color={colors.highlight} />
                <Text variant="caption" color="textSecondary" style={styles.modalExplanationText}>
                  {demoStateMeta.explanation}
                </Text>
              </View>

              {/* State Action Buttons */}
              <View style={styles.modalActionsCol}>
                {activeDemoState === 'pending' && (
                  <Button
                    title="Simulate Card Declined State"
                    variant="secondary"
                    size="md"
                    onPress={() => setActiveDemoState('failed')}
                    style={styles.modalFullBtn}
                  />
                )}

                {activeDemoState === 'failed' && (
                  <Button
                    title="Simulate Hold Expired State"
                    variant="secondary"
                    size="md"
                    onPress={() => setActiveDemoState('expired')}
                    style={styles.modalFullBtn}
                  />
                )}

                {activeDemoState === 'expired' && (
                  <Button
                    title="Select Seats Again"
                    variant="primary"
                    size="md"
                    onPress={() => {
                      setActiveDemoState('none');
                      router.back();
                    }}
                    style={styles.modalFullBtn}
                  />
                )}

                <Button
                  title={activeDemoState === 'expired' ? 'Return to Showtimes' : 'Return to Checkout Preview'}
                  variant="outline"
                  size="md"
                  onPress={() => {
                    const wasExpired = activeDemoState === 'expired';
                    setActiveDemoState('none');
                    if (wasExpired) {
                      router.back();
                    }
                  }}
                  style={styles.modalFullBtn}
                />
              </View>
            </Card>
          </View>
        </Modal>
      )}
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
  demoDisclaimerBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(246, 190, 99, 0.08)',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderColor: 'rgba(246, 190, 99, 0.25)',
    gap: spacing.sm,
  },
  bannerIconBox: {
    paddingTop: 1,
  },
  bannerTextBox: {
    flex: 1,
  },
  bannerTitle: {
    fontWeight: '700',
    color: colors.highlight,
    marginBottom: 2,
  },
  bannerSubtext: {
    fontSize: 11,
    lineHeight: 15,
  },
  scrollContent: {
    padding: spacing.base,
    gap: spacing.base,
  },
  sectionCard: {
    gap: spacing.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  cardTitle: {
    fontWeight: '700',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  detailLabel: {
    flex: 1,
  },
  detailValueBold: {
    flex: 1.6,
    textAlign: 'right',
    fontWeight: '700',
  },
  detailValue: {
    flex: 1.6,
    textAlign: 'right',
  },
  showtimeBadgeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  seatPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginVertical: spacing.xs,
  },
  seatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.elevated,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: spacing.xs,
  },
  seatChipLabel: {
    fontWeight: '700',
  },
  seatsSummaryTextRow: {
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  receiptLineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  receiptLabelCol: {
    flex: 1,
  },
  receiptAmount: {
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  totalTitle: {
    fontWeight: '800',
  },
  totalAmount: {
    fontWeight: '800',
  },
  demoPlaygroundCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(246, 190, 99, 0.3)',
  },
  demoSectionNote: {
    lineHeight: 16,
    marginBottom: spacing.xs,
  },
  demoButtonsStack: {
    gap: spacing.sm,
  },
  demoActionTile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  demoTileIconBox: {
    width: 40,
    height: 40,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoTileTextBox: {
    flex: 1,
  },
  demoTileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  demoTileTitle: {
    fontWeight: '700',
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
  footerPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerPriceText: {
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.base,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.base,
  },
  modalBadgeRow: {
    marginBottom: spacing.sm,
  },
  modalIconBox: {
    width: 68,
    height: 68,
    borderRadius: radii.full,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontWeight: '800',
    marginBottom: 4,
  },
  modalSubtitle: {
    marginBottom: spacing.base,
    lineHeight: 18,
  },
  modalContextBox: {
    width: '100%',
    backgroundColor: colors.elevated,
    borderRadius: radii.md,
    padding: spacing.sm,
    gap: 4,
    marginBottom: spacing.sm,
  },
  contextLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contextValueBold: {
    fontWeight: '700',
  },
  modalExplanationBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    backgroundColor: 'rgba(246, 190, 99, 0.08)',
    padding: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(246, 190, 99, 0.25)',
    marginBottom: spacing.base,
  },
  modalExplanationText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
  },
  modalActionsCol: {
    width: '100%',
    gap: spacing.xs,
  },
  modalFullBtn: {
    width: '100%',
  },
});

