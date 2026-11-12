import React from 'react';
import {
  TouchableOpacity,
  TouchableOpacityProps,
  StyleSheet,
  View,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Text } from './Text';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends TouchableOpacityProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  iconLeft,
  iconRight,
  disabled = false,
  fullWidth = false,
  style,
  ...touchableProps
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case 'secondary':
        return {
          container: styles.secondaryContainer,
          textColor: colors.textPrimary,
        };
      case 'outline':
        return {
          container: styles.outlineContainer,
          textColor: colors.primary,
        };
      case 'ghost':
        return {
          container: styles.ghostContainer,
          textColor: colors.primary,
        };
      case 'primary':
      default:
        return {
          container: styles.primaryContainer,
          textColor: colors.background,
        };
    }
  };

  const getSizeStyles = () => {
    switch (size) {
      case 'sm':
        return {
          height: 36,
          paddingHorizontal: spacing.md,
          textVariant: 'supporting' as const,
        };
      case 'lg':
        return {
          height: 52,
          paddingHorizontal: spacing.xl,
          textVariant: 'body' as const,
        };
      case 'md':
      default:
        return {
          height: 44, // WCAG minimum touch target
          paddingHorizontal: spacing.base,
          textVariant: 'supporting' as const,
        };
    }
  };

  const { container, textColor } = getVariantStyles();
  const { height, paddingHorizontal, textVariant } = getSizeStyles();

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.base,
        container,
        { height, paddingHorizontal },
        fullWidth && styles.fullWidth,
        disabled && styles.disabled,
        style,
      ]}
      {...touchableProps}
    >
      {iconLeft && <View style={styles.iconLeft}>{iconLeft}</View>}
      <Text
        variant={textVariant}
        style={[
          styles.text,
          { color: disabled ? colors.textSecondary : textColor },
        ]}
      >
        {title}
      </Text>
      {iconRight && <View style={styles.iconRight}>{iconRight}</View>}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
  fullWidth: {
    width: '100%',
  },
  disabled: {
    opacity: 0.5,
  },
  primaryContainer: {
    backgroundColor: colors.primary,
  },
  secondaryContainer: {
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  outlineContainer: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  ghostContainer: {
    backgroundColor: 'transparent',
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  iconLeft: {
    marginRight: spacing.sm,
  },
  iconRight: {
    marginLeft: spacing.sm,
  },
});

export default Button;

