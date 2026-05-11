import { replaceCssVariableFallbacks, replaceCssVariableFallbacksForHero } from './radicalSvg';

describe('replaceCssVariableFallbacks', () => {
  it('uses CSS var fallback colors before SVG parsing', () => {
    const xml = '<style>.b{stroke:var(--color-text, #000);fill:var(--radical-color, rgb(0, 170, 255));}</style>';

    expect(replaceCssVariableFallbacks(xml)).toBe('<style>.b{stroke:#000;fill:rgb(0, 170, 255);}</style>');
  });

  it('uses black when a CSS var has no fallback', () => {
    expect(replaceCssVariableFallbacks('<path stroke="var(--color-text)"/>')).toBe('<path stroke="#000"/>');
  });

  it('uses white for WaniKani radical text in hero cards', () => {
    const xml = '<style>.b{stroke:var(--color-text, #000);fill:var(--radical-color, #0af);}</style>';

    expect(replaceCssVariableFallbacksForHero(xml)).toBe('<style>.b{stroke:#ffffff;fill:#0af;}</style>');
  });
});
