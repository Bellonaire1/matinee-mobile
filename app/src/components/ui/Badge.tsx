import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Text } from './Text';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export type BadgeVariant = 'format' | 'rating' | 'highlight' | 'status' | 'outline';

export interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  variant = 'format',
  size = 'sm',
  icon,
  style,
}) => {
  const getBadgeStyles = () => {
    switch (variant) {
      case 'rating':
        return {
          container: styles.ratingContainer,
          textColor: colors.highlight,
        };
      case 'highlight':
        return {
          container: styles.highlightContainer,
          textColor: colors.background,
        };
      case 'status':
        return {
          container: styles.statusContainer,
          textColor: colors.primary,
        };
      case 'outline':
        return {
          container: styles.outlineContainer,
          textColor: colors.textSecondary,
        };
      case 'format':
      default:
        return {
          container: styles.formatContainer,
          textColor: colors.textPrimary,
        };
    }
  };

  const { container, textColor } = getBadgeStyles();
  const isSmall = size === 'sm';

  return (
    <View
      style={[
        styles.base,
        isSmall ? styles.sizeSm : styles.sizeMd,
        container,
        style,
      ]}
    >
      {icon && <View style={styles.iconContainer}>{icon}</View>}
      <Text
        variant="caption"
        style={[
          styles.text,
          { color: textColor },
          isSmall && styles.textSm,
        ]}
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.sm,
    alignSelf: 'flex-start',
  },
  sizeSm: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    minHeight: 20,
  },
  sizeMd: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 26,
  },
  iconContainer: {
    marginRight: 4,
  },
  text: {
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  textSm: {
    fontSize: 11,
    lineHeight: 14,
  },
  formatContainer: {
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: '#3D3752',
  },
  ratingContainer: {
    backgroundColor: 'rgba(246, 190, 99, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(246, 190, 99, 0.35)',
  },
  highlightContainer: {
    backgroundColor: colors.highlight,
  },
  statusContainer: {
    backgroundColor: 'rgba(183, 138, 247, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(183, 138, 247, 0.35)',
  },
  outlineContainer: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.border,
  },
});

export default Badge;

