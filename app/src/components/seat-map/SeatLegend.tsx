import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { SeatTier } from '@/data/mockSeats';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export interface SeatLegendProps {
  tierPricing?: Record<SeatTier, number>;
  couplePairPriceKobo?: number;
}

function formatLegendPrice(kobo: number): string {
  const naira = Math.round(kobo / 100);
  if (naira >= 1000) {
    const k = naira / 1000;
    return `₦${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `₦${naira}`;
}

export const SeatLegend: React.FC<SeatLegendProps> = ({
  tierPricing,
  couplePairPriceKobo,
}) => {
  const standardPriceLabel = tierPricing
    ? formatLegendPrice(tierPricing.standard)
    : '₦7k';
  const vipPriceLabel = tierPricing
    ? formatLegendPrice(tierPricing.vip)
    : '₦9.5k';
  const couplePriceLabel = couplePairPriceKobo
    ? formatLegendPrice(couplePairPriceKobo)
    : '₦12k';
  const accessiblePriceLabel = tierPricing
    ? formatLegendPrice(tierPricing.accessible)
    : '₦7k';

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {/* Available */}
        <View style={styles.legendItem}>
          <View style={[styles.sampleSeat, styles.availableSeat]} />
          <Text variant="caption" color="textSecondary">
            Standard ({standardPriceLabel})
          </Text>
        </View>

        {/* Selected */}
        <View style={styles.legendItem}>
          <View style={[styles.sampleSeat, styles.selectedSeat]}>
            <Ionicons name="checkmark" size={10} color={colors.background} />
          </View>
          <Text variant="caption" color="primary">
            Selected
          </Text>
        </View>

        {/* Held */}
        <View style={styles.legendItem}>
          <View style={[styles.sampleSeat, styles.heldSeat]}>
            <Ionicons name="time-outline" size={9} color={colors.highlight} />
          </View>
          <Text variant="caption" color="highlight">
            Held
          </Text>
        </View>

        {/* Sold */}
        <View style={styles.legendItem}>
          <View style={[styles.sampleSeat, styles.soldSeat]}>
            <Ionicons name="close" size={9} color="rgba(174, 168, 191, 0.4)" />
          </View>
          <Text variant="caption" color="textSecondary">
            Sold
          </Text>
        </View>
      </View>

      <View style={[styles.row, styles.secondRow]}>
        {/* VIP Recliner */}
        <View style={styles.legendItem}>
          <View style={[styles.sampleSeat, styles.vipSeat]} />
          <Text variant="caption" color="textSecondary">
            VIP ({vipPriceLabel})
          </Text>
        </View>

        {/* Couple Lounger */}
        <View style={styles.legendItem}>
          <View style={[styles.sampleSeat, styles.coupleSeat]} />
          <Text variant="caption" color="textSecondary">
            Couple ({couplePriceLabel} / pair)
          </Text>
        </View>

        {/* Accessible */}
        <View style={styles.legendItem}>
          <View style={[styles.sampleSeat, styles.accessibleSeat]}>
            <Ionicons name="accessibility" size={9} color={colors.seatAccessible} />
          </View>
          <Text variant="caption" color="textSecondary">
            Accessible ({accessiblePriceLabel})
          </Text>
        </View>
      </View>
    </View>
  );
};

export default SeatLegend;

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.base,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  secondRow: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderColor: 'rgba(41, 37, 54, 0.6)',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sampleSeat: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  availableSeat: {
    backgroundColor: colors.seatAvailable,
    borderColor: colors.seatAvailableBorder,
  },
  selectedSeat: {
    backgroundColor: colors.seatSelected,
    borderColor: colors.seatSelected,
  },
  heldSeat: {
    backgroundColor: 'rgba(246, 190, 99, 0.16)',
    borderColor: colors.highlight,
  },
  soldSeat: {
    backgroundColor: colors.seatSold,
    borderColor: colors.seatSoldBorder,
  },
  vipSeat: {
    backgroundColor: 'rgba(139, 92, 246, 0.22)',
    borderColor: colors.seatVip,
  },
  coupleSeat: {
    backgroundColor: 'rgba(236, 72, 153, 0.22)',
    borderColor: colors.seatCouple,
  },
  accessibleSeat: {
    backgroundColor: 'rgba(56, 189, 248, 0.22)',
    borderColor: colors.seatAccessible,
  },
});

