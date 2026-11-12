import React, { useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from './ui/Text';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Movie } from '@/data/mockMovies';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export interface FeaturedHeroProps {
  movie: Movie;
  onBookPress?: (movie: Movie) => void;
  onDetailsPress?: (movie: Movie) => void;
}

export const FeaturedHero: React.FC<FeaturedHeroProps> = ({
  movie,
  onBookPress,
  onDetailsPress,
}) => {
  const [imageError, setImageError] = useState(false);

  return (
    <View style={styles.cardContainer}>
      {/* Backdrop Image with Scrim */}
      <View style={styles.backdropWrapper}>
        {!imageError ? (
          <Image
            source={{ uri: movie.backdropUrl }}
            style={styles.backdropImage}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={styles.fallbackBackdrop}>
            <Ionicons name="film-outline" size={48} color={colors.primary} />
          </View>
        )}

        {/* Gradient Scrim Layer */}
        <View style={styles.scrimOverlay} />

        {/* Top Badges */}
        <View style={styles.topBadgesRow}>
          <Badge
            label="FEATURED PREMIERE"
            variant="highlight"
            size="sm"
          />
          <Badge
            label={movie.rating.toFixed(1)}
            variant="rating"
            size="sm"
            icon={<Ionicons name="star" size={10} color={colors.highlight} />}
          />
        </View>

        {/* Content Overlay */}
        <View style={styles.contentOverlay}>
          {/* Format Tags */}
          <View style={styles.formatsRow}>
            {movie.formats.map((fmt) => (
              <Badge key={fmt} label={fmt} variant="format" size="sm" />
            ))}
          </View>

          {/* Title */}
          <Text variant="heading1" color="textPrimary" style={styles.title}>
            {movie.title}
          </Text>

          {/* Genres & Runtime */}
          <Text variant="supporting" color="textSecondary" style={styles.metaText}>
            {movie.genres.join(' • ')} • {movie.runtime} • {movie.ageRating}
          </Text>

          {/* Tagline */}
          <Text
            variant="body"
            color="textSecondary"
            numberOfLines={2}
            style={styles.tagline}
          >
            &ldquo;{movie.tagline}&rdquo;
          </Text>

          {/* Action CTAs */}
          <View style={styles.actionsRow}>
            <Button
              title="Book Tickets"
              variant="primary"
              size="md"
              iconLeft={<Ionicons name="ticket" size={18} color={colors.background} />}
              onPress={() => onBookPress && onBookPress(movie)}
              style={styles.primaryBtn}
            />
            <Button
              title="Details"
              variant="secondary"
              size="md"
              iconLeft={<Ionicons name="information-circle-outline" size={18} color={colors.textPrimary} />}
              onPress={() => onDetailsPress && onDetailsPress(movie)}
              style={styles.secondaryBtn}
            />
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    marginBottom: spacing.xl,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backdropWrapper: {
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
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrimOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(13, 11, 20, 0.72)',
  },
  topBadgesRow: {
    position: 'absolute',
    top: spacing.base,
    left: spacing.base,
    right: spacing.base,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contentOverlay: {
    padding: spacing.base,
    justifyContent: 'flex-end',
  },
  formatsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  title: {
    fontWeight: '800',
    marginBottom: 4,
  },
  metaText: {
    marginBottom: spacing.xs,
  },
  tagline: {
    fontStyle: 'italic',
    marginBottom: spacing.base,
    opacity: 0.9,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  primaryBtn: {
    flex: 1,
  },
  secondaryBtn: {
    flex: 1,
  },
});

export default FeaturedHero;
