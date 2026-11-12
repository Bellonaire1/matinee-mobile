import React from 'react';
import { Text as RNText, TextProps as RNTextProps } from 'react-native';
import { colors, Colors } from '@/theme/colors';
import { typography, TypographyVariant } from '@/theme/typography';

export interface TextProps extends RNTextProps {
  variant?: TypographyVariant;
  color?: keyof Colors | string;
  align?: 'left' | 'center' | 'right';
}

export const Text: React.FC<TextProps> = ({
  children,
  variant = 'body',
  color = 'textPrimary',
  align = 'left',
  style,
  ...rest
}) => {
  const resolvedColor =
    color in colors ? colors[color as keyof Colors] : color;

  const variantStyle = typography[variant] || typography.body;

  return (
    <RNText
      style={[
        variantStyle,
        { color: resolvedColor, textAlign: align },
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
};

export default Text;

