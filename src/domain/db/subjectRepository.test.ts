import { parseSynonymJson } from './subjectRepository';

describe('parseSynonymJson', () => {
  test('parses valid JSON array of strings', () => {
    expect(parseSynonymJson('["hello","world"]')).toEqual(['hello', 'world']);
  });

  test('returns empty array for empty JSON array', () => {
    expect(parseSynonymJson('[]')).toEqual([]);
  });

  test('filters non-string values from array', () => {
    expect(parseSynonymJson('["hello", 42, null, "world"]')).toEqual(['hello', 'world']);
  });

  test('returns empty array for non-array JSON', () => {
    expect(parseSynonymJson('"hello"')).toEqual([]);
    expect(parseSynonymJson('42')).toEqual([]);
    expect(parseSynonymJson('null')).toEqual([]);
  });

  test('returns empty array for invalid JSON', () => {
    expect(parseSynonymJson('not json')).toEqual([]);
  });
});
