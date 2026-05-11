const CSS_VARIABLE_PATTERN = /var\(\s*--[A-Za-z0-9_-]+(?:\s*,\s*([^)]*))?\)/g;

export function replaceCssVariableFallbacks(xml: string) {
  return xml.replace(CSS_VARIABLE_PATTERN, (_match, fallback: string | undefined) => fallback?.trim() || '#000');
}
