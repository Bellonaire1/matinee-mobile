import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export interface CardProps extends ViewProps {
  variant?: 'surface' | 'elevated';
  padding?: keyof typeof spacing;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'surface',
  padding = 'base',
  style,
  ...rest
}) => {
  return (
    <View
      style={[
        styles.base,
        variant === 'elevated' ? styles.elevated : styles.surface,
        { padding: spacing[padding] },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  surface: {
    backgroundColor: colors.surface,
  },
  elevated: {
    backgroundColor: colors.elevated,
  },
});

export default Card;

