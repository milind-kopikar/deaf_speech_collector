-- Example seed data for testing
-- Run after schema.sql

-- Insert example story
INSERT INTO stories (title, source_file, language, total_sentences)
VALUES ('पाव वाट', 'story1.txt', 'konkani', 3);

-- Insert example sentences
INSERT INTO sentences (story_id, order_in_story, text_devanagari, text_iast, char_count)
VALUES
    (1, 1, 'चल रे भोपळा टुनुक टुनुक', 'cal re bhopala tunuk tunuk', 27),
    (1, 2, 'एकी गोम्टी काणी आय्कयाति', 'eki gomti kani ayakyati', 25),
    (1, 3, 'एक घरांतु एकी आज्जी एक्ऴि राब्तालि।', 'ek gharantu eki ajji ekḷi rabtali', 36);

-- Note: You'll add recordings via the web interface or API
-- This seed file only creates the structure for testing
