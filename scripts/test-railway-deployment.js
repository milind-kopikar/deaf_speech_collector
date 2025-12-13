/**
 * Test Railway Deployment
 * Tests both PostgreSQL database and Cloudflare R2 storage connectivity
 * 
 * Usage:
 *   node scripts/test-railway-deployment.js
 * 
 * Environment variables required:
 *   DATABASE_URL - Railway PostgreSQL connection string
 *   STORAGE_TYPE - Should be "s3" for R2
 *   S3_ENDPOINT - R2 endpoint URL
 *   S3_BUCKET - R2 bucket name
 *   AWS_ACCESS_KEY_ID - R2 access key
 *   AWS_SECRET_ACCESS_KEY - R2 secret key
 *   S3_PREFIX - Optional. When set, files are stored under <S3_PREFIX>/recordings/...
 */

const { Pool } = require('pg');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, colors.bright + colors.cyan);
  console.log('='.repeat(60));
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

// Test 1: Database Connection and Data
async function testDatabase() {
  logSection('TEST 1: PostgreSQL Database');
  
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logError('DATABASE_URL environment variable not set');
    return false;
  }
  
  logInfo(`Database URL: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}`);
  
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  
  try {
    // Test connection
    logInfo('Testing database connection...');
    await pool.query('SELECT NOW()');
    logSuccess('Database connection successful');
    
    // Check tables
    logInfo('Checking database tables...');
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const tables = tablesResult.rows.map(r => r.table_name);
    console.log('   Tables found:', tables.join(', '));
    
    const expectedTables = ['stories', 'sentences', 'recordings', 'user_progress'];
    const missingTables = expectedTables.filter(t => !tables.includes(t));
    if (missingTables.length > 0) {
      logWarning(`Missing tables: ${missingTables.join(', ')}`);
    } else {
      logSuccess('All expected tables exist');
    }
    
    // Check stories
    logInfo('Checking stories data...');
    const storiesResult = await pool.query('SELECT COUNT(*) as count FROM stories');
    const storyCount = parseInt(storiesResult.rows[0].count);
    console.log(`   Stories count: ${storyCount}`);
    
    if (storyCount > 0) {
      logSuccess(`Found ${storyCount} stories`);
      
      const storiesDetail = await pool.query(`
        SELECT id, title, total_sentences, language 
        FROM stories 
        ORDER BY id
      `);
      console.table(storiesDetail.rows);
    } else {
      logWarning('No stories found in database');
    }
    
    // Check sentences
    logInfo('Checking sentences data...');
    const sentencesResult = await pool.query('SELECT COUNT(*) as count FROM sentences');
    const sentenceCount = parseInt(sentencesResult.rows[0].count);
    console.log(`   Sentences count: ${sentenceCount}`);
    
    if (sentenceCount > 0) {
      logSuccess(`Found ${sentenceCount} sentences`);
      
      // Sample sentence
      const sampleResult = await pool.query(`
        SELECT s.id, st.title, s.order_in_story, s.text_devanagari, s.text_iast
        FROM sentences s
        JOIN stories st ON s.story_id = st.id
        LIMIT 1
      `);
      if (sampleResult.rows.length > 0) {
        console.log('\n   Sample sentence:');
        console.table(sampleResult.rows);
      }
    } else {
      logWarning('No sentences found in database');
    }
    
    // Check recordings
    logInfo('Checking recordings data...');
    const recordingsResult = await pool.query('SELECT COUNT(*) as count FROM recordings');
    const recordingCount = parseInt(recordingsResult.rows[0].count);
    console.log(`   Recordings count: ${recordingCount}`);
    
    if (recordingCount > 0) {
      logInfo(`Found ${recordingCount} recordings`);
    } else {
      logInfo('No recordings yet (expected for new deployment)');
    }
    
    await pool.end();
    return true;
    
  } catch (error) {
    logError(`Database test failed: ${error.message}`);
    console.error(error);
    await pool.end();
    return false;
  }
}

