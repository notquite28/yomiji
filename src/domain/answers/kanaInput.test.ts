import { convertRomajiToKanaInput } from './kanaInput';

describe('kanaInput', () => {
  it('converts common romaji readings to hiragana', () => {
    expect(convertRomajiToKanaInput('kani')).toBe('かに');
    expect(convertRomajiToKanaInput('kanji')).toBe('かんじ');
    expect(convertRomajiToKanaInput('gakkou')).toBe('がっこう');
    expect(convertRomajiToKanaInput('bi-ru')).toBe('びーる');
    expect(convertRomajiToKanaInput('ryou')).toBe('りょう');
  });

  it('leaves partial trailing romaji so users can keep typing', () => {
    expect(convertRomajiToKanaInput('kan')).toBe('かn');
    expect(convertRomajiToKanaInput('sh')).toBe('sh');
  });

  it('can emit katakana for reading prompts that need it later', () => {
    expect(convertRomajiToKanaInput('pe-ji', 'katakana')).toBe('ページ');
  });

  it('passes existing kana through unchanged', () => {
    expect(convertRomajiToKanaInput('かに')).toBe('かに');
  });
});
