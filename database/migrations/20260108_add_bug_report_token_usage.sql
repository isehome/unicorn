-- Add token usage tracking columns to bug_reports table
-- These store Gemini API token usage for cost tracking

ALTER TABLE bug_reports
ADD COLUMN IF NOT EXISTS ai_confidence DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS ai_token_usage JSONB;

-- Add comment explaining the token_usage structure
COMMENT ON COLUMN bug_reports.ai_token_usage IS 'Token usage from Gemini API: { prompt_tokens, completion_tokens, total_tokens }';
COMMENT ON COLUMN bug_reports.ai_confidence IS 'AI confidence score 0-1 from Gemini analysis';