// Test 2: R2 Storage
async function testR2Storage() {
  logSection('TEST 2: Cloudflare R2 Storage');
  
  const storageType = process.env.STORAGE_TYPE;
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.S3_REGION || 'auto';
  const prefix = process.env.S3_PREFIX || '';
  
  // Check environment variables
  logInfo('Checking R2 configuration...');
  const missing = [];
  if (storageType !== 's3') {
    logWarning(`STORAGE_TYPE is "${storageType}", should be "s3" for R2`);
    if (!storageType) missing.push('STORAGE_TYPE');
  } else {
    logSuccess('STORAGE_TYPE is set to "s3"');
  }
  
  if (!endpoint) missing.push('S3_ENDPOINT');
  else console.log(`   S3_ENDPOINT: ${endpoint}`);
  
  if (!bucket) missing.push('S3_BUCKET');
  else console.log(`   S3_BUCKET: ${bucket}`);
  
  if (!accessKeyId) missing.push('AWS_ACCESS_KEY_ID');
  else console.log(`   AWS_ACCESS_KEY_ID: ${accessKeyId.substring(0, 8)}...`);
  
  if (!secretAccessKey) missing.push('AWS_SECRET_ACCESS_KEY');
  else console.log(`   AWS_SECRET_ACCESS_KEY: ${'*'.repeat(32)}`);
  
  console.log(`   S3_REGION: ${region}`);
  if (prefix) console.log(`   S3_PREFIX: ${prefix}`);
  
  if (missing.length > 0) {
    logError(`Missing environment variables: ${missing.join(', ')}`);
    return false;
  }
  
  logSuccess('All R2 environment variables are set');
  
  // Create S3 client
  const s3Client = new S3Client({
    region: region,
    endpoint: endpoint,
    credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey
    }
  });
  
  try {
    // Test bucket access
    logInfo('Testing R2 bucket access...');
    await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
    logSuccess('R2 bucket is accessible');
    
    // Test upload
    logInfo('Testing file upload...');
    const testFileName = `test-${Date.now()}.txt`;
    const testContent = `Test upload at ${new Date().toISOString()}\nFrom Railway deployment test`;
    
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: testFileName,
      Body: Buffer.from(testContent),
      ContentType: 'text/plain'
    }));
    logSuccess(`Test file uploaded: ${testFileName}`);
    
    // Test download
    logInfo('Testing file download...');
    const getResult = await s3Client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: testFileName
    }));
    
    const chunks = [];
    for await (const chunk of getResult.Body) {
      chunks.push(chunk);
    }
    const downloadedContent = Buffer.concat(chunks).toString('utf-8');
    
    if (downloadedContent === testContent) {
      logSuccess('File downloaded successfully and content matches');
    } else {
      logError('Downloaded content does not match uploaded content');
      return false;
    }
    
    // Test delete
    logInfo('Testing file deletion...');
    await s3Client.send(new DeleteObjectCommand({
      Bucket: bucket,
      Key: testFileName
    }));
    logSuccess('Test file deleted successfully');
    
    logSuccess('All R2 storage tests passed!');
    return true;
    
  } catch (error) {
    logError(`R2 storage test failed: ${error.message}`);
    console.error(error);
    return false;
  }
}

