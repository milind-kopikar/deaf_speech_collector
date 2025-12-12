const { devanagariToIAST } = require('../transliterate-canonical');

describe('Transliteration helper (devanagariToIAST)', () => {
  test('should transliterate nukta z (ज़) using IAST then diacritical corrections', () => {
    expect(devanagariToIAST('ज़ोरु')).toBe('jaoru');
  });

  test('should transliterate फ with nukta (फ़) using IAST (no nukta conversion)', () => {
    expect(devanagariToIAST('फ़ूल')).toBe('phaūla');
  });

  test('should transliterate qa (क़) using IAST (no nukta conversion)', () => {
    expect(devanagariToIAST('क़िताब')).toBe('kaitāba');
  });

  test('should transliterate ड़ (ḍa) (no diacritical overrides)', () => {
    expect(devanagariToIAST('ड़')).toBe('ḍa');
  });
});
