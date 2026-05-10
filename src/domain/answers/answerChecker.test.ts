import { checkAnswer, convertKatakanaToHiragana, normalizeAnswer } from './answerChecker';

describe('answerChecker', () => {
  it('converts katakana to hiragana like the Swift tests', () => {
    expect(convertKatakanaToHiragana('ヒラガナ')).toBe('ひらがな');
    expect(convertKatakanaToHiragana('ビール')).toBe('びーる');
    expect(convertKatakanaToHiragana('ビー')).toBe('びー');
    expect(convertKatakanaToHiragana('ール')).toBe('ーる');
  });

  it('normalizes meaning and reading answers like the Swift tests', () => {
    expect(normalizeAnswer(" Foo-B.a'/r nn ", 'meaning')).toBe('foo bar nn');
    expect(normalizeAnswer(" Foo-B.a'/r nn ", 'reading')).toBe('foobarんん');
  });

  it('accepts primary readings and reports other kanji readings', () => {
    const subject = {
      type: 'kanji',
      japanese: '大',
      meanings: [{ meaning: 'big', acceptedAnswer: true }],
      readings: [
        { reading: 'たい', primary: true },
        { reading: 'だい', primary: false },
      ],
    };

    expect(checkAnswer('たい', subject, { taskType: 'reading' })).toEqual({ kind: 'precise' });
    expect(checkAnswer('だい', subject, { taskType: 'reading' })).toEqual({ kind: 'otherKanjiReading' });
  });

  it('accepts meanings and study material synonyms before fuzzy matching', () => {
    const subject = {
      type: 'vocabulary',
      japanese: '蟹',
      meanings: [
        { meaning: 'Crab', acceptedAnswer: true },
        { meaning: 'Cab', type: 'blacklist' },
      ],
      readings: [{ reading: 'かに', primary: true }],
    };

    expect(checkAnswer('shellfish', subject, { taskType: 'meaning', studyMaterials: { meaningSynonyms: ['shellfish'] } })).toEqual({ kind: 'precise' });
    expect(checkAnswer('crab', subject, { taskType: 'meaning' })).toEqual({ kind: 'precise' });
    expect(checkAnswer('cab', subject, { taskType: 'meaning' })).toEqual({ kind: 'incorrect' });
    expect(checkAnswer('crabb', subject, { taskType: 'meaning' })).toEqual({ kind: 'imprecise' });
  });

  it('rejects invalid characters for the requested task', () => {
    const subject = {
      type: 'vocabulary',
      japanese: '蟹',
      meanings: [{ meaning: 'crab', acceptedAnswer: true }],
      readings: [{ reading: 'かに', primary: true }],
    };

    expect(checkAnswer('kani', subject, { taskType: 'reading' }).kind).toBe('containsInvalidCharacters');
    expect(checkAnswer('かに', subject, { taskType: 'meaning' }).kind).toBe('containsInvalidCharacters');
  });
});
