import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
import { Input } from '@/components/ui/Input';
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
import {
  simulatedCheckoutEngine,
  HeldSeatItem,
  HoldResult,
  BookingResult,
  PaymentStatusResult,
  INITIAL_HOLD_SECONDS,
  MAX_HOLD_LIFETIME_SECONDS,
  MAX_ALLOWED_EXTENSIONS,
} from '@/api/checkoutApi';
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

  // Active demonstration modal state (static demos)
  const [activeDemoState, setActiveDemoState] = useState<DemoCheckoutState>('none');

  // Contact info form state
  const [customerEmail, setCustomerEmail] = useState('test.customer@example.com');
  const [customerName, setCustomerName] = useState('Adaeze Okafor');
  const [emailError, setEmailError] = useState<string | undefined>(undefined);

  // Active hold simulation state
  const [holdResult, setHoldResult] = useState<HoldResult | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(INITIAL_HOLD_SECONDS);
  const [extensionCount, setExtensionCount] = useState<number>(0);
  const [holdExpired, setHoldExpired] = useState<boolean>(false);
  const [holdStatusMessage, setHoldStatusMessage] = useState<string | null>(null);

  // Transactional simulation execution state
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [simulationResult, setSimulationResult] = useState<{
    outcome: 'succeeded' | 'failed' | 'expired';
    booking?: BookingResult;
    payment?: PaymentStatusResult;
    failureReason?: string;
  } | null>(null);
  const [showResultModal, setShowResultModal] = useState<boolean>(false);

  // Stable session idempotency key across retries
  const idempotencyKeyRef = useRef<string>(
    `sim_idemp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  );

  // Stable ref for the currently active hold token to ensure safe cleanup on unmount/back navigation
  const activeHoldTokenRef = useRef<string | null>(null);
  const isMountedRef = useRef<boolean>(true);

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

  // Transform selected seats to held items matching the backend contract
  const heldSeats = useMemo<HeldSeatItem[]>(() => {
    if (!validationResult.isValid) return [];
    return validationResult.selectionTotals.selectedSeats.map((seat) => ({
      id: seat.id,
      seatNumber: seat.displayLabel,
      row: seat.row,
      column: seat.col,
      tier: seat.tier,
      priceKobo: seat.priceKobo,
    }));
  }, [validationResult]);

  // Acquire simulated hold on mount
  useEffect(() => {
    isMountedRef.current = true;
    if (!validationResult.isValid) return;

    const showtimeId = validationResult.showtime.id;
    const seatIds = validationResult.selectionTotals.selectedSeats.map((s) => s.id);
    const totalPriceKobo = validationResult.selectionTotals.totalKobo;

    simulatedCheckoutEngine
      .acquireHold(showtimeId, seatIds, heldSeats, totalPriceKobo)
      .then((hold) => {
        if (!isMountedRef.current) {
          // If component unmounted while acquireHold was pending, release immediately
          simulatedCheckoutEngine.releaseHold(hold.holdToken).catch(() => {});
          return;
        }
        activeHoldTokenRef.current = hold.holdToken;
        setHoldResult(hold);
        setSecondsRemaining(hold.expiresInSeconds);
        setExtensionCount(hold.extensionCount);
        setHoldExpired(false);
      })
      .catch((err) => {
        if (!isMountedRef.current) return;
        console.warn('Failed to acquire initial simulated hold:', err);
      });

    return () => {
      isMountedRef.current = false;
      // Release simulated hold on unmount / navigation away safely via stable ref
      const tokenToRelease = activeHoldTokenRef.current;
      if (tokenToRelease) {
        activeHoldTokenRef.current = null;
        simulatedCheckoutEngine.releaseHold(tokenToRelease).catch(() => {});
      }
    };
  }, [validationResult.isValid]);

  // Hold countdown timer tick
  useEffect(() => {
    if (holdExpired || !holdResult) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setHoldExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [holdExpired, holdResult]);

  // Hold extension handler (+5 Mins)
  const handleExtendHold = useCallback(async () => {
    const currentToken = activeHoldTokenRef.current || holdResult?.holdToken;
    if (!currentToken || holdExpired || extensionCount >= MAX_ALLOWED_EXTENSIONS) return;

    try {
      const res = await simulatedCheckoutEngine.extendHold(currentToken);
      if (!isMountedRef.current) return;
      setSecondsRemaining(res.expiresInSeconds);
      setExtensionCount(res.extensionCount);
      setHoldStatusMessage(res.message);
      setTimeout(() => {
        if (isMountedRef.current) {
          setHoldStatusMessage(null);
        }
      }, 4000);
    } catch (err: any) {
      if (!isMountedRef.current) return;
      setHoldStatusMessage(err?.message || 'Could not extend hold');
      setTimeout(() => {
        if (isMountedRef.current) {
          setHoldStatusMessage(null);
        }
      }, 4000);
    }
  }, [holdResult, holdExpired, extensionCount]);

  // Clean back navigation releasing hold
  const handleBack = useCallback(() => {
    const tokenToRelease = activeHoldTokenRef.current;
    if (tokenToRelease) {
      activeHoldTokenRef.current = null;
      simulatedCheckoutEngine.releaseHold(tokenToRelease).catch(() => {});
    }
    router.back();
  }, [router]);

  // Interactive Simulated Checkout Flow
  const handleExecuteSimulatedCheckout = useCallback(
    async (outcome: 'succeeded' | 'failed' = 'succeeded') => {
      if (!validationResult.isValid) return;

      // Validate customer email
      if (!customerEmail.trim() || !customerEmail.includes('@')) {
        setEmailError('Please enter a valid customer email address.');
        return;
      }
      setEmailError(undefined);

      if (holdExpired) {
        setSimulationResult({
          outcome: 'expired',
          failureReason: 'Seat hold has expired. Please select seats again.',
        });
        setShowResultModal(true);
        return;
      }

      setIsProcessing(true);

      try {
        const showtimeId = validationResult.showtime.id;
        const seatIds = validationResult.selectionTotals.selectedSeats.map((s) => s.id);
        const totalPriceKobo = validationResult.selectionTotals.totalKobo;
        const holdToken = activeHoldTokenRef.current || holdResult?.holdToken || 'sim_hold_default';

        // Step 1: Create transactional pending booking (preserving idempotencyKey)
        const booking = await simulatedCheckoutEngine.createBooking({
          showtimeId,
          seatIds,
          contactEmail: customerEmail.trim(),
          contactName: customerName.trim() || undefined,
          totalPriceKobo,
          holdToken,
          idempotencyKey: idempotencyKeyRef.current,
        });

        // The hold is now converted into a pending booking in the engine
        activeHoldTokenRef.current = null;

        // Step 2: Initialize test payment
        const paymentInit = await simulatedCheckoutEngine.initializePayment({
          bookingId: booking.id,
          email: customerEmail.trim(),
          holdToken,
        });

        // Step 3: Simulate payment settlement inquiry
        const paymentStatus = await simulatedCheckoutEngine.getPaymentStatus({
          reference: paymentInit.reference,
          outcome,
        });

        if (!isMountedRef.current) return;

        if (outcome === 'succeeded') {
          setSimulationResult({
            outcome: 'succeeded',
            booking,
            payment: paymentStatus,
          });
        } else {
          setSimulationResult({
            outcome: 'failed',
            booking,
            payment: paymentStatus,
            failureReason: 'Simulated payment failed (card declined)',
          });
        }
        setShowResultModal(true);
      } catch (err: any) {
        if (!isMountedRef.current) return;
        const msg = err?.message || 'Simulated checkout encountered an unexpected issue';
        if (msg.includes('expired')) {
          setHoldExpired(true);
          setSimulationResult({
            outcome: 'expired',
            failureReason: 'Seat hold has expired. Please select seats again.',
          });
        } else {
          setSimulationResult({
            outcome: 'failed',
            failureReason: msg,
          });
        }
        setShowResultModal(true);
      } finally {
        if (isMountedRef.current) {
          setIsProcessing(false);
        }
      }
    },
    [
      validationResult,
      customerEmail,
      customerName,
      holdExpired,
      holdResult,
    ]
  );

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

  // Format MM:SS for countdown timer
  const formatTimer = (seconds: number) => {
    const mins = Math.floor(Math.max(0, seconds) / 60);
    const secs = Math.max(0, seconds) % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top Header */}
      <SafeAreaView edges={['top']} style={styles.topHeader}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleBack}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Go back to seat selection"
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerInfoCol}>
          <Text variant="heading2" color="textPrimary" numberOfLines={1}>
            Checkout (Demo)
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            Offline Simulation &bull; Test Checkout
          </Text>
        </View>

        <Badge label="TEST MODE" variant="highlight" size="sm" />
      </SafeAreaView>

      {/* Prominent Demo Disclaimer Banner */}
      <View style={styles.demoDisclaimerBanner}>
        <View style={styles.bannerIconBox}>
          <Ionicons name="information-circle" size={18} color={colors.highlight} />
        </View>
        <View style={styles.bannerTextBox}>
          <Text variant="caption" color="textPrimary" style={styles.bannerTitle}>
            TEST / DEMO MODE — NO REAL PAYMENT REQUIRED
          </Text>
          <Text variant="caption" color="textSecondary" style={styles.bannerSubtext}>
            {CHECKOUT_DEMO_SUBTEXT} Card transactions and tickets are simulated locally. No real money or live reservation records will be modified.
          </Text>
        </View>
      </View>

      {/* Scrollable Content */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 140 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Active Hold Countdown Banner Card */}
        <Card
          variant="surface"
          padding="base"
          style={[
            styles.holdTimerCard,
            holdExpired && styles.holdTimerCardExpired,
          ]}
        >
          <View style={styles.holdTimerRow}>
            <View style={styles.holdTimerLeftCol}>
              <View style={styles.timerHeaderRow}>
                <Ionicons
                  name={holdExpired ? 'alert-circle' : 'time-outline'}
                  size={20}
                  color={holdExpired ? '#F44336' : colors.highlight}
                />
                <Text
                  variant="supporting"
                  color={holdExpired ? 'textPrimary' : 'textPrimary'}
                  style={styles.holdTimerLabel}
                >
                  {holdExpired ? 'Seat Hold Expired' : 'Temporary Seat Hold'}
                </Text>
                {extensionCount > 0 && !holdExpired && (
                  <Badge label="Extended +5m" variant="highlight" size="sm" />
                )}
              </View>

              <Text
                variant="heading1"
                color={holdExpired ? 'textSecondary' : 'textPrimary'}
                style={[styles.timerDigits, holdExpired && styles.timerDigitsExpired]}
              >
                {formatTimer(secondsRemaining)}
              </Text>

              <Text variant="caption" color="textSecondary">
                {holdExpired
                  ? 'Seat hold has expired. Please select seats again.'
                  : `10m hold (${INITIAL_HOLD_SECONDS}s). Extend once up to ${MAX_HOLD_LIFETIME_SECONDS}s max.`}
              </Text>
            </View>

            {/* +5 Mins Heartbeat Extension Button */}
            {!holdExpired && (
              <View style={styles.holdTimerActions}>
                <Button
                  title={extensionCount >= MAX_ALLOWED_EXTENSIONS ? 'Extended' : '+5 Mins'}
                  variant="secondary"
                  size="sm"
                  disabled={extensionCount >= MAX_ALLOWED_EXTENSIONS || isProcessing}
                  onPress={handleExtendHold}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel="Extend seat hold by 5 minutes"
                />
              </View>
            )}
          </View>

          {holdStatusMessage && (
            <View style={styles.holdStatusAlert}>
              <Ionicons name="information-circle-outline" size={14} color={colors.highlight} />
              <Text variant="caption" color="textPrimary" style={styles.holdStatusText}>
                {holdStatusMessage}
              </Text>
            </View>
          )}

          {holdExpired && (
            <View style={styles.expiredRecoveryBox}>
              <Button
                title="Select Seats Again"
                variant="primary"
                size="sm"
                onPress={handleBack}
              />
            </View>
          )}
        </Card>

        {/* Film & Showtime Summary Card */}
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

        {/* Customer Information (Inputs) */}
        <Card variant="surface" padding="base" style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="person-outline" size={18} color={colors.primary} />
            <Text variant="heading2" color="textPrimary" style={styles.cardTitle}>
              Customer Details (Test Session)
            </Text>
          </View>

          <Text variant="caption" color="textSecondary" style={styles.inputSectionSubtext}>
            Enter simulated customer details for order receipt confirmation:
          </Text>

          <Input
            label="Customer Email"
            value={customerEmail}
            onChangeText={(text) => {
              setCustomerEmail(text);
              if (emailError) setEmailError(undefined);
            }}
            placeholder="e.g. adaeze@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            error={emailError}
            iconLeft={<Ionicons name="mail-outline" size={18} color={colors.textSecondary} />}
          />

          <Input
            label="Customer Full Name (Optional)"
            value={customerName}
            onChangeText={setCustomerName}
            placeholder="e.g. Adaeze Okafor"
            autoCapitalize="words"
            iconLeft={<Ionicons name="person-outline" size={18} color={colors.textSecondary} />}
            containerStyle={styles.nameInputContainer}
          />
        </Card>

        {/* Itemized Price Breakdown */}
        <Card variant="surface" padding="base" style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="receipt-outline" size={18} color={colors.primary} />
            <Text variant="heading2" color="textPrimary" style={styles.cardTitle}>
              Price Breakdown (Simulated NGN)
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

        {/* Interactive Simulation Actions Card */}
        <Card variant="elevated" padding="base" style={styles.simulationCard}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="play-circle-outline" size={20} color={colors.highlight} />
            <Text variant="heading2" color="textPrimary" style={styles.cardTitle}>
              Simulate Test Checkout Outcomes
            </Text>
          </View>
          <Text variant="caption" color="textSecondary" style={styles.demoSectionNote}>
            Test the live mobile checkout engine without charging real money or altering live database tables:
          </Text>

          <View style={styles.simActionsStack}>
            {/* 1. Simulate Test Payment (Success) */}
            <Button
              title={isProcessing ? 'Processing Test Payment...' : `Simulate Test Payment (${formattedTotal})`}
              variant="primary"
              size="lg"
              disabled={isProcessing || holdExpired}
              onPress={() => handleExecuteSimulatedCheckout('succeeded')}
              iconRight={
                isProcessing ? (
                  <ActivityIndicator size="small" color={colors.background} />
                ) : (
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.background} />
                )
              }
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Execute simulated test payment"
            />

            {/* 2. Simulate Card Decline (Failure & Retry) */}
            <Button
              title="Simulate Card Authorization Decline"
              variant="secondary"
              size="md"
              disabled={isProcessing || holdExpired}
              onPress={() => handleExecuteSimulatedCheckout('failed')}
              iconRight={<Ionicons name="card-outline" size={16} color={colors.textPrimary} />}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Simulate card decline and retry experience"
            />
          </View>
        </Card>

        {/* Demonstration States Static Explorer */}
        <Card variant="surface" padding="base" style={styles.demoPlaygroundCard}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="flask-outline" size={18} color={colors.highlight} />
            <Text variant="heading2" color="textPrimary" style={styles.cardTitle}>
              Static UI State Gallery
            </Text>
          </View>
          <Text variant="caption" color="textSecondary" style={styles.demoSectionNote}>
            Preview individual UI screen mockups:
          </Text>

          <View style={styles.demoButtonsStack}>
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
                    1. Verification Pending
                  </Text>
                  <Badge label="Pending" variant="highlight" size="sm" />
                </View>
                <Text variant="caption" color="textSecondary">
                  Preview simulated polling/webhook confirmation screen.
                </Text>
              </View>
            </TouchableOpacity>

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
                    2. Authorization Failed
                  </Text>
                  <Badge label="Declined" variant="status" size="sm" />
                </View>
                <Text variant="caption" color="textSecondary">
                  Preview simulated bank card decline and retry flow.
                </Text>
              </View>
            </TouchableOpacity>

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
                    3. Selection Expired
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
            title={isProcessing ? 'Processing...' : holdExpired ? 'Hold Expired' : 'Simulate Payment'}
            variant="primary"
            size="md"
            disabled={isProcessing || holdExpired}
            iconRight={
              isProcessing ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Ionicons name="card-outline" size={16} color={colors.background} />
              )
            }
            onPress={() => handleExecuteSimulatedCheckout('succeeded')}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Simulate test payment"
          />
        </View>
      </View>

      {/* Outcome Modal (Interactive Test Checkout Results) */}
      {showResultModal && simulationResult && (
        <Modal
          visible={showResultModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowResultModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <Card variant="surface" padding="base" style={styles.modalCard}>
              {/* Outcome Badge */}
              <View style={styles.modalBadgeRow}>
                <Badge
                  label={
                    simulationResult.outcome === 'succeeded'
                      ? 'SIMULATED SUCCESS'
                      : simulationResult.outcome === 'failed'
                      ? 'SIMULATED DECLINE'
                      : 'HOLD EXPIRED'
                  }
                  variant={
                    simulationResult.outcome === 'succeeded'
                      ? 'highlight'
                      : simulationResult.outcome === 'failed'
                      ? 'status'
                      : 'outline'
                  }
                  size="sm"
                />
              </View>

              {/* Outcome Icon Box */}
              <View
                style={[
                  styles.modalIconBox,
                  {
                    borderColor:
                      simulationResult.outcome === 'succeeded'
                        ? '#4CAF50'
                        : simulationResult.outcome === 'failed'
                        ? '#F44336'
                        : colors.highlight,
                  },
                ]}
              >
                <Ionicons
                  name={
                    simulationResult.outcome === 'succeeded'
                      ? 'checkmark-circle'
                      : simulationResult.outcome === 'failed'
                      ? 'alert-circle'
                      : 'time-outline'
                  }
                  size={42}
                  color={
                    simulationResult.outcome === 'succeeded'
                      ? '#4CAF50'
                      : simulationResult.outcome === 'failed'
                      ? '#F44336'
                      : colors.highlight
                  }
                />
              </View>

              {/* Title & Subtitle */}
              <Text variant="heading1" color="textPrimary" align="center" style={styles.modalTitle}>
                {simulationResult.outcome === 'succeeded'
                  ? 'Simulated payment successful'
                  : simulationResult.outcome === 'failed'
                  ? 'Simulated payment failed (card declined)'
                  : 'Seat hold has expired'}
              </Text>
              <Text variant="body" color="textSecondary" align="center" style={styles.modalSubtitle}>
                {simulationResult.outcome === 'succeeded'
                  ? 'Your test order was processed in offline simulation mode. No live credit card was charged.'
                  : simulationResult.outcome === 'failed'
                  ? 'Simulated issuing bank declined the card authorization. You can retry with your preserved hold.'
                  : 'Seat hold has expired. Please select seats again.'}
              </Text>

              {/* Details Box */}
              <View style={styles.modalContextBox}>
                {simulationResult.booking && (
                  <View style={styles.contextLine}>
                    <Text variant="caption" color="textSecondary">
                      Booking Reference:
                    </Text>
                    <Text variant="caption" color="textPrimary" style={styles.contextValueBold}>
                      {simulationResult.booking.bookingReference}
                    </Text>
                  </View>
                )}

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

                {simulationResult.outcome === 'failed' && (
                  <View style={styles.contextLine}>
                    <Text variant="caption" color="textSecondary">
                      Preserved Session:
                    </Text>
                    <Text variant="caption" color="textPrimary" style={styles.contextValueBold}>
                      {idempotencyKeyRef.current.substring(0, 16)}...
                    </Text>
                  </View>
                )}
              </View>

              {/* Notice / Honesty Box */}
              <View style={styles.modalExplanationBox}>
                <Ionicons name="information-circle-outline" size={16} color={colors.highlight} />
                <Text variant="caption" color="textSecondary" style={styles.modalExplanationText}>
                  {simulationResult.outcome === 'succeeded'
                    ? 'NOTICE: Offline simulation only. No live database ticket or live QR code was created.'
                    : simulationResult.outcome === 'failed'
                    ? 'Idempotency key retained. Retrying will not allocate duplicate tickets.'
                    : 'Holds release automatically upon timeout to free inventory for other moviegoers.'}
                </Text>
              </View>

              {/* Actions */}
              <View style={styles.modalActionsCol}>
                {simulationResult.outcome === 'succeeded' && (
                  <>
                    <Button
                      title="Explore More Movies"
                      variant="primary"
                      size="md"
                      onPress={() => {
                        setShowResultModal(false);
                        router.replace('/');
                      }}
                      style={styles.modalFullBtn}
                    />
                    <Button
                      title="View Order Summary"
                      variant="outline"
                      size="md"
                      onPress={() => setShowResultModal(false)}
                      style={styles.modalFullBtn}
                    />
                  </>
                )}

                {simulationResult.outcome === 'failed' && (
                  <>
                    <Button
                      title="Retry Test Payment"
                      variant="primary"
                      size="md"
                      onPress={() => {
                        setShowResultModal(false);
                        handleExecuteSimulatedCheckout('succeeded');
                      }}
                      style={styles.modalFullBtn}
                    />
                    <Button
                      title="Cancel &amp; Return"
                      variant="outline"
                      size="md"
                      onPress={() => {
                        setShowResultModal(false);
                        handleBack();
                      }}
                      style={styles.modalFullBtn}
                    />
                  </>
                )}

                {simulationResult.outcome === 'expired' && (
                  <Button
                    title="Select Seats Again"
                    variant="primary"
                    size="md"
                    onPress={() => {
                      setShowResultModal(false);
                      handleBack();
                    }}
                    style={styles.modalFullBtn}
                  />
                )}
              </View>
            </Card>
          </View>
        </Modal>
      )}

      {/* Full Modal for Static Demonstration States */}
      {demoStateMeta && (
        <Modal
          visible={activeDemoState !== 'none'}
          transparent
          animationType="fade"
          onRequestClose={() => setActiveDemoState('none')}
        >
          <View style={styles.modalBackdrop}>
            <Card variant="surface" padding="base" style={styles.modalCard}>
              <View style={styles.modalBadgeRow}>
                <Badge label={demoStateMeta.badgeLabel} variant="highlight" size="sm" />
              </View>

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

              <Text variant="heading1" color="textPrimary" align="center" style={styles.modalTitle}>
                {demoStateMeta.title}
              </Text>
              <Text variant="body" color="textSecondary" align="center" style={styles.modalSubtitle}>
                {demoStateMeta.description}
              </Text>

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

              <View style={styles.modalExplanationBox}>
                <Ionicons name="information-circle-outline" size={16} color={colors.highlight} />
                <Text variant="caption" color="textSecondary" style={styles.modalExplanationText}>
                  {demoStateMeta.explanation}
                </Text>
              </View>

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
                  title={activeDemoState === 'expired' ? 'Return to Showtimes' : 'Return to Checkout'}
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
  holdTimerCard: {
    borderWidth: 1,
    borderColor: 'rgba(246, 190, 99, 0.35)',
    backgroundColor: 'rgba(246, 190, 99, 0.04)',
    gap: spacing.xs,
  },
  holdTimerCardExpired: {
    borderColor: 'rgba(244, 67, 54, 0.4)',
    backgroundColor: 'rgba(244, 67, 54, 0.05)',
  },
  holdTimerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  holdTimerLeftCol: {
    flex: 1,
    gap: 2,
  },
  timerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  holdTimerLabel: {
    fontWeight: '700',
  },
  timerDigits: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.highlight,
    letterSpacing: 1,
  },
  timerDigitsExpired: {
    color: '#F44336',
  },
  holdTimerActions: {
    marginLeft: spacing.sm,
  },
  holdStatusAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  holdStatusText: {
    fontSize: 11,
    color: colors.highlight,
  },
  expiredRecoveryBox: {
    paddingTop: spacing.xs,
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
  inputSectionSubtext: {
    marginBottom: spacing.xs,
  },
  nameInputContainer: {
    marginTop: spacing.xs,
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
  simulationCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(183, 138, 247, 0.35)',
    backgroundColor: 'rgba(183, 138, 247, 0.04)',
  },
  simActionsStack: {
    gap: spacing.sm,
    marginTop: spacing.xs,
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
