import { colors } from './colors';
import { typography, fontFamilies } from './typography';
import { spacing } from './spacing';
import { radii } from './radii';

export const theme = {
  colors,
  typography,
  fontFamilies,
  spacing,
  radii,
} as const;

export type Theme = typeof theme;
export * from './colors';
export * from './typography';
export * from './spacing';
export * from './radii';

