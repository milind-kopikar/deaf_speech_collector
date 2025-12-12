#!/usr/bin/env node
/**
 * Verify Railway Database Content
 * Checks stories, sentences, and data integrity
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function verify() {
  try {
    console.log('='.repeat(60));
    console.log('Railway Database Verification');
    console.log('='.repeat(60));
    console.log('');

    // 1. Check stories
    console.log('📚 Stories:');
    const stories = await pool.query('SELECT id, title, source_file, total_sentences FROM stories ORDER BY id');
    console.table(stories.rows);

    // 2. Check actual sentence counts
    console.log('📊 Actual Sentence Counts:');
    const counts = await pool.query(`
      SELECT 
        s.id,
        s.title,
        s.total_sentences as expected,
        COUNT(se.id) as actual,
        CASE 
          WHEN s.total_sentences = COUNT(se.id) THEN '✓'
          ELSE '✗ MISMATCH'
        END as status
      FROM stories s
      LEFT JOIN sentences se ON se.story_id = s.id
      GROUP BY s.id, s.title, s.total_sentences
      ORDER BY s.id
    `);
    console.table(counts.rows);

    // 3. Sample sentences
    console.log('📝 Sample Sentences (first 2 from each story):');
    const samples = await pool.query(`
      SELECT 
        st.id as story_id,
        st.title,
        se.order_in_story,
        LEFT(se.text_devanagari, 50) as devanagari_preview,
        LEFT(se.text_iast, 50) as iast_preview
      FROM sentences se
      JOIN stories st ON st.id = se.story_id
      WHERE se.order_in_story <= 2
      ORDER BY st.id, se.order_in_story
    `);
    console.table(samples.rows);

    // 4. Check for recordings
    console.log('🎙️  Recordings:');
    const recordings = await pool.query('SELECT COUNT(*) as total FROM recordings');
    console.log(`Total recordings: ${recordings.rows[0].total}`);

    // 5. Summary
    const totalStories = stories.rows.length;
    const totalSentences = counts.rows.reduce((sum, r) => sum + parseInt(r.actual), 0);
    
    console.log('');
    console.log('='.repeat(60));
    console.log('Summary:');
    console.log(`  Stories: ${totalStories}`);
    console.log(`  Sentences: ${totalSentences}`);
    console.log(`  Recordings: ${recordings.rows[0].total}`);
    console.log('='.repeat(60));
    console.log('');

    // Check for issues
    const mismatches = counts.rows.filter(r => r.status === '✗ MISMATCH');
    if (mismatches.length > 0) {
      console.log('⚠️  Issues found:');
      mismatches.forEach(m => {
        console.log(`  Story ${m.id}: Expected ${m.expected} sentences, found ${m.actual}`);
      });
    } else {
      console.log('✅ All data verified successfully!');
    }

  } catch (error) {
    console.error('❌ Verification failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

verify();
