#!/usr/bin/env node
/**
 * Story Import Script
 * Parses .txt story files and imports sentences to database
 * 
 * Usage:
 *   node scripts/import-story.js --file story1.txt --title "पाव वाट"
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { program } = require('commander');
const { query, queryOne } = require('../backend/db');

// Parse command line arguments
program
    .requiredOption('-f, --file <path>', 'Path to story .txt file')
    .requiredOption('-t, --title <title>', 'Story title')
    .option('-l, --language <lang>', 'Language', 'konkani')
    .option('-r, --replace', 'Replace existing story with same source_file or title (deletes existing story and related sentences/recordings)')
    .parse();

const options = program.opts();

/**
 * Split text into sentences while avoiding standalone punctuation entries
 * 
 * Handles Devanagari punctuation (। danda and ॥ double danda) as sentence separators.
 * Post-processes results to merge any standalone punctuation/quote marks into adjacent sentences,
 * preventing database entries that contain only symbols without actual text.
 * 
 * @param {string} text - Story text in Devanagari script
 * @returns {string[]} Array of sentence strings, with punctuation merged into proper sentences
 * 
 * Algorithm:
 * 1. Split on Devanagari danda, double danda, or newlines
 * 2. For each resulting segment, check if it contains only punctuation (no letters)
 * 3. If standalone punctuation found:
 *    - Merge into previous sentence if available
 *    - Otherwise merge into next sentence
 *    - If neither exists (edge case), keep as-is
 * 
 * The isStandalonePunc helper uses Unicode regex \p{L} and Devanagari range \u0900-\u097F
 * to detect presence of actual letters vs. pure punctuation/symbols.
 */
function splitIntoSentences(text) {
    // Split on Devanagari danda (।) or English period or newline
    let raw = text.split(/[।॥\n]+/).map(s => s.trim());
    // Post-process to merge standalone punctuation/quote tokens into previous sentence(if present)
    const isStandalonePunc = (s) => {
        if (!s || s.trim().length === 0) return false;
        // If the string contains at least one alphanumeric Devanagari or Latin letter, consider not-only-punctuation
        // We'll match letters from Devanagari range \u0900-\u097F and Latin letters\p{L}
        // If none found, it's likely punctuation/quotes only
        const hasLetter = /[\p{L}\u0900-\u097F]/u.test(s);
        if (hasLetter) return false;
        // Only punctuation/marks remain
        return true;
    };

    const sentences = [];
    for (let i = 0; i < raw.length; i++) {
        const segment = raw[i];
        if (!segment || segment.length === 0) continue;
        if (isStandalonePunc(segment)) {
            // Attach to previous if exists, otherwise attach to next (if exists)
            if (sentences.length > 0) {
                sentences[sentences.length - 1] = (sentences[sentences.length - 1] + ' ' + segment).trim();
            } else if (i + 1 < raw.length && raw[i + 1] && raw[i + 1].length > 0) {
                raw[i + 1] = (segment + ' ' + raw[i + 1]).trim();
            } else {
                // nothing to attach; treat as a sentence
                sentences.push(segment);
            }
        } else {
            sentences.push(segment);
        }
    }

    return sentences.filter(s => s && s.length > 0);
}

const { devanagariToIAST } = require('../backend/utils/transliterate-canonical');
/**
 * Transliterate to IAST using our helper
 */
function transliterateToIAST(devanagari) {
    try {
        return devanagariToIAST(devanagari);
    } catch (err) {
        console.error('Transliteration failed for text:', devanagari, err);
        return '';
    }
}

async function importStory() {
    try {
        console.log('='.repeat(50));
        console.log('📚 Konkani Story Importer');
        console.log('='.repeat(50));
        
        // 1. Read file
        const filePath = path.resolve(options.file);
        console.log(`Reading file: ${filePath}`);
        
        const content = await fs.readFile(filePath, 'utf-8');
        
        if (!content || content.trim().length === 0) {
            throw new Error('File is empty');
        }

        // 2. Split into sentences
        const sentences = splitIntoSentences(content);
        console.log(`Found ${sentences.length} sentences`);

        if (sentences.length === 0) {
            throw new Error('No sentences found in file');
        }

        // 3. If replace was requested, delete any existing story with the same source_file or title
        if (options.replace) {
            console.log('⚠️ Replace flag detected — searching for existing stories to delete');
            const existingByFile = await queryOne('SELECT id, title, source_file FROM stories WHERE source_file = $1', [path.basename(filePath)]);
            const existingByTitle = await queryOne('SELECT id, title, source_file FROM stories WHERE title = $1', [options.title]);
            const toDelete = existingByFile || (existingByTitle && existingByTitle.source_file !== path.basename(filePath) ? existingByTitle : null);
            if (toDelete) {
                let delId = toDelete.id;
                console.log(`Deleting existing story entry (id=${delId}) to replace it`);
                await query('DELETE FROM stories WHERE id = $1', [delId]);
                console.log('✓ Existing story (and its sentences/recordings) deleted');
            }
        }

        // 4. Insert story
        console.log(`Creating story: "${options.title}"`);
        
        const story = await queryOne(
            `INSERT INTO stories (title, source_file, language, total_sentences)
             VALUES ($1, $2, $3, $4)
             RETURNING id`,
            [options.title, path.basename(filePath), options.language, sentences.length]
        );

        console.log(`✓ Story created with ID: ${story.id}`);

        // 5. Insert sentences
        console.log('Importing sentences...');
        
        for (let i = 0; i < sentences.length; i++) {
            const text = sentences[i];
            const iast = transliterateToIAST(text);
            const charCount = text.length;

            await query(
                `INSERT INTO sentences (story_id, order_in_story, text_devanagari, text_iast, char_count)
                 VALUES ($1, $2, $3, $4, $5)`,
                [story.id, i + 1, text, iast, charCount]
            );

            // Progress indicator
            if ((i + 1) % 10 === 0 || (i + 1) === sentences.length) {
                process.stdout.write(`\r  Imported: ${i + 1}/${sentences.length} sentences`);
            }
        }
        console.log('\n');

        // 5. Summary
        console.log('='.repeat(50));
        console.log('✅ Import Complete!');
        console.log('='.repeat(50));
        console.log(`Story ID: ${story.id}`);
        console.log(`Title: ${options.title}`);
        console.log(`Total Sentences: ${sentences.length}`);
        console.log(`Language: ${options.language}`);
        console.log('\nNext steps:');
        console.log(`  1. Open http://localhost:3000/recorder.html`);
        console.log(`  2. Select story: ${options.title}`);
        console.log(`  3. Start recording!`);
        console.log('='.repeat(50));

        process.exit(0);

    } catch (error) {
        console.error('\n❌ Import failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run import
importStory();
