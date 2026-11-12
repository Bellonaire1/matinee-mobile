import React, { useState } from 'react';
import {
  TouchableOpacity,
  View,
  Image,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './Text';
import { Badge } from './Badge';
import { Movie } from '@/data/mockMovies';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export interface MovieCardProps {
  movie: Movie;
  onPress?: (movie: Movie) => void;
  style?: StyleProp<ViewStyle>;
  width?: number;
}

export const MovieCard: React.FC<MovieCardProps> = ({
  movie,
  onPress,
  style,
  width = 148,
}) => {
  const [imageError, setImageError] = useState(false);
  const posterHeight = Math.round(width * 1.5); // Standard 2:3 cinema poster aspect ratio

  const primaryFormat = movie.formats && movie.formats.length > 0 ? movie.formats[0] : null;

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={() => onPress && onPress(movie)}
      style={[styles.container, { width }, style]}
    >
      {/* Poster Image Container */}
      <View style={[styles.posterWrapper, { height: posterHeight }]}>
        {!imageError ? (
          <Image
            source={{ uri: movie.posterUrl }}
            style={styles.posterImage}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={styles.fallbackPoster}>
            <Ionicons name="film-outline" size={32} color={colors.primary} />
            <Text variant="caption" color="textSecondary" align="center" style={styles.fallbackText}>
              {movie.title}
            </Text>
          </View>
        )}

        {/* Top Floating Badges */}
        <View style={styles.badgeRow}>
          {primaryFormat ? (
            <Badge label={primaryFormat} variant="format" size="sm" />
          ) : (
            <View />
          )}

          {movie.rating > 0 && (
            <Badge
              label={movie.rating.toFixed(1)}
              variant="rating"
              size="sm"
              icon={<Ionicons name="star" size={10} color={colors.highlight} />}
            />
          )}
        </View>
      </View>

      {/* Metadata Bottom Area */}
      <View style={styles.metaContainer}>
        <Text
          variant="supporting"
          color="textPrimary"
          numberOfLines={1}
          style={styles.title}
        >
          {movie.title}
        </Text>

        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {movie.genres.slice(0, 2).join(' • ')}
          {movie.runtime ? ` • ${movie.runtime}` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginRight: spacing.base,
  },
  posterWrapper: {
    width: '100%',
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  posterImage: {
    width: '100%',
    height: '100%',
  },
  fallbackPoster: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    backgroundColor: colors.surface,
  },
  fallbackText: {
    marginTop: spacing.xs,
  },
  badgeRow: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    right: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaContainer: {
    marginTop: spacing.sm,
    paddingHorizontal: 2,
  },
  title: {
    fontWeight: '700',
    marginBottom: 2,
  },
});

export default MovieCard;

