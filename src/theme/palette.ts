export const wanikaniPalette = {
  radical: '#00aaff',
  kanji: '#ff00aa',
  vocabulary: '#aa00ff',
  apprentice: '#dd0093',
  guru: '#882d9e',
  master: '#294ddb',
  enlightened: '#0093dd',
  burned: '#434343',
  lesson: '#00aaff',
  review: '#ff00aa',
};

export const lightColors = {
  ...wanikaniPalette,
  background: '#f8f4ef',
  surface: '#fffaf2',
  surfaceElevated: '#ffffff',
  text: '#201a24',
  mutedText: '#6f6574',
  border: '#eadfdb',
  success: '#20805f',
  warning: '#a86200',
  danger: '#b3261e',
};

export const darkColors = {
  ...wanikaniPalette,
  background: '#151119',
  surface: '#211a27',
  surfaceElevated: '#2c2134',
  text: '#fff7fb',
  mutedText: '#c6b7c9',
  border: '#443648',
  success: '#79d7b4',
  warning: '#ffbd63',
  danger: '#ffb4ab',
};

export type AppColors = typeof lightColors;
