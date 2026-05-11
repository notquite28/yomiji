import { getCharacterImageUrl, isCharacterImageSvg } from './studyRepository';
import { SubjectData } from '../api/types';

function makeSubject(images: SubjectData['character_images']): SubjectData {
  return { level: 1, character_images: images };
}

describe('getCharacterImageUrl', () => {
  it('selects SVG with inline_styles over PNGs', () => {
    const subject = makeSubject([
      { url: 'https://cdn.example.com/radical-original.png', content_type: 'image/png', metadata: { style_name: 'original', color: '#333333' } },
      { url: 'https://cdn.example.com/radical-thumb.png', content_type: 'image/png', metadata: { style_name: 'thumbnail', color: '#333333' } },
      { url: 'https://cdn.example.com/radical.svg', content_type: 'image/svg+xml', metadata: { inline_styles: true } },
    ]);
    expect(getCharacterImageUrl(subject)).toBe('https://cdn.example.com/radical.svg');
    expect(isCharacterImageSvg(subject)).toBe(true);
  });

  it('returns SVG url as SVG', () => {
    const subject = makeSubject([
      { url: 'https://cdn.example.com/radical.svg', content_type: 'image/svg+xml', metadata: { inline_styles: true } },
    ]);
    expect(isCharacterImageSvg(subject)).toBe(true);
  });

  it('selects original PNG over thumbnail PNG', () => {
    const subject = makeSubject([
      { url: 'https://cdn.example.com/radical-thumb.png', content_type: 'image/png', metadata: { style_name: 'thumbnail' } },
      { url: 'https://cdn.example.com/radical-original.png', content_type: 'image/png', metadata: { style_name: 'original' } },
      { url: 'https://cdn.example.com/radical.svg', content_type: 'image/svg+xml', metadata: { inline_styles: false } },
    ]);
    expect(getCharacterImageUrl(subject)).toBe('https://cdn.example.com/radical-original.png');
    expect(isCharacterImageSvg(subject)).toBe(false);
  });

  it('falls back to first PNG when no original style', () => {
    const subject = makeSubject([
      { url: 'https://cdn.example.com/radical.png', content_type: 'image/png' },
    ]);
    expect(getCharacterImageUrl(subject)).toBe('https://cdn.example.com/radical.png');
  });

  it('falls back to any SVG when no PNGs', () => {
    const subject = makeSubject([
      { url: 'https://cdn.example.com/radical.svg', content_type: 'image/svg+xml' },
    ]);
    expect(getCharacterImageUrl(subject)).toBe('https://cdn.example.com/radical.svg');
    expect(isCharacterImageSvg(subject)).toBe(true);
  });

  it('returns undefined for empty images array', () => {
    const subject = makeSubject([]);
    expect(getCharacterImageUrl(subject)).toBeUndefined();
  });

  it('returns undefined for missing character_images', () => {
    const subject = makeSubject(undefined);
    expect(getCharacterImageUrl(subject)).toBeUndefined();
  });

  it('ignores SVG when PNGs exist', () => {
    const subject = makeSubject([
      { url: 'https://cdn.example.com/radical.png', content_type: 'image/png', metadata: { style_name: 'original' } },
      { url: 'https://cdn.example.com/radical.svg', content_type: 'image/svg+xml' },
    ]);
    expect(getCharacterImageUrl(subject)).toBe('https://cdn.example.com/radical.png');
    expect(isCharacterImageSvg(subject)).toBe(false);
  });
});
