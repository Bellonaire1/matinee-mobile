export const colors = {
  background: '#0D0B14',
  surface: '#1C1926',
  elevated: '#292536',
  primary: '#B78AF7',
  highlight: '#F6BE63',
  textPrimary: '#FAF8FF',
  textSecondary: '#AEA8BF',
  error: '#FF7185',

  // Semantic feedback and indicators
  success: '#4ADE80',
  warning: '#FBBF24',
  scrim: 'rgba(13, 11, 20, 0.75)',

  // Seat map state colors
  seatAvailable: '#342F45',
  seatAvailableBorder: '#524B6D',
  seatSelected: '#B78AF7',
  seatHeld: '#F6BE63',
  seatSold: '#191724',
  seatSoldBorder: '#282436',
  seatVip: '#8B5CF6',
  seatCouple: '#EC4899',
  seatAccessible: '#38BDF8',

  // Utility accents for navigation and borders
  border: '#292536',
  tabBarBackground: '#14121F',
  tabBarBorder: '#232032',
  tabBarInactive: '#766F8A',
} as const;

export type Colors = typeof colors;
