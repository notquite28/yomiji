import { KanaAlphabet } from './answerChecker';

const replacements: Record<string, string> = {
  a: 'あ',
  ba: 'ば',
  be: 'べ',
  bi: 'び',
  bo: 'ぼ',
  bu: 'ぶ',
  bya: 'びゃ',
  bye: 'びぇ',
  byi: 'びぃ',
  byo: 'びょ',
  byu: 'びゅ',
  ca: 'か',
  ce: 'け',
  cha: 'ちゃ',
  che: 'ちぇ',
  chi: 'ち',
  cho: 'ちょ',
  chu: 'ちゅ',
  chya: 'ちゃ',
  chye: 'ちぇ',
  chyo: 'ちょ',
  chyu: 'ちゅ',
  ci: 'き',
  co: 'こ',
  cu: 'く',
  cya: 'ちゃ',
  cye: 'ちぇ',
  cyi: 'ちぃ',
  cyo: 'ちょ',
  cyu: 'ちゅ',
  da: 'だ',
  de: 'で',
  dha: 'でゃ',
  dhe: 'でぇ',
  dhi: 'でぃ',
  dho: 'でょ',
  dhu: 'でゅ',
  di: 'ぢ',
  do: 'ど',
  du: 'づ',
  dwa: 'どぁ',
  dwe: 'どぇ',
  dwi: 'どぃ',
  dwo: 'どぉ',
  dwu: 'どぅ',
  dya: 'ぢゃ',
  dye: 'ぢぇ',
  dyi: 'ぢぃ',
  dyo: 'ぢょ',
  dyu: 'ぢゅ',
  e: 'え',
  fa: 'ふぁ',
  fe: 'ふぇ',
  fi: 'ふぃ',
  fo: 'ふぉ',
  fu: 'ふ',
  fwa: 'ふぁ',
  fwe: 'ふぇ',
  fwi: 'ふぃ',
  fwo: 'ふぉ',
  fwu: 'ふぅ',
  fya: 'ふゃ',
  fye: 'ふぇ',
  fyi: 'ふぃ',
  fyo: 'ふょ',
  fyu: 'ふゅ',
  ga: 'が',
  ge: 'げ',
  gi: 'ぎ',
  go: 'ご',
  gu: 'ぐ',
  gwa: 'ぐぁ',
  gwe: 'ぐぇ',
  gwi: 'ぐぃ',
  gwo: 'ぐぉ',
  gwu: 'ぐぅ',
  gya: 'ぎゃ',
  gye: 'ぎぇ',
  gyi: 'ぎぃ',
  gyo: 'ぎょ',
  gyu: 'ぎゅ',
  ha: 'は',
  he: 'へ',
  hi: 'ひ',
  ho: 'ほ',
  hu: 'ふ',
  hya: 'ひゃ',
  hye: 'ひぇ',
  hyi: 'ひぃ',
  hyo: 'ひょ',
  hyu: 'ひゅ',
  i: 'い',
  ja: 'じゃ',
  je: 'じぇ',
  ji: 'じ',
  jo: 'じょ',
  ju: 'じゅ',
  jya: 'じゃ',
  jye: 'じぇ',
  jyi: 'じぃ',
  jyo: 'じょ',
  jyu: 'じゅ',
  ka: 'か',
  ke: 'け',
  ki: 'き',
  ko: 'こ',
  ku: 'く',
  kwa: 'くぁ',
  kya: 'きゃ',
  kye: 'きぇ',
  kyi: 'きぃ',
  kyo: 'きょ',
  kyu: 'きゅ',
  la: 'ら',
  lca: 'ヵ',
  lce: 'ヶ',
  le: 'れ',
  li: 'り',
  lka: 'ヵ',
  lke: 'ヶ',
  lo: 'ろ',
  ltsu: 'っ',
  ltu: 'っ',
  lu: 'る',
  lwe: 'ゎ',
  lya: 'りゃ',
  lye: 'りぇ',
  lyi: 'りぃ',
  lyo: 'りょ',
  lyu: 'りゅ',
  ma: 'ま',
  me: 'め',
  mi: 'み',
  mo: 'も',
  mu: 'む',
  mya: 'みゃ',
  mye: 'みぇ',
  myi: 'みぃ',
  myo: 'みょ',
  myu: 'みゅ',
  'n ': 'ん',
  na: 'な',
  ne: 'ね',
  ni: 'に',
  nn: 'ん',
  no: 'の',
  nu: 'ぬ',
  nya: 'にゃ',
  nye: 'にぇ',
  nyi: 'にぃ',
  nyo: 'にょ',
  nyu: 'にゅ',
  o: 'お',
  pa: 'ぱ',
  pe: 'ぺ',
  pi: 'ぴ',
  po: 'ぽ',
  pu: 'ぷ',
  pya: 'ぴゃ',
  pye: 'ぴぇ',
  pyi: 'ぴぃ',
  pyo: 'ぴょ',
  pyu: 'ぴゅ',
  qa: 'くぁ',
  qe: 'くぇ',
  qi: 'くぃ',
  qo: 'くぉ',
  qwa: 'くぁ',
  qwe: 'くぇ',
  qwi: 'くぃ',
  qwo: 'くぉ',
  qwu: 'くぅ',
  qya: 'くゃ',
  qye: 'くぇ',
  qyi: 'くぃ',
  qyo: 'くょ',
  qyu: 'くゅ',
  ra: 'ら',
  re: 'れ',
  ri: 'り',
  ro: 'ろ',
  ru: 'る',
  rya: 'りゃ',
  rye: 'りぇ',
  ryi: 'りぃ',
  ryo: 'りょ',
  ryu: 'りゅ',
  sa: 'さ',
  se: 'せ',
  sha: 'しゃ',
  she: 'しぇ',
  shi: 'し',
  sho: 'しょ',
  shu: 'しゅ',
  shya: 'しゃ',
  shye: 'しぇ',
  shyo: 'しょ',
  shyu: 'しゅ',
  si: 'し',
  so: 'そ',
  su: 'す',
  swa: 'すぁ',
  swe: 'すぇ',
  swi: 'すぃ',
  swo: 'すぉ',
  swu: 'すぅ',
  sya: 'しゃ',
  sye: 'しぇ',
  syi: 'しぃ',
  syo: 'しょ',
  syu: 'しゅ',
  ta: 'た',
  te: 'て',
  tha: 'てゃ',
  the: 'てぇ',
  thi: 'てぃ',
  tho: 'てょ',
  thu: 'てゅ',
  ti: 'ち',
  to: 'と',
  tsa: 'つぁ',
  tse: 'つぇ',
  tsi: 'つぃ',
  tso: 'つぉ',
  tsu: 'つ',
  tu: 'つ',
  twa: 'とぁ',
  twe: 'とぇ',
  twi: 'とぃ',
  two: 'とぉ',
  twu: 'とぅ',
  tya: 'ちゃ',
  tye: 'ちぇ',
  tyi: 'ちぃ',
  tyo: 'ちょ',
  tyu: 'ちゅ',
  u: 'う',
  va: 'ゔぁ',
  ve: 'ゔぇ',
  vi: 'ゔぃ',
  vo: 'ゔぉ',
  vu: 'ゔ',
  vya: 'ゔゃ',
  vye: 'ゔぇ',
  vyi: 'ゔぃ',
  vyo: 'ゔょ',
  vyu: 'ゔゅ',
  wa: 'わ',
  we: 'うぇ',
  wha: 'うぁ',
  whe: 'うぇ',
  whi: 'うぃ',
  who: 'うぉ',
  whu: 'う',
  wi: 'うぃ',
  wo: 'を',
  wu: 'う',
  xa: 'ぁ',
  xca: 'ヵ',
  xce: 'ヶ',
  xe: 'ぇ',
  xi: 'ぃ',
  xka: 'ヵ',
  xke: 'ヶ',
  xn: 'ん',
  xo: 'ぉ',
  xtu: 'っ',
  xu: 'ぅ',
  xwa: 'ゎ',
  xya: 'ゃ',
  xye: 'ぇ',
  xyi: 'ぃ',
  xyo: 'ょ',
  xyu: 'ゅ',
  ya: 'や',
  ye: 'いぇ',
  yi: 'い',
  yo: 'よ',
  yu: 'ゆ',
  za: 'ざ',
  ze: 'ぜ',
  zi: 'じ',
  zo: 'ぞ',
  zu: 'ず',
  zya: 'じゃ',
  zye: 'じぇ',
  zyi: 'じぃ',
  zyo: 'じょ',
  zyu: 'じゅ',
  '-': 'ー',
};

