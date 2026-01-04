-- ============================================
-- BRAIN TRAINING SYSTEM - AI Training Infrastructure
-- Created: 2026-01-04
-- ============================================

-- ============================================
-- PAGE AI CONTEXT TABLE
-- Stores AI training data for each page/route
-- ============================================

CREATE TABLE IF NOT EXISTS page_ai_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Page identification
  page_route TEXT NOT NULL UNIQUE,          -- '/projects/:projectId/shades/:shadeId'
  component_name TEXT NOT NULL,              -- 'ShadeDetailPage'
  page_title TEXT,                           -- 'Shade Measurement Detail'

  -- Core AI Context Fields (populated during training)
  functional_description TEXT,               -- What this page does technically
  business_context TEXT,                     -- Why this page exists in the business
  workflow_position TEXT,                    -- Where this fits in the overall workflow
  real_world_use_case TEXT,                  -- Actual job site scenario/example
  target_users TEXT[],                       -- ['technician', 'project-manager']

  -- Training Content
  training_script JSONB,                     -- Structured teaching script with steps
  common_mistakes TEXT[],                    -- Array of common user errors
  best_practices TEXT[],                     -- Array of expert tips
  pro_tips TEXT[],                           -- Advanced usage tips

  -- Voice Interaction Patterns (learned from usage)
  interaction_patterns JSONB DEFAULT '[]',   -- Successful voice command patterns
  failed_patterns JSONB DEFAULT '[]',        -- Patterns that didn't work well

  -- Anticipated Questions & Answers
  faq JSONB DEFAULT '[]',                    -- [{question: "", answer: ""}]

  -- Training Session History
  training_sessions JSONB DEFAULT '[]',      -- Array of training session summaries
  last_trained_at TIMESTAMPTZ,
  last_trained_by UUID REFERENCES auth.users(id),
  training_version INTEGER DEFAULT 0,

  -- Performance Metrics
  metrics JSONB DEFAULT '{
    "teaching_sessions": 0,
    "avg_session_completion": 0,
    "user_success_rate": 0,
    "voice_command_success_rate": 0
  }',

  -- Status
  is_trained BOOLEAN DEFAULT FALSE,
  is_published BOOLEAN DEFAULT FALSE,       -- Whether this training is live

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_page_ai_context_route ON page_ai_context(page_route);
CREATE INDEX IF NOT EXISTS idx_page_ai_context_trained ON page_ai_context(is_trained, is_published);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_page_ai_context_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS page_ai_context_updated ON page_ai_context;
CREATE TRIGGER page_ai_context_updated
  BEFORE UPDATE ON page_ai_context
  FOR EACH ROW
  EXECUTE FUNCTION update_page_ai_context_timestamp();

-- ============================================
-- TRAINING SESSION TRANSCRIPTS
-- Stores full transcripts for reference/retraining
-- ============================================

CREATE TABLE IF NOT EXISTS ai_training_transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_context_id UUID REFERENCES page_ai_context(id) ON DELETE CASCADE,
  page_route TEXT NOT NULL,

  -- Session metadata
  session_type TEXT NOT NULL,               -- 'initial', 'append', 'retrain'
  trained_by UUID REFERENCES auth.users(id),
  trainer_name TEXT,

  -- Transcript content
  transcript JSONB NOT NULL,                -- [{role: 'user'|'ai', content: '', timestamp: ''}]
  duration_seconds INTEGER,

  -- Extracted knowledge
  extracted_facts JSONB DEFAULT '[]',       -- Key facts extracted from this session
  extracted_tips JSONB DEFAULT '[]',        -- Tips extracted
  extracted_mistakes JSONB DEFAULT '[]',    -- Mistakes mentioned

  -- Audio reference (if stored)
  audio_url TEXT,                           -- SharePoint URL to audio recording

  -- Status
  processed BOOLEAN DEFAULT FALSE,          -- Whether AI has processed this transcript
  merged_to_context BOOLEAN DEFAULT FALSE,  -- Whether merged into main context

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_transcripts_page ON ai_training_transcripts(page_route);
CREATE INDEX IF NOT EXISTS idx_training_transcripts_processed ON ai_training_transcripts(processed);

-- ============================================
-- USER TRAINING PROGRESS
-- Tracks which pages each user has been trained on
-- ============================================

CREATE TABLE IF NOT EXISTS user_training_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  page_route TEXT NOT NULL,

  -- Progress tracking
  has_viewed_training BOOLEAN DEFAULT FALSE,
  training_completed_at TIMESTAMPTZ,
  comprehension_score INTEGER,              -- 0-100, from quiz or interaction analysis

  -- Engagement metrics
  times_asked_for_help INTEGER DEFAULT 0,
  last_help_request TIMESTAMPTZ,
  voice_commands_used INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, page_route)
);

CREATE INDEX IF NOT EXISTS idx_user_training_progress_user ON user_training_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_training_progress_page ON user_training_progress(page_route);

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE page_ai_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_training_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_training_progress ENABLE ROW LEVEL SECURITY;

-- page_ai_context: Everyone can read, only admin/owner can write
DROP POLICY IF EXISTS "Anyone can read page context" ON page_ai_context;
CREATE POLICY "Anyone can read page context" ON page_ai_context
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Only admin/owner can modify page context" ON page_ai_context;
CREATE POLICY "Only admin/owner can modify page context" ON page_ai_context
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- ai_training_transcripts: Only admin/owner can access
DROP POLICY IF EXISTS "Only admin/owner can access transcripts" ON ai_training_transcripts;
CREATE POLICY "Only admin/owner can access transcripts" ON ai_training_transcripts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner')
    )
  );

-- user_training_progress: Users can see their own, admin can see all
DROP POLICY IF EXISTS "Users can see own progress" ON user_training_progress;
CREATE POLICY "Users can see own progress" ON user_training_progress
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own progress" ON user_training_progress;
CREATE POLICY "Users can update own progress" ON user_training_progress
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admin can see all progress" ON user_training_progress;
CREATE POLICY "Admin can see all progress" ON user_training_progress
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'owner', 'manager')
    )
  );

-- ============================================
-- Grant permissions for authenticated users
-- ============================================

GRANT SELECT ON page_ai_context TO authenticated;
GRANT ALL ON page_ai_context TO authenticated;
GRANT ALL ON ai_training_transcripts TO authenticated;
GRANT ALL ON user_training_progress TO authenticated;
