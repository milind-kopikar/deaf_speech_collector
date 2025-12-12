const { execSync } = require('child_process');
describe('Transliteration CLI', () => {
  test('help output contains --all and --checkpoint-file flags', () => {
    const out = execSync('node scripts/transliterate-sentences.js --help', { encoding: 'utf8' });
    expect(out).toMatch(/--all/);
    expect(out).toMatch(/--checkpoint-file/);
    expect(out).toMatch(/--batch-size/);
  });
});
