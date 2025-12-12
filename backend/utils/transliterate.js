/**
 * Compatibility wrapper that re-exports the canonical transliteration implementation.
 */
module.exports = require('./transliterate-canonical');
/**
 * Compatibility wrapper that re-exports the canonical transliteration implementation.
 */
module.exports = require('./transliterate-canonical');

/**
 * Transliteration helper using Sanscript
 * Converts Devanagari script (Konkani) -> IAST (Latin script)
 */

const Sanscript = require('sanscript');
const fs = require('fs');
const path = require('path');

let rules = { diacritical: [], guide2: [] };
try {
  const data = fs.readFileSync(path.join(__dirname, 'transliteration_rules.json'), 'utf8');
  rules = JSON.parse(data);
} catch (err) {
  // If rules file doesn't exist or parse fails, continue with empty rules
}

function applyRules(iastText) {
  let out = iastText;
  // Apply diacritical rules first
  (rules.diacritical || []).forEach(rule => {
    const from = rule.from;
    const to = rule.to || '';
    const re = new RegExp(from, 'g');
    out = out.replace(re, to);
  });
  // Apply guide2 rules next (take precedence)
  (rules.guide2 || []).forEach(rule => {
    const from = rule.from;
    const to = rule.to || '';
    const re = new RegExp(from, 'g');
    out = out.replace(re, to);
  });
  // Remove stray Devanagari characters if any
  out = out.replace(/[\u0900-\u097F]/g, '');
  // Normalize whitespace
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

function devanagariToIAST(text) {
  if (!text) return '';
  try {
    const base = Sanscript.t(text, 'devanagari', 'iast');
    return applyRules(base);
  } catch (err) {
    console.error('Transliteration error:', err);
    return '';
  }
}

module.exports = {
  devanagariToIAST,
  applyRules,
};
/**
 * Transliteration helper using Sanscript
 * Converts Devanagari script (Konkani) -> IAST (Latin script)
 */

const Sanscript = require('sanscript');
const fs = require('fs');
const path = require('path');

let rules = { diacritical: [], guide2: [] };
try {
  const data = fs.readFileSync(path.join(__dirname, 'transliteration_rules.json'), 'utf8');
  rules = JSON.parse(data);
} catch (err) {
  // If rules file doesn't exist or parse fails, continue with empty rules
}

function applyRules(iastText) {
  let out = iastText;
  // Apply diacritical rules first
  (rules.diacritical || []).forEach(rule => {
    const from = rule.from;
    const to = rule.to || '';
    const re = new RegExp(from, 'g');
    out = out.replace(re, to);
  });
  // Apply guide2 rules next (take precedence)
  (rules.guide2 || []).forEach(rule => {
    const from = rule.from;
    const to = rule.to || '';
    const re = new RegExp(from, 'g');
    out = out.replace(re, to);
  });
  // Remove stray Devanagari characters if any
  out = out.replace(/[\u0900-\u097F]/g, '');
  // Normalize whitespace
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

function devanagariToIAST(text) {
  if (!text) return '';
  try {
    const base = Sanscript.t(text, 'devanagari', 'iast');
    return applyRules(base);
  } catch (err) {
    console.error('Transliteration error:', err);
    return '';
  }
}

module.exports = {
  devanagariToIAST,
  applyRules,
};
/**
 * Transliteration helper using Sanscript
 * Converts Devanagari script (Konkani) -> IAST (Latin script)
 */

const Sanscript = require('sanscript');
const fs = require('fs');
const path = require('path');

let rules = { diacritical: [], guide2: [] };
try {
  const data = fs.readFileSync(path.join(__dirname, 'transliteration_rules.json'), 'utf8');
  rules = JSON.parse(data);
} catch (err) {
  // If rules file doesn't exist or parse fails, continue with empty rules
}

function applyRules(iastText) {
  let out = iastText;
  // Apply diacritical rules first
  (rules.diacritical || []).forEach(rule => {
    const from = rule.from;
    const to = rule.to || '';
    const re = new RegExp(from, 'g');
    out = out.replace(re, to);
  });
  // Apply guide2 rules next (take precedence)
  (rules.guide2 || []).forEach(rule => {
    const from = rule.from;
    const to = rule.to || '';
    const re = new RegExp(from, 'g');
    out = out.replace(re, to);
  });
  // Remove stray Devanagari characters if any
  out = out.replace(/[\u0900-\u097F]/g, '');
  // Normalize whitespace
  out = out.replace(/\s+/g, ' ').trim();
  return out;
}

function devanagariToIAST(text) {
  if (!text) return '';
  try {
    const base = Sanscript.t(text, 'devanagari', 'iast');
    return applyRules(base);
  } catch (err) {
    console.error('Transliteration error:', err);
    return '';
  }
}

module.exports = {
  devanagariToIAST,
  applyRules,
};
/**
 * Transliteration helper using Sanscript
 * Converts Devanagari script (Konkani) -> IAST (Latin script)
 */

const Sanscript = require('sanscript');

// Map input and output schemes. Sanscript supports schemes like 'devanagari' and 'iast'.
// Use default mapping to IAST.

function devanagariToIAST(text) {
    if (!text) return '';
    try {
        return Sanscript.t(text, 'devanagari', 'iast');
    } catch (err) {
        console.error('Transliteration error:', err);
        return '';
    }
}

module.exports = {
    devanagariToIAST,
};
