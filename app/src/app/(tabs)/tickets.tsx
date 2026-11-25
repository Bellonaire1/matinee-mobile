import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TICKETS_GUEST_INFO } from '@/data/discoveryEngine';
import { getLastSessionBooking, BookingResult, BookingTicketItem } from '@/api/checkoutApi';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export default function TicketsScreen() {
  const router = useRouter();
  const [activeBooking] = useState<BookingResult | null>(() => getLastSessionBooking());

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text variant="heading1" color="textPrimary">
            {TICKETS_GUEST_INFO.headerTitle}
          </Text>
          <Text variant="body" color="textSecondary">
            {TICKETS_GUEST_INFO.headerSubtitle}
          </Text>
        </View>

        {/* Real Staging Booking Card (if an order was placed in this session) */}
        {activeBooking && (
          <Card variant="surface" padding="base" style={styles.bookingCard}>
            <View style={styles.badgeRowBetween}>
              <Badge label="STAGING RESERVATION" variant="status" size="sm" />
              <Badge label="PENDING_PAYMENT" variant="highlight" size="sm" />
            </View>

            <View style={styles.bookingHeaderRow}>
              <Ionicons name="film-outline" size={24} color={colors.primary} />
              <View style={styles.bookingHeaderInfo}>
                <Text variant="heading2" color="textPrimary">
                  Staging Ticket Order
                </Text>
                <Text variant="caption" color="textSecondary">
                  Ref: {activeBooking.bookingReference}
                </Text>
              </View>
            </View>

            <View style={styles.ticketDetailsBox}>
              <View style={styles.detailRow}>
                <Text variant="caption" color="textSecondary">Showtime ID:</Text>
                <Text variant="caption" color="textPrimary" style={styles.boldText}>
                  {activeBooking.showtimeId}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text variant="caption" color="textSecondary">Total Amount:</Text>
                <Text variant="caption" color="primary" style={styles.boldText}>
                  &#8358;{(activeBooking.totalKobo / 100).toLocaleString('en-NG')}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text variant="caption" color="textSecondary">Order Status:</Text>
                <Text variant="caption" color="highlight" style={styles.boldText}>
                  {activeBooking.status}
                </Text>
              </View>
            </View>

            {/* Itemized Tickets List */}
            <View style={styles.ticketsSection}>
              <Text variant="caption" color="textSecondary" style={styles.sectionHeader}>
                ALLOCATED TICKETS ({activeBooking.tickets?.length || 0}):
              </Text>
              {activeBooking.tickets && activeBooking.tickets.length > 0 ? (
                activeBooking.tickets.map((t: BookingTicketItem) => (
                  <View key={t.id} style={styles.ticketItemRow}>
                    <Ionicons name="ticket-outline" size={16} color={colors.highlight} />
                    <View style={styles.ticketItemCol}>
                      <Text variant="caption" color="textPrimary" style={styles.boldText}>
                        Seat: {t.seatNumber || t.seatId.replace('-', '')}
                      </Text>
                      <Text variant="caption" color="textSecondary" style={styles.ticketCodeText}>
                        Ticket status: {t.status} &bull; Tier: {t.tier}
                      </Text>
                    </View>
                  </View>
                ))
              ) : null}
            </View>

            {/* Truthful Staging Notice */}
            <View style={styles.previewNoticeBox}>
              <Ionicons name="information-circle-outline" size={18} color={colors.highlight} />
              <View style={styles.noticeTextCol}>
                <Text variant="caption" color="textPrimary" style={styles.noticeTitle}>
                  PAYMENT_ENABLED=false &bull; PENDING PAYMENT
                </Text>
                <Text variant="caption" color="textSecondary" style={styles.noticeMessage}>
                  This reservation exists in the staging PostgreSQL database. Because payment processing is disabled on staging, tickets remain in PENDING_PAYMENT status and no active entry QR code is issued.
                </Text>
              </View>
            </View>
          </Card>
        )}

        {/* Guest Empty State Card */}
        <Card variant="surface" padding="base" style={styles.emptyCard}>
          <View style={styles.badgeRow}>
            <Badge label="GUEST SESSION" variant="outline" size="sm" />
          </View>

          <View style={styles.emptyIconContainer}>
            <Ionicons name="ticket-outline" size={44} color={colors.primary} />
          </View>

          <Text variant="heading2" color="textPrimary" align="center" style={styles.cardTitle}>
            {TICKETS_GUEST_INFO.emptyTitle}
          </Text>

          <Text variant="body" color="textSecondary" align="center" style={styles.cardBody}>
            {TICKETS_GUEST_INFO.emptyMessage}
          </Text>

          {/* Architecture Preview Notice Box */}
          <View style={styles.previewNoticeBox}>
            <Ionicons name="information-circle-outline" size={18} color={colors.highlight} />
            <View style={styles.noticeTextCol}>
              <Text variant="caption" color="textPrimary" style={styles.noticeTitle}>
                {TICKETS_GUEST_INFO.demoNoticeTitle}
              </Text>
              <Text variant="caption" color="textSecondary" style={styles.noticeMessage}>
                {TICKETS_GUEST_INFO.demoNoticeMessage}
              </Text>
            </View>
          </View>

          {/* Action CTAs */}
          <View style={styles.actionsCol}>
            <Button
              title={TICKETS_GUEST_INFO.primaryActionTitle}
              variant="primary"
              size="md"
              iconRight={<Ionicons name="film-outline" size={16} color={colors.background} />}
              onPress={() => router.push('/' as any)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Explore now showing movies on home screen"
              style={styles.actionBtn}
            />

            <Button
              title={TICKETS_GUEST_INFO.secondaryActionTitle}
              variant="secondary"
              size="md"
              iconRight={<Ionicons name="search-outline" size={16} color={colors.textPrimary} />}
              onPress={() => router.push('/(tabs)/search' as any)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Navigate to search catalog"
              style={styles.actionBtn}
            />
          </View>
        </Card>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  header: {
    marginBottom: spacing.base,
    paddingTop: spacing.xs,
  },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.base,
  },
  bookingCard: {
    marginBottom: spacing.base,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.4)',
  },
  badgeRowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  bookingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  bookingHeaderInfo: {
    flex: 1,
  },
  ticketDetailsBox: {
    backgroundColor: colors.elevated,
    borderRadius: radii.sm,
    padding: spacing.sm,
    marginBottom: spacing.base,
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  boldText: {
    fontWeight: '700',
  },
  ticketsSection: {
    marginBottom: spacing.base,
  },
  sectionHeader: {
    fontWeight: '700',
    marginBottom: spacing.xs,
    letterSpacing: 0.5,
  },
  ticketItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  ticketItemCol: {
    flex: 1,
  },
  ticketCodeText: {
    fontSize: 11,
    marginTop: 2,
  },
  badgeRow: {
    marginBottom: spacing.sm,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: radii.full,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.base,
  },
  cardTitle: {
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  cardBody: {
    maxWidth: 320,
    lineHeight: 20,
    marginBottom: spacing.base,
  },
  previewNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(246, 190, 99, 0.08)',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: 'rgba(246, 190, 99, 0.25)',
    padding: spacing.sm,
    gap: spacing.xs,
    width: '100%',
    marginBottom: spacing.base,
  },
  noticeTextCol: {
    flex: 1,
  },
  noticeTitle: {
    fontWeight: '700',
    color: colors.highlight,
    marginBottom: 2,
  },
  noticeMessage: {
    fontSize: 11,
    lineHeight: 15,
  },
  actionsCol: {
    width: '100%',
    gap: spacing.sm,
  },
  actionBtn: {
    width: '100%',
  },
});
