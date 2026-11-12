import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Animated,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  visible: boolean;
  message: string;
  type?: ToastType;
  onDismiss?: () => void;
  actionTitle?: string;
  onActionPress?: () => void;
  durationMs?: number;
  style?: StyleProp<ViewStyle>;
}

export const Toast: React.FC<ToastProps> = ({
  visible,
  message,
  type = 'info',
  onDismiss,
  actionTitle,
  onActionPress,
  durationMs = 4000,
  style,
}) => {
  const [fadeAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();

      if (durationMs > 0 && onDismiss) {
        const timer = setTimeout(() => {
          onDismiss();
        }, durationMs);
        return () => clearTimeout(timer);
      }
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, durationMs, onDismiss, fadeAnim]);

  if (!visible) return null;

  const getTypeConfig = () => {
    switch (type) {
      case 'success':
        return {
          icon: 'checkmark-circle-outline' as const,
          color: colors.success,
          bg: 'rgba(74, 222, 128, 0.12)',
          borderColor: 'rgba(74, 222, 128, 0.3)',
        };
      case 'error':
        return {
          icon: 'alert-circle-outline' as const,
          color: colors.error,
          bg: 'rgba(255, 113, 133, 0.12)',
          borderColor: 'rgba(255, 113, 133, 0.3)',
        };
      case 'warning':
        return {
          icon: 'warning-outline' as const,
          color: colors.highlight,
          bg: 'rgba(246, 190, 99, 0.12)',
          borderColor: 'rgba(246, 190, 99, 0.3)',
        };
      case 'info':
      default:
        return {
          icon: 'information-circle-outline' as const,
          color: colors.primary,
          bg: 'rgba(183, 138, 247, 0.12)',
          borderColor: 'rgba(183, 138, 247, 0.3)',
        };
    }
  };

  const { icon, color, bg, borderColor } = getTypeConfig();

  return (
    <Animated.View
      style={[
        styles.toastContainer,
        {
          backgroundColor: bg,
          borderColor,
          opacity: fadeAnim,
        },
        style,
      ]}
      accessible={true}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Ionicons name={icon} size={20} color={color} style={styles.icon} />

      <Text variant="supporting" color="textPrimary" style={styles.messageText}>
        {message}
      </Text>

      {actionTitle && onActionPress && (
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={onActionPress}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={actionTitle}
          style={styles.actionBtn}
        >
          <Text variant="caption" color="primary" style={styles.actionText}>
            {actionTitle}
          </Text>
        </TouchableOpacity>
      )}

      {onDismiss && (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={onDismiss}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Dismiss toast"
          style={styles.dismissBtn}
        >
          <Ionicons name="close" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  toastContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    width: '100%',
  },
  icon: {
    marginRight: spacing.xs,
  },
  messageText: {
    flex: 1,
    lineHeight: 18,
  },
  actionBtn: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  actionText: {
    fontWeight: '700',
  },
  dismissBtn: {
    padding: spacing.xs,
    marginLeft: spacing.xs,
  },
});

export default Toast;

