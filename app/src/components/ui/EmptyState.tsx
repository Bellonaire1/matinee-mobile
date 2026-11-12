import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { Button } from './Button';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export interface EmptyStateProps {
  iconName?: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionTitle?: string;
  onActionPress?: () => void;
  secondaryActionTitle?: string;
  onSecondaryActionPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  iconName = 'alert-circle-outline',
  title,
  message,
  actionTitle,
  onActionPress,
  secondaryActionTitle,
  onSecondaryActionPress,
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.iconCircle}>
        <Ionicons name={iconName} size={40} color={colors.primary} />
      </View>
      <Text variant="heading2" color="textPrimary" align="center" style={styles.title}>
        {title}
      </Text>
      <Text variant="body" color="textSecondary" align="center" style={styles.message}>
        {message}
      </Text>

      {actionTitle && onActionPress && (
        <Button
          title={actionTitle}
          variant="primary"
          size="md"
          onPress={onActionPress}
          style={styles.primaryBtn}
        />
      )}

      {secondaryActionTitle && onSecondaryActionPress && (
        <Button
          title={secondaryActionTitle}
          variant="ghost"
          size="md"
          onPress={onSecondaryActionPress}
          style={styles.secondaryBtn}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: radii.full,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.base,
  },
  title: {
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  message: {
    maxWidth: 320,
    marginBottom: spacing.xl,
  },
  primaryBtn: {
    minWidth: 200,
    marginBottom: spacing.sm,
  },
  secondaryBtn: {
    minWidth: 200,
  },
});

export default EmptyState;