const consonants = new Set('bcdfghjklmnpqrstvwxyz'.split(''));
const nLike = new Set(['n', 'm']);
const canFollowN = new Set('aiueony'.split(''));

export function convertRomajiToKanaInput(input: string, alphabet: KanaAlphabet = 'hiragana') {
  const chars = Array.from(input);
  let output = '';
  let index = 0;

  while (index < chars.length) {
    const current = chars[index] ?? '';
    const currentLower = current.toLowerCase();
    const nextLower = chars[index + 1]?.toLowerCase();

    if (nextLower && currentLower !== 'n' && currentLower === nextLower && consonants.has(currentLower)) {
      output += alphabet === 'katakana' || isUppercase(current) ? 'ッ' : 'っ';
      index += 1;
      continue;
    }

    if (nextLower && nLike.has(currentLower) && currentLower !== nextLower && !canFollowN.has(nextLower)) {
      output += alphabet === 'katakana' || isUppercase(current) ? 'ン' : 'ん';
      index += 1;
      continue;
    }

    const replacement = findReplacement(chars, index);
    if (replacement) {
      output += alphabet === 'katakana' || isUppercase(current) ? hiraganaToKatakana(replacement.value) : replacement.value;
      index += replacement.length;
      continue;
    }

    output += current;
    index += 1;
  }

  return output;
}

function findReplacement(chars: string[], start: number) {
  for (let length = 4; length > 0; length -= 1) {
    const text = chars.slice(start, start + length).join('').toLowerCase();
    const value = replacements[text];
    if (value) {
      return { value, length };
    }
  }
  return undefined;
}

function hiraganaToKatakana(text: string) {
  return Array.from(text)
    .map((character) => {
      const codePoint = character.codePointAt(0);
      if (!codePoint || character === 'ー') {
        return character;
      }
      if (codePoint >= 0x3041 && codePoint <= 0x3096) {
        return String.fromCodePoint(codePoint + 0x60);
      }
      return character;
    })
    .join('');
}

function isUppercase(character: string) {
  return character.toLocaleUpperCase() === character && character.toLocaleLowerCase() !== character;
}
