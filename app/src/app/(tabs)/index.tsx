import React, { useState, useMemo, useEffect } from 'react';
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
import { discoveryApi, IS_LIVE_API_ENABLED } from '@/api/discoveryApi';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export default function HomeScreen() {
  const router = useRouter();
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [nowShowing, setNowShowing] = useState<Movie[]>(MOCK_NOW_SHOWING_MOVIES);
  const [comingSoon, setComingSoon] = useState<Movie[]>(MOCK_COMING_SOON_MOVIES);
  const [featuredMovie, setFeaturedMovie] = useState<Movie>(MOCK_FEATURED_MOVIE);
  const [dataSource, setDataSource] = useState<'live' | 'mock_fallback'>('mock_fallback');
  const [attribution, setAttribution] = useState<string | undefined>(undefined);

  // Asynchronously query discovery API if feature flag is enabled; safely retain mock baseline on failure
  useEffect(() => {
    let isMounted = true;
    if (IS_LIVE_API_ENABLED) {
      Promise.all([
        discoveryApi.getMovies({ category: 'now_showing' }),
        discoveryApi.getMovies({ category: 'coming_soon' }),
      ])
        .then(([nowRes, comingRes]) => {
          if (!isMounted) return;
          if (nowRes.data.length > 0) {
            setNowShowing(nowRes.data);
            setFeaturedMovie(nowRes.data[0]);
          }
          if (comingRes.data.length > 0) {
            setComingSoon(comingRes.data);
          }
          setDataSource(nowRes.source);
          setAttribution(nowRes.attribution || comingRes.attribution);
        })
        .catch(() => {
          // Retain mock fallback baseline
        });
    }
    return () => {
      isMounted = false;
    };
  }, []);

  // Filter movies by active genre chip
  const filteredNowShowing = useMemo(() => {
    if (selectedGenre === 'All') return nowShowing;
    return nowShowing.filter(
      (m) =>
        m.genres.includes(selectedGenre) ||
        m.formats.some((f) => f.includes(selectedGenre))
    );
  }, [selectedGenre, nowShowing]);

  const filteredComingSoon = useMemo(() => {
    if (selectedGenre === 'All') return comingSoon;
    return comingSoon.filter(
      (m) =>
        m.genres.includes(selectedGenre) ||
        m.formats.some((f) => f.includes(selectedGenre))
    );
  }, [selectedGenre, comingSoon]);

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
          <View style={styles.topRightControls}>
            <Badge
              label={dataSource === 'live' ? 'LIVE' : 'DEMO'}
              variant={dataSource === 'live' ? 'highlight' : 'outline'}
              size="sm"
            />
            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.locationPill}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel="Current city: Lagos, Nigeria. Change location"
            >
              <Ionicons name="location" size={14} color={colors.highlight} />
              <Text variant="caption" color="textPrimary" style={styles.locationText}>
                Lagos
              </Text>
              <Ionicons name="chevron-down" size={12} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
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
        {/* TMDB / Metadata Attribution */}
        {attribution && (
          <Text variant="caption" color="textMuted" align="center" style={styles.attributionText}>
            {attribution}
          </Text>
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
  topRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
  attributionText: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.base,
    fontSize: 10,
    lineHeight: 14,
  },
});
