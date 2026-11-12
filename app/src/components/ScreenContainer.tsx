import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';
import { spacing } from '@/theme/spacing';

export interface ScreenContainerProps extends ViewProps {
  children: React.ReactNode;
  edges?: Edge[];
  noPadding?: boolean;
}

export const ScreenContainer: React.FC<ScreenContainerProps> = ({
  children,
  edges = ['top', 'left', 'right'],
  noPadding = false,
  style,
  ...rest
}) => {
  return (
    <SafeAreaView edges={edges} style={styles.safeArea}>
      <View
        style={[
          styles.container,
          !noPadding && styles.withPadding,
          style,
        ]}
        {...rest}
      >
        {children}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  withPadding: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
});

export default ScreenContainer;

