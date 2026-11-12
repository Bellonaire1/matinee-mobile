import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TICKETS_GUEST_INFO } from '@/data/discoveryEngine';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export default function TicketsScreen() {
  const router = useRouter();

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
