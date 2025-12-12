/**
 * Canonical transliteration helper — Devanagari -> IAST (Sanscript), then apply diacritical corrections
 */
const Sanscript = require('sanscript');
const fs = require('fs');
const path = require('path');

let rules = { diacritical: [] };
try {
  const fileData = fs.readFileSync(path.join(__dirname, 'transliteration_rules.json'), 'utf8');
  const parsed = JSON.parse(fileData);
  if (parsed && parsed.diacritical) rules.diacritical = parsed.diacritical;
} catch (_) {}

function applyRules(iastText) {
  let out = iastText;
  (rules.diacritical || []).forEach(rule => {
    const re = new RegExp(rule.from, 'g');
    out = out.replace(re, rule.to || '');
  });
    // Remove stray Devanagari characters and combining marks (if any persisted)
    out = out.replace(/[\u0900-\u097F]/g, '');
    out = out.replace(/[\u0300-\u036F\u1AB0-\u1AFF\u20D0-\u20FF]/g, '');
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

function devanagariToIAST(text) {
  if (!text) return '';
  try {
    const base = Sanscript.t(text, 'devanagari', 'iast');
    return applyRules(base);
  } catch (err) {
    console.error('Transliteration error:', err.message || err);
    return '';
  }
}

function devanagariToDiacriticLatin(text) {
  if (!text) return '';
  try {
    let out = text;
    // Apply diacritical rules that are Devanagari-based
    (rules.diacritical || []).forEach(rule => {
      // Skip mapping where 'from' is Latin-based (like 'aa' -> 'ā')
      if (/[\u0900-\u097F]/.test(rule.from)) {
        const re = new RegExp(rule.from, 'g');
        out = out.replace(re, rule.to || '');
      }
    });
    // Remove any remaining Devanagari characters if not mapped
    out = out.replace(/[\u0900-\u097F]/g, '');
    // Normalize whitespace
    out = out.replace(/\s+/g, ' ').trim();
    return out;
  } catch (err) {
    console.error('Direct transliteration error:', err);
    return '';
  }
}

module.exports = { devanagariToIAST, applyRules, devanagariToDiacriticLatin };
