import { TextStyle } from 'react-native';

export const fontFamilies = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const typography: Record<
  'display' | 'heading1' | 'heading2' | 'body' | 'supporting' | 'caption',
  TextStyle
> = {
  display: {
    fontSize: 32,
    lineHeight: 40,
    fontFamily: fontFamilies.bold,
    fontWeight: '700',
  },
  heading1: {
    fontSize: 28,
    lineHeight: 36,
    fontFamily: fontFamilies.bold,
    fontWeight: '700',
  },
  heading2: {
    fontSize: 22,
    lineHeight: 30,
    fontFamily: fontFamilies.semibold,
    fontWeight: '600',
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: fontFamilies.regular,
    fontWeight: '400',
  },
  supporting: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fontFamilies.regular,
    fontWeight: '400',
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamilies.medium,
    fontWeight: '500',
  },
};

export type TypographyVariant = keyof typeof typography;

