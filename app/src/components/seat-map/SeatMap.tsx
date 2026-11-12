import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { SeatCell } from './SeatCell';
import { CinemaScreenIndicator } from './CinemaScreenIndicator';
import { SeatLegend } from './SeatLegend';
import { AuditoriumLayout, SeatModel } from '@/data/mockSeats';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export interface SeatMapProps {
  layout: AuditoriumLayout;
  selectedSeatIds: Set<string>;
  onToggleSeat: (seat: SeatModel) => void;
  maxSeats?: number;
}

export type SectionFilter = 'all' | 'accessible' | 'standard' | 'vip' | 'couple';

export const SeatMap: React.FC<SeatMapProps> = ({
  layout,
  selectedSeatIds,
  onToggleSeat,
  maxSeats = 8,
}) => {
  const [density, setDensity] = useState<'standard' | 'compact'>('standard');
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('all');

  const filteredRows = useMemo(() => {
    if (sectionFilter === 'all') return layout.rows;
    return layout.rows.filter((r) => r.tier === sectionFilter);
  }, [layout.rows, sectionFilter]);

  const isCompact = density === 'compact';

  return (
    <View style={styles.container}>
      {/* Top Controls: Zoom / Density Toggle & Section Navigator */}
      <View style={styles.controlsRow}>
        {/* Section Jump Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sectionChipsScroll}
        >
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => setSectionFilter('all')}
            style={[
              styles.sectionChip,
              sectionFilter === 'all' && styles.sectionChipActive,
            ]}
          >
            <Text
              variant="caption"
              style={[
                styles.sectionChipText,
                { color: sectionFilter === 'all' ? colors.background : colors.textSecondary },
              ]}
            >
              All 320 Seats
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => setSectionFilter('accessible')}
            style={[
              styles.sectionChip,
              sectionFilter === 'accessible' && styles.sectionChipActive,
            ]}
          >
            <Text
              variant="caption"
              style={[
                styles.sectionChipText,
                { color: sectionFilter === 'accessible' ? colors.background : colors.textSecondary },
              ]}
            >
              Accessible (Row A)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => setSectionFilter('standard')}
            style={[
              styles.sectionChip,
              sectionFilter === 'standard' && styles.sectionChipActive,
            ]}
          >
            <Text
              variant="caption"
              style={[
                styles.sectionChipText,
                { color: sectionFilter === 'standard' ? colors.background : colors.textSecondary },
              ]}
            >
              Standard (B–J)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => setSectionFilter('vip')}
            style={[
              styles.sectionChip,
              sectionFilter === 'vip' && styles.sectionChipActive,
            ]}
          >
            <Text
              variant="caption"
              style={[
                styles.sectionChipText,
                { color: sectionFilter === 'vip' ? colors.background : colors.textSecondary },
              ]}
            >
              VIP Recliners (K–R)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => setSectionFilter('couple')}
            style={[
              styles.sectionChip,
              sectionFilter === 'couple' && styles.sectionChipActive,
            ]}
          >
            <Text
              variant="caption"
              style={[
                styles.sectionChipText,
                { color: sectionFilter === 'couple' ? colors.background : colors.textSecondary },
              ]}
            >
              Couples (S–V)
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Density View Toggle Button */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setDensity(isCompact ? 'standard' : 'compact')}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={isCompact ? 'Zoom In to Standard view' : 'Zoom Out to Overview'}
          style={styles.densityBtn}
        >
          <Ionicons
            name={isCompact ? 'expand' : 'contract'}
            size={16}
            color={colors.primary}
          />
          <Text variant="caption" color="primary" style={styles.densityBtnText}>
            {isCompact ? 'Zoom In' : 'Overview'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Seat Map Legend */}
      <SeatLegend
        tierPricing={layout.tierPricing}
        couplePairPriceKobo={layout.couplePairPriceKobo}
      />

      {/* Screen Direction Indicator */}
      <CinemaScreenIndicator screenName={layout.hallName} />

      {/* Two-Dimensional Pan Viewport */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={true}
        contentContainerStyle={styles.horizontalScrollContent}
      >
        <View style={styles.auditoriumGrid}>
          {filteredRows.map((row) => (
            <View key={row.row} style={styles.rowWrapper}>
              {/* Left Row Label */}
              <View style={[styles.rowLabelBox, isCompact && styles.rowLabelBoxCompact]}>
                <Text
                  variant="caption"
                  color="textSecondary"
                  style={[styles.rowLetter, isCompact && styles.rowLetterCompact]}
                >
                  {row.row}
                </Text>
              </View>

              {/* Left Seat Block (cols 1..4) */}
              <View style={styles.block}>
                {row.seats.slice(0, 4).map((seat) => (
                  <SeatCell
                    key={seat.id}
                    seat={seat}
                    isSelected={selectedSeatIds.has(seat.id)}
                    onToggle={onToggleSeat}
                    density={density}
                  />
                ))}
              </View>

              {/* Left Aisle Gap */}
              <View style={[styles.aisle, isCompact && styles.aisleCompact]} />

              {/* Center Seat Block (cols 5..12) */}
              <View style={styles.block}>
                {row.seats.slice(4, 12).map((seat) => (
                  <SeatCell
                    key={seat.id}
                    seat={seat}
                    isSelected={selectedSeatIds.has(seat.id)}
                    onToggle={onToggleSeat}
                    density={density}
                  />
                ))}
              </View>

              {/* Right Aisle Gap */}
              <View style={[styles.aisle, isCompact && styles.aisleCompact]} />

              {/* Right Seat Block (cols 13..16) */}
              <View style={styles.block}>
                {row.seats.slice(12, 16).map((seat) => (
                  <SeatCell
                    key={seat.id}
                    seat={seat}
                    isSelected={selectedSeatIds.has(seat.id)}
                    onToggle={onToggleSeat}
                    density={density}
                  />
                ))}
              </View>

              {/* Right Row Label */}
              <View style={[styles.rowLabelBox, isCompact && styles.rowLabelBoxCompact]}>
                <Text
                  variant="caption"
                  color="textSecondary"
                  style={[styles.rowLetter, isCompact && styles.rowLetterCompact]}
                >
                  {row.row}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

export default SeatMap;

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  sectionChipsScroll: {
    gap: spacing.xs,
    paddingVertical: 2,
  },
  sectionChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sectionChipText: {
    fontWeight: '600',
    fontSize: 11,
  },
  densityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.elevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 32,
  },
  densityBtnText: {
    fontWeight: '700',
    fontSize: 11,
  },
  horizontalScrollContent: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.lg,
  },
  auditoriumGrid: {
    alignItems: 'center',
  },
  rowWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowLabelBox: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabelBoxCompact: {
    width: 16,
  },
  rowLetter: {
    fontWeight: '700',
    fontSize: 12,
  },
  rowLetterCompact: {
    fontSize: 9,
  },
  block: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aisle: {
    width: 18,
  },
  aisleCompact: {
    width: 10,
  },
});

