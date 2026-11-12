import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Chip } from '@/components/ui/Chip';
import { SearchBar } from '@/components/ui/SearchBar';
import { MovieCard } from '@/components/ui/MovieCard';
import { FeaturedHero } from '@/components/FeaturedHero';
import { SectionHeader } from '@/components/SectionHeader';
import {
  Movie,
  MOCK_GENRES,
  MOCK_FEATURED_MOVIE,
  MOCK_NOW_SHOWING_MOVIES,
  MOCK_COMING_SOON_MOVIES,
} from '@/data/mockMovies';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export default function HomeScreen() {
  const router = useRouter();
  const [selectedGenre, setSelectedGenre] = useState('All');

  // Filter movies by active genre chip
  const filteredNowShowing = useMemo(() => {
    if (selectedGenre === 'All') return MOCK_NOW_SHOWING_MOVIES;
    return MOCK_NOW_SHOWING_MOVIES.filter(
      (m) =>
        m.genres.includes(selectedGenre) ||
        m.formats.some((f) => f.includes(selectedGenre))
    );
  }, [selectedGenre]);

  const filteredComingSoon = useMemo(() => {
    if (selectedGenre === 'All') return MOCK_COMING_SOON_MOVIES;
    return MOCK_COMING_SOON_MOVIES.filter(
      (m) =>
        m.genres.includes(selectedGenre) ||
        m.formats.some((f) => f.includes(selectedGenre))
    );
  }, [selectedGenre]);

  const handleMovieCardPress = (movie: Movie) => {
    router.push({ pathname: '/movie/[id]', params: { id: movie.id } } as any);
  };

  const handleHeroBookPress = (movie: Movie) => {
    router.push({ pathname: '/showtimes/[id]', params: { id: movie.id } } as any);
  };

  const handleHeroDetailsPress = (movie: Movie) => {
    router.push({ pathname: '/movie/[id]', params: { id: movie.id } } as any);
  };

  return (
    <ScreenContainer>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header Bar */}
        <View style={styles.topBar}>
          <View style={styles.brandRow}>
            <View style={styles.logoPill}>
              <Ionicons name="film" size={16} color={colors.primary} />
            </View>
            <Text variant="heading2" color="textPrimary" style={styles.brandName}>
              MATINEE
            </Text>
          </View>

          {/* Location Selector Pill (Lagos, Nigeria) */}
          <TouchableOpacity
            activeOpacity={0.75}
            style={styles.locationPill}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Current city: Lagos, Nigeria. Change location"
          >
            <Ionicons name="location" size={14} color={colors.highlight} />
            <Text variant="caption" color="textPrimary" style={styles.locationText}>
              Lagos, Nigeria
            </Text>
            <Ionicons name="chevron-down" size={12} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Search Bar Shortcut (Navigates to Search Tab) */}
        <SearchBar
          isReadOnly
          onPress={() => router.push('/search')}
          style={styles.searchBar}
        />

        {/* Genre Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.genreList}
        >
          {MOCK_GENRES.map((genre) => (
            <Chip
              key={genre}
              label={genre}
              selected={selectedGenre === genre}
              onPress={() => setSelectedGenre(genre)}
              style={styles.genreChip}
            />
          ))}
        </ScrollView>

        {/* Featured Blockbuster Hero */}
        <FeaturedHero
          movie={MOCK_FEATURED_MOVIE}
          onBookPress={handleHeroBookPress}
          onDetailsPress={handleHeroDetailsPress}
        />

        {/* Now Showing Section */}
        <SectionHeader
          title="Now Showing"
          subtitle={`${filteredNowShowing.length} movies in Lagos theaters`}
          actionText="See All"
          onActionPress={() => router.push('/search')}
        />

        {filteredNowShowing.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.moviesCarousel}
          >
            {filteredNowShowing.map((movie) => (
              <MovieCard
                key={movie.id}
                movie={movie}
                onPress={handleMovieCardPress}
              />
            ))}
          </ScrollView>
        ) : (
          <Card variant="surface" padding="base" style={styles.emptyCard}>
            <Text variant="body" color="textSecondary" align="center">
              No movies currently showing in genre &ldquo;{selectedGenre}&rdquo;.
            </Text>
          </Card>
        )}

        {/* Experience Banner / Premium Hall Highlights */}
        <Card variant="surface" padding="base" style={styles.experienceCard}>
          <View style={styles.experienceHeader}>
            <Badge label="LAGOS THEATERS" variant="highlight" size="sm" />
            <Badge label="DOLBY ATMOS" variant="format" size="sm" />
          </View>
          <Text variant="heading2" color="textPrimary" style={styles.experienceTitle}>
            Luxury Recliners & 4K Laser
          </Text>
          <Text variant="supporting" color="textSecondary">
            Explore curated showtimes across Lekki, Victoria Island, and Ikeja with zero booking convenience fees.
          </Text>
        </Card>

        {/* Coming Soon Section */}
        <SectionHeader
          title="Coming Soon"
          subtitle="Anticipated premiere releases"
          actionText="See All"
          onActionPress={() => router.push('/search')}
        />

        {filteredComingSoon.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.moviesCarousel}
          >
            {filteredComingSoon.map((movie) => (
              <MovieCard
                key={movie.id}
                movie={movie}
                onPress={handleMovieCardPress}
              />
            ))}
          </ScrollView>
        ) : (
          <Card variant="surface" padding="base" style={styles.emptyCard}>
            <Text variant="body" color="textSecondary" align="center">
              No upcoming movies in genre &ldquo;{selectedGenre}&rdquo;.
            </Text>
          </Card>
        )}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.base,
    paddingTop: spacing.xs,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoPill: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 44, // WCAG touch target
  },
  locationText: {
    fontWeight: '600',
  },
  searchBar: {
    marginBottom: spacing.base,
  },
  genreList: {
    paddingBottom: spacing.base,
    gap: spacing.sm,
  },
  genreChip: {
    marginRight: spacing.xs,
  },
  moviesCarousel: {
    paddingBottom: spacing.md,
  },
  emptyCard: {
    marginBottom: spacing.base,
  },
  experienceCard: {
    marginVertical: spacing.base,
    backgroundColor: colors.surface,
  },
  experienceHeader: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  experienceTitle: {
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
});
