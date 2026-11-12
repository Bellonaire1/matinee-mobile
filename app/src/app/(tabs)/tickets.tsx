import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export default function TicketsScreen() {
  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text variant="heading1" color="textPrimary">
          My Tickets
        </Text>
        <Text variant="body" color="textSecondary">
          View your active bookings and digital ticket history
        </Text>
      </View>

      <Card variant="surface" padding="base" style={styles.card}>
        <View style={styles.emptyIconContainer}>
          <Ionicons name="ticket-outline" size={48} color={colors.primary} />
        </View>
        <Text variant="heading2" color="textPrimary" align="center" style={styles.cardTitle}>
          No Active Tickets
        </Text>
        <Text variant="body" color="textSecondary" align="center" style={styles.cardBody}>
          When you book tickets for upcoming showtimes, your scannable QR passes will appear here.
        </Text>
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  card: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: radii.full,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  cardTitle: {
    marginBottom: spacing.xs,
  },
  cardBody: {
    maxWidth: 280,
  },
});

