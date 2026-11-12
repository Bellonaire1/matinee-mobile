import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Animated,
  ViewStyle,
  StyleProp,
  DimensionValue,
} from 'react-native';
import { colors } from '@/theme/colors';
import { radii } from '@/theme/radii';

export type SkeletonVariant = 'rect' | 'circle' | 'line' | 'card' | 'poster';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  variant?: SkeletonVariant;
  style?: StyleProp<ViewStyle>;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 16,
  borderRadius,
  variant = 'rect',
  style,
}) => {
  const [opacityAnim] = useState(() => new Animated.Value(0.35));

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacityAnim, {
          toValue: 0.75,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.35,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    return () => pulse.stop();
  }, [opacityAnim]);

  const getVariantStyles = (): {
    defaultWidth: DimensionValue;
    defaultHeight: DimensionValue;
    defaultRadius: number;
  } => {
    switch (variant) {
      case 'circle':
        return {
          defaultWidth: 48,
          defaultHeight: 48,
          defaultRadius: radii.full,
        };
      case 'line':
        return {
          defaultWidth: '100%',
          defaultHeight: 14,
          defaultRadius: radii.sm,
        };
      case 'card':
        return {
          defaultWidth: '100%',
          defaultHeight: 120,
          defaultRadius: radii.md,
        };
      case 'poster':
        return {
          defaultWidth: 148,
          defaultHeight: 222, // 2:3 poster ratio
          defaultRadius: radii.md,
        };
      case 'rect':
      default:
        return {
          defaultWidth: width,
          defaultHeight: height,
          defaultRadius: radii.sm,
        };
    }
  };

  const { defaultWidth, defaultHeight, defaultRadius } = getVariantStyles();

  return (
    <Animated.View
      style={[
        styles.skeletonBase,
        {
          width: width ?? defaultWidth,
          height: height ?? defaultHeight,
          borderRadius: borderRadius ?? defaultRadius,
          opacity: opacityAnim,
        },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  skeletonBase: {
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
});

export default Skeleton;

