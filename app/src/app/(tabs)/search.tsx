import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Chip } from '@/components/ui/Chip';
import { SearchBar } from '@/components/ui/SearchBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { ALL_MOVIES, Movie } from '@/data/mockMovies';
import {
  filterMovies,
  isMovieComingSoon,
  getSearchSummaryText,
  MOCK_NARRATIVE_GENRES,
  MOCK_TECHNICAL_FORMATS,
} from '@/data/discoveryEngine';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export default function SearchScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('All');
  const [selectedFormat, setSelectedFormat] = useState<string>('All Formats');

  // Filter movies purely from catalog
  const filteredMovies = useMemo(() => {
    return filterMovies(ALL_MOVIES, {
      query: searchQuery,
      genre: selectedGenre,
      format: selectedFormat,
    });
  }, [searchQuery, selectedGenre, selectedFormat]);

  const summaryText = useMemo(() => {
    return getSearchSummaryText(
      filteredMovies.length,
      searchQuery,
      selectedGenre,
      selectedFormat
    );
  }, [filteredMovies.length, searchQuery, selectedGenre, selectedFormat]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    selectedGenre !== 'All' ||
    selectedFormat !== 'All Formats';

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedGenre('All');
    setSelectedFormat('All Formats');
  };

  const handleSelectMovie = (movie: Movie) => {
    router.push(`/movie/${movie.id}` as any);
  };

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={styles.header}>
        <Text variant="heading1" color="textPrimary">
          Search
        </Text>
        <Text variant="body" color="textSecondary">
          Discover movies and showtimes across Lagos cinemas
        </Text>
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchBarWrapper}>
        <SearchBar
          placeholder="Search by title, director, actor..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          onClear={() => setSearchQuery('')}
        />
      </View>

      {/* Narrative Genre Filter Chips */}
      <View style={styles.filterSection}>
        <Text variant="caption" color="textSecondary" style={styles.filterSectionLabel}>
          Genre:
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipsScroll}
        >
          {MOCK_NARRATIVE_GENRES.map((genre) => {
            const isSelected = selectedGenre.toLowerCase() === genre.toLowerCase();
            return (
              <Chip
                key={genre}
                label={genre}
                selected={isSelected}
                onPress={() => setSelectedGenre(genre)}
                style={styles.filterChip}
              />
            );
          })}
        </ScrollView>
      </View>

      {/* Technical Format Filter Chips */}
      <View style={styles.filterSection}>
        <Text variant="caption" color="textSecondary" style={styles.filterSectionLabel}>
          Format:
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterChipsScroll}
        >
          {MOCK_TECHNICAL_FORMATS.map((fmt) => {
            const isSelected = selectedFormat.toLowerCase() === fmt.toLowerCase();
            return (
              <Chip
                key={fmt}
                label={fmt}
                selected={isSelected}
                onPress={() => setSelectedFormat(fmt)}
                style={styles.filterChip}
              />
            );
          })}
        </ScrollView>
      </View>

      {/* Results Header / Summary */}
      <View style={styles.summaryRow}>
        <Text variant="caption" color="textSecondary" style={styles.summaryText}>
          {summaryText}
        </Text>
        {hasActiveFilters && (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleResetFilters}
            accessible={true}
            accessibilityRole="button"
            accessibilityLabel="Reset all filters"
          >
            <Text variant="caption" color="primary" style={styles.resetText}>
              Reset Filters
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Movie Results List or Empty State */}
      {filteredMovies.length > 0 ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.resultsList}
        >
          {filteredMovies.map((movie) => {
            const comingSoon = isMovieComingSoon(movie);

            return (
              <TouchableOpacity
                key={movie.id}
                activeOpacity={0.82}
                onPress={() => handleSelectMovie(movie)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={`View movie details for ${movie.title}`}
              >
                <Card variant="surface" padding="base" style={styles.movieRowCard}>
                  {/* Movie Poster Thumbnail */}
                  <Image
                    source={{ uri: movie.posterUrl }}
                    style={styles.posterThumbnail}
                    resizeMode="cover"
                  />

                  {/* Movie Details Column */}
                  <View style={styles.movieInfoCol}>
                    <View style={styles.movieHeaderLine}>
                      <Text
                        variant="heading2"
                        color="textPrimary"
                        numberOfLines={1}
                        style={styles.movieTitle}
                      >
                        {movie.title}
                      </Text>
                      {movie.rating > 0 && (
                        <Badge
                          label={movie.rating.toFixed(1)}
                          variant="rating"
                          size="sm"
                          icon={<Ionicons name="star" size={10} color={colors.highlight} />}
                        />
                      )}
                    </View>

                    <Text variant="caption" color="textSecondary" style={styles.metaLine}>
                      {movie.releaseYear} &bull; {movie.runtime} &bull; {movie.ageRating}
                    </Text>

                    <Text
                      variant="caption"
                      color="textSecondary"
                      numberOfLines={1}
                      style={styles.genresLine}
                    >
                      {movie.genres.join(', ')}
                    </Text>

                    {/* Category & Availability Badge */}
                    <View style={styles.statusBadgeRow}>
                      {comingSoon ? (
                        <Badge
                          label="Coming Soon • Showtimes Open Soon"
                          variant="outline"
                          size="sm"
                        />
                      ) : (
                        <Badge
                          label={`Now Showing • ${movie.priceRange || 'From ₦7,000'}`}
                          variant="format"
                          size="sm"
                        />
                      )}
                    </View>
                  </View>

                  {/* Navigation Chevron */}
                  <View style={styles.chevronBox}>
                    <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                  </View>
                </Card>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <EmptyState
            iconName="search-outline"
            title="No Films Found"
            message={`No movies match your current criteria. Try another keyword or reset filters.`}
            actionTitle="Reset Search & Filters"
            onActionPress={handleResetFilters}
          />
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.sm,
    paddingTop: spacing.xs,
  },
  searchBarWrapper: {
    marginBottom: spacing.xs,
  },
  filterSection: {
    marginBottom: spacing.xs,
  },
  filterSectionLabel: {
    marginBottom: 4,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  filterChipsScroll: {
    gap: spacing.xs,
    paddingBottom: 2,
  },
  filterChip: {
    marginRight: 0,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: spacing.xs,
    paddingHorizontal: 2,
  },
  summaryText: {
    flex: 1,
  },
  resetText: {
    fontWeight: '600',
    paddingLeft: spacing.xs,
  },
  resultsList: {
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  movieRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.md,
  },
  posterThumbnail: {
    width: 60,
    height: 90,
    borderRadius: radii.sm,
    backgroundColor: colors.elevated,
  },
  movieInfoCol: {
    flex: 1,
    marginLeft: spacing.base,
    justifyContent: 'center',
  },
  movieHeaderLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  movieTitle: {
    flex: 1,
    marginRight: spacing.xs,
    fontSize: 16,
  },
  metaLine: {
    marginBottom: 2,
  },
  genresLine: {
    marginBottom: spacing.xs,
  },
  statusBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chevronBox: {
    marginLeft: spacing.xs,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
});
