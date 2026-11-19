import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Share,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Movie, getMovieById } from '@/data/mockMovies';
import { getCinemasWithShowtimesForMovie } from '@/data/mockCinemas';
import { APPROVED_MOVIE_STARTING_PRICE } from '@/data/mockSeats';
import { discoveryApi, IS_LIVE_API_ENABLED } from '@/api/discoveryApi';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export default function MovieDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [isSynopsisExpanded, setIsSynopsisExpanded] = useState(false);
  const [backdropError, setBackdropError] = useState(false);
  const [posterError, setPosterError] = useState(false);

  const fallbackMovie = id ? getMovieById(id) : undefined;
  const [movie, setMovie] = useState<Movie | undefined>(fallbackMovie);
  const [attribution, setAttribution] = useState<string | undefined>(undefined);

  useEffect(() => {
    let isMounted = true;
    if (id && IS_LIVE_API_ENABLED) {
      discoveryApi.getMovieById(id).then((res) => {
        if (!isMounted || !res.data) return;
        setMovie(res.data);
        setAttribution(res.attribution);
      }).catch(() => {
        // Safe fallback
      });
    }
    return () => {
      isMounted = false;
    };
  }, [id]);

  const cinemaAvailability = id ? getCinemasWithShowtimesForMovie(id) : [];

  // Graceful fallback for missing movie ID
  if (!movie) {
    return (
      <SafeAreaView style={styles.notFoundContainer}>
        <EmptyState
          iconName="film-outline"
          title="Movie Not Found"
          message="We could not find the movie you requested. It may have left theaters or the link is invalid."
          actionTitle="Back to Movies"
          onActionPress={() => router.replace('/')}
        />
      </SafeAreaView>
    );
  }

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Watch ${movie.title} (${movie.releaseYear}) at Matinee Cinema!`,
        title: movie.title,
      });
    } catch {
      // User dismissed share dialog
    }
  };

  const isComingSoon = movie.category === 'coming_soon';

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 110 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Artwork Header */}
        <View style={styles.heroWrapper}>
          {!backdropError ? (
            <Image
              source={{ uri: movie.backdropUrl }}
              style={styles.backdropImage}
              resizeMode="cover"
              onError={() => setBackdropError(true)}
            />
          ) : (
            <View style={styles.fallbackBackdrop}>
              <Ionicons name="film" size={64} color={colors.border} />
            </View>
          )}

          {/* Scrim Gradients */}
          <View style={styles.backdropScrim} />

          {/* Floating Top Nav (Back and Share) */}
          <SafeAreaView edges={['top']} style={styles.topNavOverlay}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => router.back()}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={styles.navIconBtn}
            >
              <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
            </TouchableOpacity>

            <View style={styles.navRightGroup}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleShare}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel="Share movie details"
                style={styles.navIconBtn}
              >
                <Ionicons name="share-outline" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </SafeAreaView>

          {/* Floating Poster & Essential Badges */}
          <View style={styles.heroPosterRow}>
            <View style={styles.posterContainer}>
              {!posterError ? (
                <Image
                  source={{ uri: movie.posterUrl }}
                  style={styles.posterImage}
                  resizeMode="cover"
                  onError={() => setPosterError(true)}
                />
              ) : (
                <View style={styles.fallbackPoster}>
                  <Ionicons name="image-outline" size={32} color={colors.primary} />
                </View>
              )}
            </View>

            <View style={styles.heroMetaGroup}>
              {/* Formats */}
              <View style={styles.formatsBadgeRow}>
                {movie.formats.slice(0, 2).map((fmt) => (
                  <Badge key={fmt} label={fmt} variant="format" size="sm" />
                ))}
              </View>

              {/* Rating */}
              <View style={styles.ratingRow}>
                <Ionicons name="star" size={16} color={colors.highlight} />
                <Text variant="heading2" color="highlight" style={styles.ratingNumber}>
                  {movie.rating.toFixed(1)}
                </Text>
                <Text variant="caption" color="textSecondary" style={styles.votesText}>
                  / 10 ({movie.votes})
                </Text>
              </View>

              {/* Age, Year, Runtime */}
              <Text variant="caption" color="textSecondary" style={styles.quickSpecs}>
                {movie.ageRating} • {movie.releaseYear} • {movie.runtime}
              </Text>

              {/* Language Tag */}
              <Text variant="caption" color="textSecondary">
                Language: {movie.language}
              </Text>
            </View>
          </View>
        </View>

        {/* Main Content Details */}
        <View style={styles.contentBody}>
          {/* Title & Tagline */}
          <Text variant="display" color="textPrimary" style={styles.title}>
            {movie.title}
          </Text>
          <Text variant="body" color="primary" style={styles.tagline}>
            &ldquo;{movie.tagline}&rdquo;
          </Text>

          {/* Genre Chips Row */}
          <View style={styles.genresRow}>
            {movie.genres.map((genre) => (
              <View key={genre} style={styles.genrePill}>
                <Text variant="caption" color="textPrimary">
                  {genre}
                </Text>
              </View>
            ))}
          </View>

          {/* Synopsis Section */}
          <View style={styles.sectionBlock}>
            <Text variant="heading2" color="textPrimary" style={styles.sectionTitle}>
              Storyline
            </Text>
            <Text
              variant="body"
              color="textSecondary"
              numberOfLines={isSynopsisExpanded ? undefined : 3}
              style={styles.synopsisText}
            >
              {movie.synopsis}
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setIsSynopsisExpanded(!isSynopsisExpanded)}
              style={styles.readMoreBtn}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={isSynopsisExpanded ? 'Read less synopsis' : 'Read more synopsis'}
            >
              <Text variant="supporting" color="primary" style={styles.readMoreText}>
                {isSynopsisExpanded ? 'Read less' : 'Read more'}
              </Text>
              <Ionicons
                name={isSynopsisExpanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.primary}
              />
            </TouchableOpacity>
          </View>

          {/* Director & Details */}
          <Card variant="surface" padding="base" style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text variant="supporting" color="textSecondary">
                Director:
              </Text>
              <Text variant="supporting" color="textPrimary" style={styles.infoValue}>
                {movie.director}
              </Text>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <Text variant="supporting" color="textSecondary">
                Theatrical Release:
              </Text>
              <Text variant="supporting" color="textPrimary" style={styles.infoValue}>
                {movie.releaseDate}
              </Text>
            </View>
          </Card>

          {/* Cast Rail */}
          {movie.cast && movie.cast.length > 0 && (
            <View style={styles.sectionBlock}>
              <Text variant="heading2" color="textPrimary" style={styles.sectionTitle}>
                Top Billed Cast
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.castScroll}
              >
                {movie.cast.map((actor) => (
                  <View key={actor.id} style={styles.actorItem}>
                    <View style={styles.avatarWrapper}>
                      <Image
                        source={{ uri: actor.avatarUrl }}
                        style={styles.avatarImage}
                        resizeMode="cover"
                      />
                    </View>
                    <Text
                      variant="supporting"
                      color="textPrimary"
                      align="center"
                      numberOfLines={1}
                      style={styles.actorName}
                    >
                      {actor.name}
                    </Text>
                    <Text
                      variant="caption"
                      color="textSecondary"
                      align="center"
                      numberOfLines={1}
                    >
                      {actor.character}
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Cinema Availability Callout */}
          <View style={styles.sectionBlock}>
            <Text variant="heading2" color="textPrimary" style={styles.sectionTitle}>
              Lagos Cinemas Showing This Film
            </Text>

            {cinemaAvailability.length > 0 ? (
              <View style={styles.cinemaGrid}>
                {cinemaAvailability.map(({ cinema, showtimes }) => (
                  <TouchableOpacity
                    key={cinema.id}
                    activeOpacity={0.8}
                    onPress={() =>
                      router.push({
                        pathname: '/showtimes/[id]',
                        params: { id: movie.id },
                      } as any)
                    }
                    style={styles.cinemaSummaryCard}
                  >
                    <View style={styles.cinemaSummaryHeader}>
                      <Text variant="supporting" color="textPrimary" style={styles.cinemaSummaryName}>
                        {cinema.name}
                      </Text>
                      <Badge label={`${cinema.distanceKm} km`} variant="outline" size="sm" />
                    </View>
                    <Text variant="caption" color="textSecondary" style={styles.cinemaSummaryNeighborhood}>
                      {cinema.neighborhood}
                    </Text>
                    <View style={styles.cinemaShowtimePillsRow}>
                      {showtimes.slice(0, 3).map((st) => (
                        <View key={st.id} style={styles.miniShowtimePill}>
                          <Text variant="caption" color="primary">
                            {st.time}
                          </Text>
                        </View>
                      ))}
                      {showtimes.length > 3 && (
                        <Text variant="caption" color="textSecondary" style={styles.moreSlotsText}>
                          +{showtimes.length - 3} more
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Card variant="surface" padding="base" style={styles.noCinemasCard}>
                <Ionicons name="calendar-outline" size={24} color={colors.highlight} />
                <Text variant="supporting" color="textSecondary" style={styles.noCinemasText}>
                  {isComingSoon
                    ? 'Showtimes will open in Lagos theaters closer to the premiere date.'
                    : 'No active showtimes currently scheduled for today in Lagos.'}
                </Text>
              </Card>
            )}
            {attribution && (
              <Text variant="caption" color="textMuted" align="center" style={styles.attributionText}>
                {attribution}
              </Text>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Sticky Bottom Booking Bar */}
      <View style={[styles.bottomStickyBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.priceContainer}>
          <Text variant="caption" color="textSecondary">
            {isComingSoon ? 'Release Status' : 'Ticket Price'}
          </Text>
          <Text variant="heading2" color="textPrimary" style={styles.priceText}>
            {isComingSoon ? 'Showtimes Open Soon' : movie.priceRange || APPROVED_MOVIE_STARTING_PRICE}
          </Text>
        </View>

        <Button
          title={isComingSoon ? 'Showtimes Open Closer to Premiere' : 'Select Cinema & Showtimes'}
          variant={isComingSoon ? 'secondary' : 'primary'}
          size="lg"
          disabled={isComingSoon}
          iconRight={
            <Ionicons
              name={isComingSoon ? 'calendar-outline' : 'ticket'}
              size={18}
              color={isComingSoon ? colors.textSecondary : colors.background}
            />
          }
          onPress={() => {
            if (isComingSoon) return;
            router.push({
              pathname: '/showtimes/[id]',
              params: { id: movie.id },
            } as any);
          }}
          style={styles.bookCTAButton}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={isComingSoon ? 'Showtimes open closer to premiere' : 'Select cinema and showtimes'}
          accessibilityHint={isComingSoon ? 'Advance seat reservations are not yet open for upcoming titles' : 'Navigates to showtime selection for this movie'}
        />
      </View>
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
  scrollContent: {
    paddingBottom: 40,
  },
  heroWrapper: {
    height: 380,
    width: '100%',
    position: 'relative',
    justifyContent: 'flex-end',
  },
  backdropImage: {
    ...StyleSheet.absoluteFill,
  },
  fallbackBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdropScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(13, 11, 20, 0.65)',
  },
  topNavOverlay: {
    position: 'absolute',
    top: 0,
    left: spacing.base,
    right: spacing.base,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  navRightGroup: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  navIconBtn: {
    width: 44, // WCAG 44pt touch target
    height: 44,
    borderRadius: radii.full,
    backgroundColor: 'rgba(28, 25, 38, 0.85)',
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPosterRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.base,
    alignItems: 'flex-end',
    gap: spacing.base,
    zIndex: 5,
  },
  posterContainer: {
    width: 110,
    height: 165,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.elevated,
    borderWidth: 1.5,
    borderColor: colors.border,
    elevation: 8,
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  fallbackPoster: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  heroMetaGroup: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  formatsBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  ratingNumber: {
    fontWeight: '800',
    marginLeft: 2,
  },
  votesText: {
    marginLeft: 2,
  },
  quickSpecs: {
    marginBottom: 2,
  },
  contentBody: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
  },
  title: {
    fontWeight: '800',
    marginBottom: 2,
  },
  tagline: {
    fontStyle: 'italic',
    marginBottom: spacing.base,
  },
  genresRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  genrePill: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionBlock: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  synopsisText: {
    lineHeight: 22,
  },
  readMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
  },
  readMoreText: {
    fontWeight: '600',
  },
  infoCard: {
    marginBottom: spacing.xl,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoValue: {
    fontWeight: '600',
  },
  infoDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  castScroll: {
    paddingRight: spacing.base,
    gap: spacing.base,
  },
  actorItem: {
    width: 90,
    alignItems: 'center',
  },
  avatarWrapper: {
    width: 64,
    height: 64,
    borderRadius: radii.full,
    overflow: 'hidden',
    backgroundColor: colors.elevated,
    borderWidth: 1.5,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  actorName: {
    fontWeight: '600',
    width: '100%',
  },
  cinemaGrid: {
    gap: spacing.sm,
  },
  cinemaSummaryCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    padding: spacing.base,
  },
  cinemaSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  cinemaSummaryName: {
    fontWeight: '700',
    flex: 1,
    marginRight: spacing.sm,
  },
  cinemaSummaryNeighborhood: {
    marginBottom: spacing.sm,
  },
  cinemaShowtimePillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  miniShowtimePill: {
    backgroundColor: colors.elevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  moreSlotsText: {
    marginLeft: spacing.xs,
  },
  noCinemasCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  noCinemasText: {
    flex: 1,
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
  },
  priceContainer: {
    justifyContent: 'center',
  },
  priceText: {
    fontWeight: '800',
  },
  bookCTAButton: {
    flex: 1,
  },
  attributionText: {
    marginTop: spacing.lg,
    fontSize: 10,
    lineHeight: 14,
    paddingHorizontal: spacing.base,
  },
});