// Test 3: Integration Test (Database + Storage)
async function testIntegration() {
  logSection('TEST 3: Integration Test');
  
  logInfo('This test simulates the recording workflow:');
  console.log('   1. Fetch a sentence from database');
  console.log('   2. Simulate audio upload to R2');
  console.log('   3. Record metadata in database');
  console.log('   4. Verify data consistency');
  
  const databaseUrl = process.env.DATABASE_URL;
  const storageType = process.env.STORAGE_TYPE;
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.S3_REGION || 'auto';
  
  if (!databaseUrl || storageType !== 's3' || !endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    logError('Required environment variables not set. Run tests 1 and 2 first.');
    return false;
  }
  
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  
  const s3Client = new S3Client({
    region: region,
    endpoint: endpoint,
    credentials: {
      accessKeyId: accessKeyId,
      secretAccessKey: secretAccessKey
    }
  });
  
  try {
    // 1. Fetch a sentence
    logInfo('Step 1: Fetching a sentence from database...');
    const sentenceResult = await pool.query(`
      SELECT s.id, s.text_devanagari, s.text_iast, st.title
      FROM sentences s
      JOIN stories st ON s.story_id = st.id
      LIMIT 1
    `);
    
    if (sentenceResult.rows.length === 0) {
      logError('No sentences found in database');
      await pool.end();
      return false;
    }
    
    const sentence = sentenceResult.rows[0];
    logSuccess(`Found sentence #${sentence.id} from "${sentence.title}"`);
    console.log(`   Devanagari: ${sentence.text_devanagari}`);
    console.log(`   IAST: ${sentence.text_iast}`);
    
    // 2. Simulate audio upload
    logInfo('Step 2: Simulating audio upload to R2...');
    const testUserId = 'test-user-' + Date.now();
    const audioFileName = `recordings/${testUserId}/sentence_${sentence.id}_${Date.now()}.wav`;
    const audioContent = Buffer.from('RIFF....WAVEfmt '); // Fake WAV header
    
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: audioFileName,
      Body: audioContent,
      ContentType: 'audio/wav'
    }));
    logSuccess(`Audio file uploaded: ${audioFileName}`);
    
    // 3. Record metadata
    logInfo('Step 3: Recording metadata in database...');
    await pool.query(`
      INSERT INTO recordings (audio_filepath, user_id, sentence_id, validation_status)
      VALUES ($1, $2, $3, 'pending')
    `, [audioFileName, testUserId, sentence.id]);
    logSuccess('Recording metadata saved to database');
    
    // 4. Verify consistency
    logInfo('Step 4: Verifying data consistency...');
    const recordingResult = await pool.query(`
      SELECT r.id, r.audio_filepath, r.user_id, r.sentence_id, r.validation_status,
             s.text_devanagari, s.text_iast
      FROM recordings r
      JOIN sentences s ON r.sentence_id = s.id
      WHERE r.user_id = $1
    `, [testUserId]);
    
    if (recordingResult.rows.length === 0) {
      logError('Could not retrieve recording from database');
      await pool.end();
      return false;
    }
    
    const recording = recordingResult.rows[0];
    console.log('\n   Recording details:');
    console.table([{
      id: recording.id,
      sentence_id: recording.sentence_id,
      audio_file: recording.audio_filepath,
      status: recording.validation_status,
      devanagari: recording.text_devanagari.substring(0, 50) + '...',
      iast: recording.text_iast.substring(0, 50) + '...'
    }]);
    
    // Verify file exists in R2
    await s3Client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: audioFileName
    }));
    logSuccess('Audio file exists in R2 and database record matches');
    
    // Cleanup
    logInfo('Cleaning up test data...');
    await pool.query('DELETE FROM recordings WHERE user_id = $1', [testUserId]);
    await s3Client.send(new DeleteObjectCommand({
      Bucket: bucket,
      Key: audioFileName
    }));
    logSuccess('Test data cleaned up');
    
    await pool.end();
    
    logSuccess('Integration test passed! Database and R2 are working together correctly.');
    return true;
    
  } catch (error) {
    logError(`Integration test failed: ${error.message}`);
    console.error(error);
    await pool.end();
    return false;
  }
}

// Main test runner
async function runAllTests() {
  console.log('\n');
  log('╔════════════════════════════════════════════════════════════╗', colors.bright);
  log('║     Railway Deployment Test Suite                         ║', colors.bright);
  log('║     Testing PostgreSQL Database + Cloudflare R2           ║', colors.bright);
  log('╚════════════════════════════════════════════════════════════╝', colors.bright);
  
  const results = {
    database: false,
    r2: false,
    integration: false
  };
  
  try {
    results.database = await testDatabase();
    results.r2 = await testR2Storage();
    
    if (results.database && results.r2) {
      results.integration = await testIntegration();
    } else {
      logWarning('Skipping integration test due to previous failures');
    }
    
  } catch (error) {
    logError(`Test suite error: ${error.message}`);
    console.error(error);
  }
  
  // Summary
  logSection('TEST SUMMARY');
  console.log(`Database Test:     ${results.database ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`R2 Storage Test:   ${results.r2 ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`Integration Test:  ${results.integration ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('');
  
  const allPassed = results.database && results.r2 && results.integration;
  if (allPassed) {
    log('🎉 ALL TESTS PASSED! Your Railway deployment is fully operational.', colors.bright + colors.green);
  } else {
    log('⚠️  Some tests failed. Check the output above for details.', colors.bright + colors.red);
  }
  
  console.log('\n');
  process.exit(allPassed ? 0 : 1);
}

// Run tests
runAllTests();
