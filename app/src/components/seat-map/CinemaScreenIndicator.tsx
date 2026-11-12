import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/Text';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export interface CinemaScreenIndicatorProps {
  screenName?: string;
}

export const CinemaScreenIndicator: React.FC<CinemaScreenIndicatorProps> = ({
  screenName = 'SCREEN THIS WAY',
}) => {
  return (
    <View style={styles.container}>
      {/* Curved Screen Bar */}
      <View style={styles.screenCurve}>
        <View style={styles.screenGlow} />
      </View>

      <Text variant="caption" color="textSecondary" style={styles.screenText}>
        {screenName}
      </Text>
    </View>
  );
};

export default CinemaScreenIndicator;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: spacing.md,
    width: '100%',
  },
  screenCurve: {
    width: '84%',
    height: 6,
    backgroundColor: colors.primary,
    borderTopLeftRadius: radii.full,
    borderTopRightRadius: radii.full,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 6,
    overflow: 'hidden',
  },
  screenGlow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#FAF8FF',
    opacity: 0.35,
  },
  screenText: {
    marginTop: spacing.xs,
    letterSpacing: 2,
    fontWeight: '700',
    fontSize: 10,
  },
});
