import { calculateLeechScore } from './dashboardRepository';

describe('calculateLeechScore', () => {
  test('returns 0 when both incorrect and correct are 0', () => {
    expect(calculateLeechScore(0, 0)).toBe(0);
  });

  test('returns 0 when incorrect is 0 but correct is positive', () => {
    expect(calculateLeechScore(0, 10)).toBe(0);
  });

  test('returns 100 when correct is 0 but incorrect is positive', () => {
    expect(calculateLeechScore(5, 0)).toBe(100);
  });

  test('returns percentage rounded to nearest integer', () => {
    expect(calculateLeechScore(1, 3)).toBe(25);
    expect(calculateLeechScore(1, 1)).toBe(50);
    expect(calculateLeechScore(3, 7)).toBe(30);
  });

  test('handles large numbers', () => {
    expect(calculateLeechScore(100, 900)).toBe(10);
  });

  test('handles edge case of 1 incorrect out of 101 total', () => {
    expect(calculateLeechScore(1, 100)).toBe(1);
  });
});
