const CSS_VARIABLE_PATTERN = /var\(\s*--[A-Za-z0-9_-]+(?:\s*,\s*([^)]*))?\)/g;
const COLOR_TEXT_VARIABLE_PATTERN = /var\(\s*--color-text(?:\s*,\s*[^)]*)?\)/g;

export function replaceCssVariableFallbacks(xml: string) {
  return xml.replace(CSS_VARIABLE_PATTERN, (_match, fallback: string | undefined) => fallback?.trim() || '#000');
}

export function replaceCssVariableFallbacksForHero(xml: string) {
  return replaceCssVariableFallbacks(xml.replace(COLOR_TEXT_VARIABLE_PATTERN, '#ffffff'));
}
