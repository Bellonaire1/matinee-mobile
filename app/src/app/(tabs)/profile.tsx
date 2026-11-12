import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  PROFILE_GUEST_INFO,
  APP_SYSTEM_DIAGNOSTICS,
} from '@/data/discoveryEngine';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export default function ProfileScreen() {
  const router = useRouter();
  const [isDiagnosticsModalVisible, setIsDiagnosticsModalVisible] = useState(false);

  return (
    <ScreenContainer>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text variant="heading1" color="textPrimary">
            {PROFILE_GUEST_INFO.headerTitle}
          </Text>
          <Text variant="body" color="textSecondary">
            {PROFILE_GUEST_INFO.headerSubtitle}
          </Text>
        </View>

        {/* User Identity Card */}
        <Card variant="surface" padding="base" style={styles.userCard}>
          <View style={styles.userRow}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={28} color={colors.primary} />
            </View>
            <View style={styles.userInfo}>
              <View style={styles.userNameRow}>
                <Text variant="heading2" color="textPrimary">
                  {PROFILE_GUEST_INFO.guestName}
                </Text>
                <Badge label={PROFILE_GUEST_INFO.membershipBadge} variant="highlight" size="sm" />
              </View>
              <Text variant="supporting" color="textSecondary">
                {PROFILE_GUEST_INFO.guestSubtitle}
              </Text>
            </View>
          </View>
          <Text variant="caption" color="textSecondary" style={styles.sessionNote}>
            You are browsing in local guest mode. Authentication endpoints, user accounts, and booking profiles will be introduced when the backend is established.
          </Text>
        </Card>

        {/* Application Architecture & System State Card */}
        <Card variant="surface" padding="base" style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
            <Text variant="heading2" color="textPrimary" style={styles.cardTitle}>
              Application Architecture Status
            </Text>
          </View>

          {/* Theme Specification */}
          <View style={styles.specItem}>
            <View style={styles.specIconBox}>
              <Ionicons name="color-palette-outline" size={18} color={colors.highlight} />
            </View>
            <View style={styles.specTextBox}>
              <Text variant="supporting" color="textPrimary" style={styles.specTitle}>
                Theme: Cinema After Dark
              </Text>
              <Text variant="caption" color="textSecondary">
                Obsidian &amp; Velvet. Dark mode is the only active theme to preserve cinema auditorium ambiance.
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Payment Status Specification */}
          <View style={styles.specItem}>
            <View style={styles.specIconBox}>
              <Ionicons name="card-outline" size={18} color="#FF7185" />
            </View>
            <View style={styles.specTextBox}>
              <Text variant="supporting" color="textPrimary" style={styles.specTitle}>
                Payment Integration: Not Implemented
              </Text>
              <Text variant="caption" color="textSecondary">
                Non-transactional mobile preview. No live cards, webhooks, or payment gateway APIs (Paystack/Flutterwave) are active.
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Seat Engine Specification */}
          <View style={styles.specItem}>
            <View style={styles.specIconBox}>
              <Ionicons name="grid-outline" size={18} color={colors.primary} />
            </View>
            <View style={styles.specTextBox}>
              <Text variant="supporting" color="textPrimary" style={styles.specTitle}>
                Auditorium Engine: 320 Unique Seats
              </Text>
              <Text variant="caption" color="textSecondary">
                Deterministic calculation across 4 approved seat tiers (Standard ₦7k, VIP ₦9.5k, Couple ₦12k pair, Accessible ₦7k).
              </Text>
            </View>
          </View>
        </Card>

        {/* Working Interactive Actions */}
        <Card variant="elevated" padding="base" style={styles.sectionCard}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="construct-outline" size={18} color={colors.highlight} />
            <Text variant="heading2" color="textPrimary" style={styles.cardTitle}>
              Interactive Exploration Tools
            </Text>
          </View>

          <View style={styles.toolsStack}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/(tabs)/search' as any)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Navigate to film search tab"
              style={styles.toolRow}
            >
              <Ionicons name="search" size={20} color={colors.primary} />
              <View style={styles.toolTextBox}>
                <Text variant="supporting" color="textPrimary" style={styles.toolTitle}>
                  Explore Film Catalog
                </Text>
                <Text variant="caption" color="textSecondary">
                  Search Now Showing and Coming Soon titles with genre filters.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/component-gallery' as any)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Open Developer Component Gallery SCR-11"
              style={styles.toolRow}
            >
              <Ionicons name="apps-outline" size={20} color={colors.primary} />
              <View style={styles.toolTextBox}>
                <Text variant="supporting" color="textPrimary" style={styles.toolTitle}>
                  Component Gallery (SCR-11)
                </Text>
                <Text variant="caption" color="textSecondary">
                  Interactive test bench covering all 12 design system categories.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.push('/movie/feat-1' as any)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Navigate to Dune Part Two movie details"
              style={styles.toolRow}
            >
              <Ionicons name="film" size={20} color={colors.highlight} />
              <View style={styles.toolTextBox}>
                <Text variant="supporting" color="textPrimary" style={styles.toolTitle}>
                  Featured Film Example: Dune Part Two
                </Text>
                <Text variant="caption" color="textSecondary">
                  Explore Dune: Part Two showtimes and interactive 320-seat map.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setIsDiagnosticsModalVisible(true)}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="View verified system diagnostics modal"
              style={styles.toolRow}
            >
              <Ionicons name="shield-checkmark" size={20} color={colors.success} />
              <View style={styles.toolTextBox}>
                <Text variant="supporting" color="textPrimary" style={styles.toolTitle}>
                  View System Diagnostics
                </Text>
                <Text variant="caption" color="textSecondary">
                  Inspect verified runtime invariants and architecture capabilities.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </Card>

        {/* Build & Version Footer */}
        <View style={styles.versionFooter}>
          <Text variant="caption" color="textSecondary" align="center">
            Matinee Mobile &bull; Version {APP_SYSTEM_DIAGNOSTICS.version} (Build {APP_SYSTEM_DIAGNOSTICS.build})
          </Text>
          <Text variant="caption" color="textSecondary" align="center">
            {APP_SYSTEM_DIAGNOSTICS.sdk} &bull; {APP_SYSTEM_DIAGNOSTICS.router}
          </Text>
        </View>
      </ScrollView>

      {/* Diagnostics Modal */}
      <Modal
        visible={isDiagnosticsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsDiagnosticsModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Card variant="surface" padding="base" style={styles.modalCard}>
            <View style={styles.modalIconBox}>
              <Ionicons name="shield-checkmark-outline" size={36} color={colors.success} />
            </View>

            <Text variant="heading1" color="textPrimary" align="center" style={styles.modalTitle}>
              System Diagnostics
            </Text>
            <Text variant="caption" color="textSecondary" align="center" style={styles.modalSubtitle}>
              Verified architectural invariants for this local preview build
            </Text>

            <View style={styles.diagnosticsList}>
              <View style={styles.diagRow}>
                <Text variant="caption" color="textSecondary">
                  Auditorium Engine:
                </Text>
                <Text variant="caption" color="textPrimary" style={styles.diagValueBold}>
                  {APP_SYSTEM_DIAGNOSTICS.seatCount} deterministic seats (20 rows &times; 16 cols)
                </Text>
              </View>

              <View style={styles.diagRow}>
                <Text variant="caption" color="textSecondary">
                  Pricing Precision:
                </Text>
                <Text variant="caption" color="textPrimary" style={styles.diagValueBold}>
                  Integer-Kobo Arithmetic (Zero Drift)
                </Text>
              </View>

              <View style={styles.diagRow}>
                <Text variant="caption" color="textSecondary">
                  Max Booking Limit:
                </Text>
                <Text variant="caption" color="textPrimary" style={styles.diagValueBold}>
                  {APP_SYSTEM_DIAGNOSTICS.maxSeatsPerBooking} seats per selection
                </Text>
              </View>

              <View style={styles.diagRow}>
                <Text variant="caption" color="textSecondary">
                  Backend Endpoints:
                </Text>
                <Text variant="caption" color="textPrimary" style={styles.diagValueBold}>
                  NONE (server/ is empty, local preview)
                </Text>
              </View>

              <View style={styles.diagRow}>
                <Text variant="caption" color="textSecondary">
                  Payment Gateway:
                </Text>
                <Text variant="caption" color="highlight" style={styles.diagValueBold}>
                  Disabled (Non-Transactional Simulation)
                </Text>
              </View>
            </View>

            <Button
              title="Close Diagnostics"
              variant="primary"
              size="md"
              onPress={() => setIsDiagnosticsModalVisible(false)}
              style={styles.modalCloseBtn}
            />
          </Card>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xxl,
    gap: spacing.base,
  },
  header: {
    paddingTop: spacing.xs,
  },
  userCard: {
    gap: spacing.sm,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radii.full,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
  },
  sessionNote: {
    fontSize: 11,
    lineHeight: 15,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderColor: colors.border,
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
  specItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  specIconBox: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  specTextBox: {
    flex: 1,
    gap: 2,
  },
  specTitle: {
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  toolsStack: {
    gap: spacing.xs,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  toolTextBox: {
    flex: 1,
    gap: 2,
  },
  toolTitle: {
    fontWeight: '700',
  },
  versionFooter: {
    paddingVertical: spacing.sm,
    gap: 2,
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
    maxWidth: 400,
    alignItems: 'center',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.base,
  },
  modalIconBox: {
    width: 60,
    height: 60,
    borderRadius: radii.full,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.success,
    marginBottom: spacing.sm,
  },
  modalTitle: {
    fontWeight: '800',
    marginBottom: 2,
  },
  modalSubtitle: {
    marginBottom: spacing.base,
  },
  diagnosticsList: {
    width: '100%',
    backgroundColor: colors.elevated,
    borderRadius: radii.md,
    padding: spacing.base,
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  diagRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  diagValueBold: {
    fontWeight: '700',
  },
  modalCloseBtn: {
    width: '100%',
  },
});
