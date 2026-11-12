import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { getMovieById } from '@/data/mockMovies';
import {
  LAGOS_CINEMAS,
  Cinema,
  ShowtimeSlot,
  generateDateRibbon,
  DayOption,
} from '@/data/mockCinemas';
import { APPROVED_SHOWTIME_PRICE_LABEL } from '@/data/mockSeats';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export default function CinemasAndShowtimesScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();

  const movie = id ? getMovieById(id) : undefined;
  const dateRibbon = useMemo(() => generateDateRibbon(), []);
  const [selectedDate, setSelectedDate] = useState<DayOption>(dateRibbon[0]);

  // Selected showtime state
  const [selectedCinema, setSelectedCinema] = useState<Cinema | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<ShowtimeSlot | null>(null);

  // Filter cinemas showing this movie
  const availableCinemas = useMemo(() => {
    if (!movie) return [];
    return LAGOS_CINEMAS.filter(
      (c) => c.showtimesByMovie[movie.id] && c.showtimesByMovie[movie.id].length > 0
    );
  }, [movie]);

  if (!movie) {
    return (
      <SafeAreaView style={styles.notFoundContainer}>
        <EmptyState
          iconName="film-outline"
          title="Movie Not Found"
          message="We could not find the showtimes for the requested film."
          actionTitle="Back to Discover"
          onActionPress={() => router.replace('/')}
        />
      </SafeAreaView>
    );
  }

  const isComingSoon = movie.category === 'coming_soon' || availableCinemas.length === 0;

  const handleShowtimePress = (cinema: Cinema, slot: ShowtimeSlot) => {
    setSelectedCinema(cinema);
    setSelectedSlot(slot);
  };

  const handleProceedToSeatSelection = () => {
    if (!selectedCinema || !selectedSlot) return;
    router.push({
      pathname: '/seat-selection',
      params: {
        movieId: movie.id,
        cinemaId: selectedCinema.id,
        showtimeId: selectedSlot.id,
        date: selectedDate.dateString,
      },
    } as any);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top Header Bar */}
      <SafeAreaView edges={['top']} style={styles.topHeader}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => router.back()}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerTitleGroup}>
          <Text variant="heading2" color="textPrimary" numberOfLines={1}>
            {movie.title}
          </Text>
          <Text variant="caption" color="textSecondary">
            {movie.genres.slice(0, 2).join(' • ')} • {movie.runtime} • {movie.ageRating}
          </Text>
        </View>

        <View style={styles.headerPosterThumbnail}>
          <Image
            source={{ uri: movie.posterUrl }}
            style={styles.thumbnailImage}
            resizeMode="cover"
          />
        </View>
      </SafeAreaView>

      {/* Disclaimer banner for mock Lagos listings */}
      <View style={styles.disclaimerBanner}>
        <Ionicons name="information-circle-outline" size={16} color={colors.highlight} />
        <Text variant="caption" color="textSecondary" style={styles.disclaimerText}>
          Mock Lagos Cinema listings for Matinee project. Simulated schedules.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: selectedSlot ? 130 + insets.bottom : 50 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Date Selection Ribbon */}
        <View style={styles.dateSection}>
          <Text variant="supporting" color="textPrimary" style={styles.sectionHeaderTitle}>
            Select Date
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dateScroll}
          >
            {dateRibbon.map((day) => {
              const isSelected = selectedDate.dateString === day.dateString;
              return (
                <TouchableOpacity
                  key={day.dateString}
                  activeOpacity={0.8}
                  onPress={() => {
                    setSelectedDate(day);
                    // Clear selected showtime on date change
                    setSelectedSlot(null);
                    setSelectedCinema(null);
                  }}
                  accessible={true}
                  accessibilityRole="button"
                  accessibilityLabel={`${day.dayName}, ${day.month} ${day.dayNumber}`}
                  style={[
                    styles.datePill,
                    isSelected && styles.datePillActive,
                  ]}
                >
                  <Text
                    variant="caption"
                    style={[
                      styles.dateDayName,
                      { color: isSelected ? colors.background : colors.textSecondary },
                    ]}
                  >
                    {day.dayName}
                  </Text>
                  <Text
                    variant="heading2"
                    style={[
                      styles.dateDayNumber,
                      { color: isSelected ? colors.background : colors.textPrimary },
                    ]}
                  >
                    {day.dayNumber}
                  </Text>
                  <Text
                    variant="caption"
                    style={[
                      styles.dateMonth,
                      { color: isSelected ? colors.background : colors.textSecondary },
                    ]}
                  >
                    {day.month}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Cinema Listings */}
        <View style={styles.cinemasSection}>
          <Text variant="supporting" color="textPrimary" style={styles.sectionHeaderTitle}>
            Available Lagos Theaters ({selectedDate.dayName})
          </Text>

          {!isComingSoon ? (
            availableCinemas.map((cinema) => {
              const showtimes = cinema.showtimesByMovie[movie.id] || [];

              return (
                <Card
                  key={cinema.id}
                  variant="surface"
                  padding="base"
                  style={styles.cinemaCard}
                >
                  {/* Cinema Info Row */}
                  <View style={styles.cinemaInfoRow}>
                    <View style={styles.cinemaNameCol}>
                      <Text variant="heading2" color="textPrimary" style={styles.cinemaName}>
                        {cinema.name}
                      </Text>
                      <Text variant="caption" color="textSecondary" style={styles.cinemaAddress}>
                        {cinema.address}
                      </Text>
                    </View>

                    <View style={styles.distanceBadgeWrapper}>
                      <Badge label={`${cinema.distanceKm} km`} variant="outline" size="sm" />
                    </View>
                  </View>

                  {/* Cinema Features */}
                  <View style={styles.featuresRow}>
                    {cinema.features.map((feat) => (
                      <View key={feat} style={styles.featurePill}>
                        <Text variant="caption" color="textSecondary">
                          {feat}
                        </Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.divider} />

                  {/* Showtimes Grid */}
                  <View style={styles.showtimesGrid}>
                    {showtimes.map((slot) => {
                      const isSlotSelected =
                        selectedSlot?.id === slot.id &&
                        selectedCinema?.id === cinema.id;

                      return (
                        <TouchableOpacity
                          key={slot.id}
                          activeOpacity={0.8}
                          onPress={() => handleShowtimePress(cinema, slot)}
                          accessible={true}
                          accessibilityRole="button"
                          accessibilityLabel={`${slot.time}, ${slot.format}, ${APPROVED_SHOWTIME_PRICE_LABEL}`}
                          style={[
                            styles.slotPill,
                            isSlotSelected && styles.slotPillSelected,
                          ]}
                        >
                          {/* Time & Format */}
                          <Text
                            variant="supporting"
                            style={[
                              styles.slotTimeText,
                              {
                                color: isSlotSelected
                                  ? colors.background
                                  : colors.textPrimary,
                              },
                            ]}
                          >
                            {slot.time}
                          </Text>

                          <Text
                            variant="caption"
                            numberOfLines={1}
                            style={[
                              styles.slotFormatText,
                              {
                                color: isSlotSelected
                                  ? colors.background
                                  : colors.primary,
                              },
                            ]}
                          >
                            {slot.format}
                          </Text>

                          {/* Price & Occupancy Indicator */}
                          <View style={styles.slotFooter}>
                            <View
                              style={[
                                styles.occupancyDot,
                                {
                                  backgroundColor:
                                    slot.status === 'filling_fast'
                                      ? colors.warning
                                      : colors.success,
                                },
                              ]}
                            />
                            <Text
                              variant="caption"
                              numberOfLines={1}
                              style={[
                                styles.slotPriceText,
                                {
                                  color: isSlotSelected
                                    ? colors.background
                                    : colors.highlight,
                                },
                              ]}
                            >
                              {APPROVED_SHOWTIME_PRICE_LABEL}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </Card>
              );
            })
          ) : (
            <EmptyState
              iconName="calendar-outline"
              title="No Showtimes Scheduled"
              message={`Showtimes for ${movie.title} are not yet active for ${selectedDate.dayName}. Premiere tickets will be announced closer to release.`}
              actionTitle="Back to Movie Details"
              onActionPress={() => router.back()}
              secondaryActionTitle="Explore Now Showing"
              onSecondaryActionPress={() => router.replace('/')}
              style={styles.noShowtimesEmpty}
            />
          )}
        </View>
      </ScrollView>

      {/* Sticky Bottom Bar for Selected Showtime */}
      {selectedSlot && selectedCinema && (
        <View
          style={[
            styles.bottomStickyBar,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}
        >
          <View style={styles.selectedMetaCol}>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {selectedCinema.name}
            </Text>
            <View style={styles.selectedTimePriceRow}>
              <Text variant="heading2" color="primary" style={styles.selectedTimeText}>
                {selectedSlot.time}
              </Text>
              <Text variant="supporting" color="textPrimary" style={styles.selectedPriceText}>
                • {APPROVED_SHOWTIME_PRICE_LABEL}
              </Text>
            </View>
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {selectedSlot.screen}
            </Text>
          </View>

          <Button
            title="Select Seats"
            variant="primary"
            size="lg"
            iconRight={
              <Ionicons name="arrow-forward" size={18} color={colors.background} />
            }
            onPress={handleProceedToSeatSelection}
            style={styles.proceedBtn}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Proceed to seat selection"
            accessibilityHint="Selects seats for the chosen cinema and showtime"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  notFoundContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topHeader: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  backBtn: {
    width: 44, // WCAG 44pt touch target
    height: 44,
    borderRadius: radii.full,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitleGroup: {
    flex: 1,
  },
  headerPosterThumbnail: {
    width: 36,
    height: 50,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  disclaimerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(246, 190, 99, 0.08)',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    borderBottomWidth: 1,
    borderColor: 'rgba(246, 190, 99, 0.2)',
  },
  disclaimerText: {
    flex: 1,
    fontSize: 11,
  },
  scrollContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
  dateSection: {
    marginBottom: spacing.xl,
  },
  sectionHeaderTitle: {
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  dateScroll: {
    gap: spacing.sm,
  },
  datePill: {
    width: 66,
    height: 84, // Plenty of touch target area
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
  },
  datePillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dateDayName: {
    fontWeight: '600',
    marginBottom: 2,
  },
  dateDayNumber: {
    fontWeight: '800',
  },
  dateMonth: {
    fontWeight: '500',
  },
  cinemasSection: {
    marginBottom: spacing.xl,
  },
  cinemaCard: {
    marginBottom: spacing.base,
  },
  cinemaInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  cinemaNameCol: {
    flex: 1,
    marginRight: spacing.sm,
  },
  cinemaName: {
    fontWeight: '700',
    marginBottom: 2,
  },
  cinemaAddress: {
    fontSize: 11,
  },
  distanceBadgeWrapper: {
    alignSelf: 'flex-start',
  },
  featuresRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginVertical: spacing.xs,
  },
  featurePill: {
    backgroundColor: colors.elevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  showtimesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  slotPill: {
    width: '47.5%', // 2-column responsive layout
    minHeight: 74,
    borderRadius: radii.md,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    justifyContent: 'space-between',
  },
  slotPillSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  slotTimeText: {
    fontWeight: '700',
    fontSize: 16,
  },
  slotFormatText: {
    fontWeight: '600',
    fontSize: 11,
  },
  slotFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  occupancyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  slotPriceText: {
    fontWeight: '700',
    fontSize: 11,
  },
  noShowtimesEmpty: {
    marginTop: spacing.md,
  },
  bottomStickyBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    elevation: 12,
  },
  selectedMetaCol: {
    flex: 1,
  },
  selectedTimePriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  selectedTimeText: {
    fontWeight: '800',
  },
  selectedPriceText: {
    fontWeight: '700',
  },
  proceedBtn: {
    minWidth: 150,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  modalIconCircle: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.base,
  },
  modalTitle: {
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  modalBody: {
    marginBottom: spacing.md,
  },
  bookingSummaryBox: {
    width: '100%',
    backgroundColor: colors.elevated,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.base,
    gap: spacing.xs,
  },
  summaryItem: {
    fontWeight: '500',
  },
  modalHint: {
    fontStyle: 'italic',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.sm,
  },
  modalBtn: {
    width: '100%',
  },
});
