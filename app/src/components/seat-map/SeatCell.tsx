import React from 'react';
import {
  TouchableOpacity,
  StyleSheet,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { SeatModel, formatKoboToNgn } from '@/data/mockSeats';
import { colors } from '@/theme/colors';
import { radii } from '@/theme/radii';

export interface SeatCellProps {
  seat: SeatModel;
  isSelected: boolean;
  onToggle: (seat: SeatModel) => void;
  density?: 'standard' | 'compact';
  style?: StyleProp<ViewStyle>;
}

export const SeatCellComponent: React.FC<SeatCellProps> = ({
  seat,
  isSelected,
  onToggle,
  density = 'standard',
  style,
}) => {
  const isAvailable = seat.status === 'available';
  const isHeld = seat.status === 'held';
  const isSold = seat.status === 'sold';
  const isCompact = density === 'compact';

  const getSeatColor = () => {
    if (isSelected) {
      return {
        bg: colors.seatSelected,
        border: colors.seatSelected,
        text: colors.background,
      };
    }
    if (isHeld) {
      return {
        bg: 'rgba(246, 190, 99, 0.14)',
        border: 'rgba(246, 190, 99, 0.45)',
        text: colors.highlight,
      };
    }
    if (isSold) {
      return {
        bg: colors.seatSold,
        border: colors.seatSoldBorder,
        text: 'rgba(174, 168, 191, 0.25)',
      };
    }
    // Available states by tier
    if (seat.tier === 'vip') {
      return {
        bg: 'rgba(139, 92, 246, 0.18)',
        border: 'rgba(139, 92, 246, 0.4)',
        text: colors.seatVip,
      };
    }
    if (seat.tier === 'couple') {
      return {
        bg: 'rgba(236, 72, 153, 0.18)',
        border: 'rgba(236, 72, 153, 0.4)',
        text: colors.seatCouple,
      };
    }
    if (seat.isAccessible) {
      return {
        bg: 'rgba(56, 189, 248, 0.18)',
        border: 'rgba(56, 189, 248, 0.4)',
        text: colors.seatAccessible,
      };
    }
    return {
      bg: colors.seatAvailable,
      border: colors.seatAvailableBorder,
      text: colors.textSecondary,
    };
  };

  const { bg, border, text } = getSeatColor();

  const handlePress = () => {
    if (!isAvailable) return;
    onToggle(seat);
  };

  const tierDescription = seat.isAccessible
    ? 'wheelchair accessible'
    : seat.isCouple
    ? 'couple lounger pair seat'
    : seat.tier === 'vip'
    ? 'VIP recliner'
    : 'standard seat';

  const statusDescription = isSelected ? 'currently selected' : seat.status;
  const priceFormatted = formatKoboToNgn(seat.priceKobo);

  const accessibilityLabel = `Seat ${seat.displayLabel}, ${tierDescription}, ${priceFormatted}, ${statusDescription}`;

  const accessibilityHint = isSelected
    ? 'Double tap to deselect this seat'
    : isAvailable
    ? seat.isCouple
      ? 'Double tap to select this couple lounger pair'
      : 'Double tap to select this seat'
    : seat.status === 'held'
    ? 'Seat is temporarily held by another customer'
    : 'Seat is sold and unavailable';

  // Effective touch target: ensures >= 44x44pt per WCAG 2.1 AA
  // Standard: 38x38pt + {top: 4, bottom: 4, left: 3, right: 3} = 46x44pt
  // Compact: 22x22pt + {top: 11, bottom: 11, left: 11, right: 11} = 44x44pt
  const hitSlop = isCompact
    ? { top: 11, bottom: 11, left: 11, right: 11 }
    : { top: 4, bottom: 4, left: 3, right: 3 };

  return (
    <TouchableOpacity
      activeOpacity={isAvailable ? 0.75 : 1}
      onPress={handlePress}
      disabled={!isAvailable}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{
        selected: isSelected,
        disabled: !isAvailable,
      }}
      hitSlop={hitSlop}
      style={[
        styles.base,
        isCompact ? styles.sizeCompact : styles.sizeStandard,
        {
          backgroundColor: bg,
          borderColor: border,
        },
        seat.isCouple && (isCompact ? styles.coupleCompact : styles.coupleStandard),
        style,
      ]}
    >
      {/* Icon accessories for special tiers and states */}
      {seat.isAccessible ? (
        <Ionicons
          name="accessibility"
          size={isCompact ? 10 : 13}
          color={text}
        />
      ) : isHeld ? (
        <Ionicons
          name="time-outline"
          size={isCompact ? 10 : 12}
          color={text}
        />
      ) : isSold ? (
        <Ionicons
          name="close"
          size={isCompact ? 9 : 11}
          color={text}
        />
      ) : (
        <Text
          variant="caption"
          style={[
            styles.colNumber,
            isCompact ? styles.colNumberCompact : styles.colNumberStandard,
            { color: text },
          ]}
        >
          {seat.col}
        </Text>
      )}
    </TouchableOpacity>
  );
};

// Strict memoization comparison prevents re-rendering unselected seats when one seat toggles
function arePropsEqual(prev: SeatCellProps, next: SeatCellProps): boolean {
  return (
    prev.isSelected === next.isSelected &&
    prev.density === next.density &&
    prev.seat.status === next.seat.status &&
    prev.seat.id === next.seat.id
  );
}

export const SeatCell = React.memo(SeatCellComponent, arePropsEqual);
export default SeatCell;

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radii.sm,
  },
  sizeStandard: {
    width: 38,
    height: 38,
    marginHorizontal: 3,
    marginVertical: 4,
  },
  sizeCompact: {
    width: 22,
    height: 22,
    marginHorizontal: 1.5,
    marginVertical: 2,
    borderRadius: 4,
  },
  coupleStandard: {
    borderTopLeftRadius: radii.md,
    borderTopRightRadius: radii.md,
  },
  coupleCompact: {
    borderTopLeftRadius: radii.sm,
    borderTopRightRadius: radii.sm,
  },
  colNumber: {
    fontWeight: '700',
  },
  colNumberStandard: {
    fontSize: 11,
    lineHeight: 14,
  },
  colNumberCompact: {
    fontSize: 8,
    lineHeight: 10,
  },
});

