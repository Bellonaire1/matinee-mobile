import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export default function SearchScreen() {
  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text variant="heading1" color="textPrimary">
          Search
        </Text>
        <Text variant="body" color="textSecondary">
          Find movies, cinemas, and showtimes
        </Text>
      </View>

      <Card variant="surface" padding="base" style={styles.card}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <Text variant="body" color="textSecondary" style={styles.searchPlaceholder}>
            Search movies, genres, cinemas...
          </Text>
        </View>
      </Card>

      <Card variant="elevated" padding="base" style={styles.infoCard}>
        <Text variant="heading2" color="textPrimary" style={styles.infoTitle}>
          Search Architecture Ready
        </Text>
        <Text variant="supporting" color="textSecondary">
          Filter chips, TMDB search endpoints, and instant cinema lookup will connect to this tab in future modules.
        </Text>
      </Card>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.base,
    paddingTop: spacing.sm,
  },
  card: {
    marginBottom: spacing.base,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.elevated,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  searchPlaceholder: {
    marginLeft: spacing.xs,
  },
  infoCard: {
    marginTop: spacing.xs,
  },
  infoTitle: {
    marginBottom: spacing.xs,
  },
});

