export type RgbColor = { r: number; g: number; b: number; a?: number };

export function colorToRgb(color: string): RgbColor | null {
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length !== 6) {
      return null;
    }
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    };
  }

  const rgba = color.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!rgba) {
    return null;
  }
  return {
    r: Number.parseInt(rgba[1] ?? '0', 10),
    g: Number.parseInt(rgba[2] ?? '0', 10),
    b: Number.parseInt(rgba[3] ?? '0', 10),
    a: rgba[4] !== undefined ? Number.parseFloat(rgba[4]) : undefined,
  };
}

export function withAlpha(color: string, alpha: number) {
  const rgb = colorToRgb(color);
  if (!rgb) {
    return color;
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function compositeAlpha(fg: string, bg: string): string {
  const fgRgb = colorToRgb(fg);
  const bgRgb = colorToRgb(bg);
  if (!fgRgb || !bgRgb) return fg;

  const fgAlpha = fgRgb.a ?? 1;
  if (fgAlpha === 1) return fg;

  const bgAlpha = bgRgb.a ?? 1;
  const alphaOut = fgAlpha + bgAlpha * (1 - fgAlpha);

  const r = Math.round((fgRgb.r * fgAlpha + bgRgb.r * bgAlpha * (1 - fgAlpha)) / alphaOut);
  const g = Math.round((fgRgb.g * fgAlpha + bgRgb.g * bgAlpha * (1 - fgAlpha)) / alphaOut);
  const b = Math.round((fgRgb.b * fgAlpha + bgRgb.b * bgAlpha * (1 - fgAlpha)) / alphaOut);

  if (alphaOut === 1) {
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
  }
  return `rgba(${r}, ${g}, ${b}, ${alphaOut})`;
}

export function readableOnColor(color: string | undefined, backgroundColor?: string) {
  let effectiveColor = color;
  if (color && backgroundColor && color.startsWith('rgba(')) {
    effectiveColor = compositeAlpha(color, backgroundColor);
  }
  const rgb = effectiveColor ? colorToRgb(effectiveColor) : null;
  if (!rgb) {
    return '#fff';
  }
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.58 ? '#141218' : '#fff';
}
