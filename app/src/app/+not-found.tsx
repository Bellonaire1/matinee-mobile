import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Link, Stack } from 'expo-router';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';
import { radii } from '@/theme/radii';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <ScreenContainer style={styles.container}>
        <Card variant="surface" padding="base" style={styles.card}>
          <Text variant="heading1" color="error" style={styles.title}>
            Screen Not Found
          </Text>
          <Text variant="body" color="textSecondary" style={styles.body}>
            This screen does not exist in the Matinee app.
          </Text>

          <Link href="/" style={styles.link}>
            <View style={styles.linkButton}>
              <Text variant="body" color="background" style={styles.linkText}>
                Go to Home Screen
              </Text>
            </View>
          </Link>
        </Card>
      </ScreenContainer>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  title: {
    marginBottom: spacing.sm,
  },
  body: {
    marginBottom: spacing.xl,
    textAlign: 'center',
  },
  link: {
    marginTop: spacing.sm,
  },
  linkButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.sm,
  },
  linkText: {
    fontWeight: '600',
  },
});

