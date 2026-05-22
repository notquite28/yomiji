import { colorToRgb, compositeAlpha, readableOnColor, withAlpha } from '../colorUtils';

describe('colorToRgb', () => {
  it('parses 6-digit hex', () => {
    expect(colorToRgb('#ff00aa')).toEqual({ r: 255, g: 0, b: 170 });
  });

  it('returns null for invalid hex', () => {
    expect(colorToRgb('#fff')).toBeNull();
  });

  it('parses rgb()', () => {
    expect(colorToRgb('rgb(255, 128, 0)')).toEqual({ r: 255, g: 128, b: 0 });
  });

  it('parses rgba() with alpha', () => {
    expect(colorToRgb('rgba(255, 128, 0, 0.5)')).toEqual({ r: 255, g: 128, b: 0, a: 0.5 });
  });

  it('returns null for invalid string', () => {
    expect(colorToRgb('not-a-color')).toBeNull();
  });
});

describe('compositeAlpha', () => {
  it('returns foreground when fully opaque', () => {
    expect(compositeAlpha('#ff00aa', '#ffffff')).toBe('#ff00aa');
  });

  it('blends rgba over opaque background', () => {
    // rgba(255, 0, 170, 0.5) over white
    // alphaOut = 0.5 + 1 * 0.5 = 1
    // r = (255*0.5 + 255*1*0.5) / 1 = 255
    // g = (0*0.5 + 255*1*0.5) / 1 = 127.5 ≈ 128
    // b = (170*0.5 + 255*1*0.5) / 1 = 212.5 ≈ 213
    expect(compositeAlpha('rgba(255, 0, 170, 0.5)', '#ffffff')).toBe('#ff80d5');
  });

  it('blends rgba over translucent background', () => {
    // rgba(255, 0, 170, 0.5) over rgba(0, 255, 0, 0.5)
    // alphaOut = 0.5 + 0.5 * 0.5 = 0.75
    // r = (255*0.5 + 0*0.5*0.5) / 0.75 = 127.5 / 0.75 = 170
    // g = (0*0.5 + 255*0.5*0.5) / 0.75 = 63.75 / 0.75 = 85
    // b = (170*0.5 + 0*0.5*0.5) / 0.75 = 85 / 0.75 = 113.33 ≈ 113
    expect(compositeAlpha('rgba(255, 0, 170, 0.5)', 'rgba(0, 255, 0, 0.5)')).toBe(
      'rgba(170, 85, 113, 0.75)',
    );
  });

  it('returns foreground when background is fully transparent', () => {
    expect(compositeAlpha('rgba(255, 0, 170, 0.5)', 'rgba(0, 0, 0, 0)')).toBe('rgba(255, 0, 170, 0.5)');
  });

  it('returns fg when parsing fails', () => {
    expect(compositeAlpha('invalid', '#ffffff')).toBe('invalid');
  });
});

describe('readableOnColor', () => {
  it('returns white on dark colors', () => {
    expect(readableOnColor('#201a24')).toBe('#fff');
  });

  it('returns dark on light colors', () => {
    expect(readableOnColor('#ffffff')).toBe('#141218');
  });

  it('returns white for undefined', () => {
    expect(readableOnColor(undefined)).toBe('#fff');
  });

  it('composites alpha before choosing when background provided', () => {
    // Light blue at 16% opacity over white → very light blue → needs dark text
    expect(readableOnColor('rgba(0, 170, 255, 0.16)', '#ffffff')).toBe('#141218');
  });

  it('ignores alpha without backgroundColor', () => {
    // Without background, it should compute luminance on raw rgba values (ignoring alpha)
    expect(readableOnColor('rgba(0, 170, 255, 0.16)')).toBe('#fff');
  });

  it('ignores backgroundColor for opaque colors', () => {
    // Dark color should still return white even with background provided
    expect(readableOnColor('#201a24', '#ffffff')).toBe('#fff');
  });
});

describe('withAlpha', () => {
  it('converts hex to rgba', () => {
    expect(withAlpha('#ff00aa', 0.5)).toBe('rgba(255, 0, 170, 0.5)');
  });

  it('converts rgb to rgba', () => {
    expect(withAlpha('rgb(255, 0, 170)', 0.5)).toBe('rgba(255, 0, 170, 0.5)');
  });

  it('returns input when parsing fails', () => {
    expect(withAlpha('invalid', 0.5)).toBe('invalid');
  });
});
