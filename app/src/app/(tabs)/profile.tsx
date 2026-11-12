import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export default function ProfileScreen() {
  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text variant="heading1" color="textPrimary">
          Profile & Settings
        </Text>
        <Text variant="body" color="textSecondary">
          Manage your account, preferences, and app options
        </Text>
      </View>

      <Card variant="surface" padding="base" style={styles.card}>
        <View style={styles.userRow}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={28} color={colors.primary} />
          </View>
          <View style={styles.userInfo}>
            <Text variant="heading2" color="textPrimary">
              Guest User
            </Text>
            <Text variant="supporting" color="textSecondary">
              Matinee Cinema Member
            </Text>
          </View>
        </View>
      </Card>

      <Card variant="elevated" padding="base" style={styles.settingsCard}>
        <View style={styles.settingItem}>
          <Ionicons name="color-palette-outline" size={20} color={colors.highlight} />
          <Text variant="body" color="textPrimary" style={styles.settingText}>
            Theme: Dark Mode (Obsidian & Velvet)
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.settingItem}>
          <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
          <Text variant="body" color="textPrimary" style={styles.settingText}>
            Payment Mode: Test Environment
          </Text>
        </View>
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
    marginBottom: spacing.base,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
  },
  avatar: {
    width: 56,
    height: 56,
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
  settingsCard: {
    marginTop: spacing.xs,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  settingText: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
});

