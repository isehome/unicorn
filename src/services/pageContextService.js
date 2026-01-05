/**
 * Page Context Service
 * Manages AI training context for pages
 */

import { supabase } from '../lib/supabase';

export const pageContextService = {

  /**
   * Get context for a specific page route
   */
  async getPageContext(pageRoute) {
    try {
      const { data, error } = await supabase
        .from('page_ai_context')
        .select('*')
        .eq('page_route', pageRoute)
        .single();

      // PGRST116 = no rows found, 42P01 = table doesn't exist
      if (error && error.code !== 'PGRST116') {
        // Check if table doesn't exist
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.warn('[PageContext] Table page_ai_context does not exist. Run the migration first.');
          return null;
        }
        console.error('[PageContext] Error fetching context:', error);
      }

      return data || null;
    } catch (error) {
      console.error('[PageContext] Error fetching context:', error);
      return null;
    }
  },

  /**
   * Get all page contexts (for admin overview)
   */
  async getAllContexts() {
    try {
      const { data, error } = await supabase
        .from('page_ai_context')
        .select('*')
        .order('page_route');

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.warn('[PageContext] Table page_ai_context does not exist. Run the migration first.');
          return [];
        }
        console.error('[PageContext] Error fetching all contexts:', error);
        return [];
      }
      return data || [];
    } catch (error) {
      console.error('[PageContext] Error fetching all contexts:', error);
      return [];
    }
  },

  /**
   * Get training status summary
   */
  async getTrainingStatus() {
    try {
      const { data, error } = await supabase
        .from('page_ai_context')
        .select('page_route, component_name, page_title, is_trained, is_published, last_trained_at, training_version');

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.warn('[PageContext] Table page_ai_context does not exist. Run the migration first.');
          return { total: 0, trained: 0, published: 0, untrained: 0, pages: [] };
        }
        console.error('[PageContext] Error fetching training status:', error);
        return { total: 0, trained: 0, published: 0, untrained: 0, pages: [] };
      }

      const total = data?.length || 0;
      const trained = data?.filter(p => p.is_trained).length || 0;
      const published = data?.filter(p => p.is_published).length || 0;

      return {
        total,
        trained,
        published,
        untrained: total - trained,
        pages: data || []
      };
    } catch (error) {
      console.error('[PageContext] Error fetching training status:', error);
      return { total: 0, trained: 0, published: 0, untrained: 0, pages: [] };
    }
  },

  /**
   * Initialize a new page context (before training)
   */
  async initializePageContext(pageRoute, componentName, staticContext = {}) {
    console.log('[PageContext] initializePageContext called:', { pageRoute, componentName, staticContext });
    try {
      // First try to get existing context
      const existing = await this.getPageContext(pageRoute);
      if (existing) {
        console.log('[PageContext] Found existing context:', existing.id);
        return existing;
      }

      // Create new context
      const insertData = {
        page_route: pageRoute,
        component_name: componentName,
        page_title: staticContext.pageTitle || componentName,
        target_users: staticContext.targetUsers || ['technician', 'project-manager'],
        is_trained: false,
        is_published: false,
        training_version: 0,
      };
      console.log('[PageContext] Inserting new context:', insertData);

      const { data, error } = await supabase
        .from('page_ai_context')
        .insert(insertData)
        .select()
        .single();

      console.log('[PageContext] initializePageContext result:', { data, error });

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.warn('[PageContext] Table page_ai_context does not exist. Run the migration first.');
          return null;
        }
        // Handle unique constraint violation - row exists, so fetch it
        if (error.code === '23505') {
          console.log('[PageContext] Row already exists, fetching...');
          return await this.getPageContext(pageRoute);
        }
        console.error('[PageContext] Error initializing context:', error);
        return null;
      }
      return data;
    } catch (error) {
      console.error('[PageContext] Error initializing context:', error);
      return null;
    }
  },

  /**
   * Save training results (after a training session)
   */
  async saveTrainingResults(pageRoute, trainingData, userId, append = false) {
    console.log('[PageContext] saveTrainingResults called:', { pageRoute, userId, append });
    console.log('[PageContext] Training data to save:', trainingData);

    try {
      // Get existing context (for merge logic and to check if row exists)
      let existingContext = await this.getPageContext(pageRoute);
      console.log('[PageContext] Existing context:', existingContext?.id || 'none');

      // Merge or replace data
      const mergedData = append && existingContext ? {
        functional_description: trainingData.functional_description || existingContext.functional_description,
        business_context: trainingData.business_context
          ? `${existingContext.business_context || ''}\n\n${trainingData.business_context}`.trim()
          : existingContext.business_context,
        workflow_position: trainingData.workflow_position || existingContext.workflow_position,
        real_world_use_case: trainingData.real_world_use_case
          ? `${existingContext.real_world_use_case || ''}\n\n${trainingData.real_world_use_case}`.trim()
          : existingContext.real_world_use_case,
        common_mistakes: [...new Set([
          ...(existingContext.common_mistakes || []),
          ...(trainingData.common_mistakes || [])
        ])],
        best_practices: [...new Set([
          ...(existingContext.best_practices || []),
          ...(trainingData.best_practices || [])
        ])],
        pro_tips: [...new Set([
          ...(existingContext.pro_tips || []),
          ...(trainingData.pro_tips || [])
        ])],
        faq: [
          ...(existingContext.faq || []),
          ...(trainingData.faq || [])
        ],
        training_script: trainingData.training_script || existingContext.training_script,
      } : trainingData;

      const savePayload = {
        page_route: pageRoute,
        component_name: existingContext?.component_name || pageRoute.split('/').pop() || 'UnknownPage',
        ...mergedData,
        is_trained: true,
        last_trained_at: new Date().toISOString(),
        last_trained_by: userId,
        training_version: (existingContext?.training_version || 0) + 1,
      };
      console.log('[PageContext] Save payload:', savePayload);

      // Use upsert to handle both insert and update
      const { data, error } = await supabase
        .from('page_ai_context')
        .upsert(savePayload, {
          onConflict: 'page_route'
        })
        .select()
        .single();

      console.log('[PageContext] Supabase response:', { data, error });

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.warn('[PageContext] Table does not exist. Run the migration first.');
          return null;
        }
        console.error('[PageContext] Error saving training results:', error);
        return null;
      }
      console.log('[PageContext] Training saved successfully:', data);
      return data;
    } catch (error) {
      console.error('[PageContext] Error saving training results:', error);
      return null;
    }
  },

  /**
   * Save training transcript (final save)
   */
  async saveTrainingTranscript(pageRoute, transcript, sessionType, userId, userName) {
    try {
      // Get the page context ID
      const context = await this.getPageContext(pageRoute);

      const { data, error } = await supabase
        .from('ai_training_transcripts')
        .insert({
          page_context_id: context?.id,
          page_route: pageRoute,
          session_type: sessionType, // 'initial', 'append', 'retrain'
          trained_by: userId,
          trainer_name: userName,
          transcript: transcript,
          duration_seconds: transcript.reduce((sum, t) => sum + (t.duration || 0), 0),
          is_complete: true,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.warn('[PageContext] Table ai_training_transcripts does not exist. Run the migration first.');
          return null;
        }
        console.error('[PageContext] Error saving transcript:', error);
        return null;
      }
      return data;
    } catch (error) {
      console.error('[PageContext] Error saving transcript:', error);
      return null;
    }
  },

  /**
   * Auto-save transcript during live conversation (upsert - create or update)
   * This saves incrementally so we don't lose data if the final save fails
   */
  async autoSaveTranscript(sessionId, pageRoute, transcript, sessionType, userId, userName) {
    console.log('[PageContext] autoSaveTranscript:', { sessionId, pageRoute, transcriptLength: transcript.length, userId });
    try {
      // Note: Using insert instead of upsert with custom ID since Supabase
      // generates UUIDs server-side. We'll use page_route + session tracking differently.
      const insertData = {
        page_route: pageRoute,
        session_type: sessionType,
        trained_by: userId,
        trainer_name: userName,
        transcript: transcript,
        is_complete: false,
      };

      // First try to find existing transcript for this session
      const { data: existing } = await supabase
        .from('ai_training_transcripts')
        .select('id')
        .eq('page_route', pageRoute)
        .eq('is_complete', false)
        .eq('trained_by', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      let result;
      if (existing) {
        // Update existing incomplete transcript
        console.log('[PageContext] Updating existing transcript:', existing.id);
        const { data, error } = await supabase
          .from('ai_training_transcripts')
          .update({
            transcript: transcript,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) {
          console.error('[PageContext] Auto-save update error:', error.code, error.message, error.details);
          return null;
        }
        result = data;
      } else {
        // Insert new transcript
        console.log('[PageContext] Inserting new transcript for session');
        const { data, error } = await supabase
          .from('ai_training_transcripts')
          .insert(insertData)
          .select()
          .single();

        if (error) {
          console.error('[PageContext] Auto-save insert error:', error.code, error.message, error.details);
          // Check for RLS error
          if (error.code === '42501' || error.message?.includes('policy')) {
            console.error('[PageContext] RLS POLICY ERROR - User may not have permission. userId:', userId);
          }
          return null;
        }
        result = data;
      }

      console.log('[PageContext] Auto-saved transcript, entries:', transcript.length, 'id:', result?.id);
      return result;
    } catch (error) {
      console.error('[PageContext] Auto-save exception:', error);
      return null;
    }
  },

  /**
   * Mark a transcript as complete (called at end of session)
   * Now finds by page_route + is_complete=false + user instead of session ID
   */
  async markTranscriptComplete(pageRoute, userId, extractedData = null) {
    console.log('[PageContext] markTranscriptComplete:', { pageRoute, userId });
    try {
      const updateData = {
        is_complete: true,
        completed_at: new Date().toISOString(),
      };

      // Optionally store the extracted/processed data
      if (extractedData) {
        updateData.extracted_data = extractedData;
      }

      // Find the most recent incomplete transcript for this page/user
      const { data: existing } = await supabase
        .from('ai_training_transcripts')
        .select('id')
        .eq('page_route', pageRoute)
        .eq('is_complete', false)
        .eq('trained_by', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!existing) {
        console.warn('[PageContext] No incomplete transcript found to mark complete');
        return null;
      }

      const { data, error } = await supabase
        .from('ai_training_transcripts')
        .update(updateData)
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error('[PageContext] Error marking transcript complete:', error);
        return null;
      }
      console.log('[PageContext] Transcript marked complete:', existing.id);
      return data;
    } catch (error) {
      console.error('[PageContext] Error marking transcript complete:', error);
      return null;
    }
  },

  /**
   * Publish training (make it live)
   */
  async publishTraining(pageRoute) {
    try {
      const { data, error } = await supabase
        .from('page_ai_context')
        .update({ is_published: true })
        .eq('page_route', pageRoute)
        .select()
        .single();

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.warn('[PageContext] Table does not exist. Run the migration first.');
          return null;
        }
        console.error('[PageContext] Error publishing training:', error);
        return null;
      }
      return data;
    } catch (error) {
      console.error('[PageContext] Error publishing training:', error);
      return null;
    }
  },

  /**
   * Unpublish training (take offline for editing)
   */
  async unpublishTraining(pageRoute) {
    try {
      const { data, error } = await supabase
        .from('page_ai_context')
        .update({ is_published: false })
        .eq('page_route', pageRoute)
        .select()
        .single();

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.warn('[PageContext] Table does not exist. Run the migration first.');
          return null;
        }
        console.error('[PageContext] Error unpublishing training:', error);
        return null;
      }
      return data;
    } catch (error) {
      console.error('[PageContext] Error unpublishing training:', error);
      return null;
    }
  },

  /**
   * Get training transcripts for a page
   */
  async getTrainingTranscripts(pageRoute) {
    try {
      const { data, error } = await supabase
        .from('ai_training_transcripts')
        .select('*')
        .eq('page_route', pageRoute)
        .order('created_at', { ascending: false });

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.warn('[PageContext] Table does not exist. Run the migration first.');
          return [];
        }
        console.error('[PageContext] Error fetching transcripts:', error);
        return [];
      }
      return data || [];
    } catch (error) {
      console.error('[PageContext] Error fetching transcripts:', error);
      return [];
    }
  },

  /**
   * Build AI prompt from page context
   * This generates the prompt that gets sent to the AI when helping on this page
   */
  buildPagePrompt(context) {
    if (!context || !context.is_trained) {
      return null;
    }

    let prompt = `## Page: ${context.page_title || context.component_name}\n\n`;

    if (context.functional_description) {
      prompt += `### What This Page Does\n${context.functional_description}\n\n`;
    }

    if (context.business_context) {
      prompt += `### Business Context\n${context.business_context}\n\n`;
    }

    if (context.workflow_position) {
      prompt += `### Workflow Position\n${context.workflow_position}\n\n`;
    }

    if (context.real_world_use_case) {
      prompt += `### Real-World Example\n${context.real_world_use_case}\n\n`;
    }

    if (context.common_mistakes?.length > 0) {
      prompt += `### Common Mistakes to Avoid\n`;
      context.common_mistakes.forEach(m => {
        prompt += `- ${m}\n`;
      });
      prompt += '\n';
    }

    if (context.best_practices?.length > 0) {
      prompt += `### Best Practices\n`;
      context.best_practices.forEach(p => {
        prompt += `- ${p}\n`;
      });
      prompt += '\n';
    }

    if (context.faq?.length > 0) {
      prompt += `### Frequently Asked Questions\n`;
      context.faq.forEach(qa => {
        prompt += `Q: ${qa.question}\nA: ${qa.answer}\n\n`;
      });
    }

    return prompt;
  },

  /**
   * Build teaching script for new users
   */
  buildTeachingScript(context) {
    if (!context?.training_script) {
      return null;
    }
    return context.training_script;
  },

  /**
   * Search across all page contexts (for AI queries)
   */
  async searchContexts(query) {
    try {
      // For now, do a simple text search
      // In production, this should use Azure AI Search or similar
      const { data, error } = await supabase
        .from('page_ai_context')
        .select('*')
        .or(`functional_description.ilike.%${query}%,business_context.ilike.%${query}%,real_world_use_case.ilike.%${query}%`)
        .eq('is_published', true);

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.warn('[PageContext] Table does not exist. Run the migration first.');
          return [];
        }
        console.error('[PageContext] Error searching contexts:', error);
        return [];
      }
      return data || [];
    } catch (error) {
      console.error('[PageContext] Error searching contexts:', error);
      return [];
    }
  },

  /**
   * Initialize all pages from registry
   * Call this to seed the database with all known pages
   */
  async initializeFromRegistry(pageRegistry) {
    try {
      const entries = Object.entries(pageRegistry);
      const results = [];

      for (const [route, info] of entries) {
        const result = await this.initializePageContext(route, info.componentName, {
          pageTitle: info.pageTitle,
          targetUsers: info.targetUsers,
        });
        results.push({ route, success: result !== null, data: result });
      }

      return results;
    } catch (error) {
      console.error('[PageContext] Error initializing from registry:', error);
      return [];
    }
  },

  /**
   * Update user training progress
   */
  async updateUserProgress(userId, pageRoute, updates) {
    try {
      const { data, error } = await supabase
        .from('user_training_progress')
        .upsert({
          user_id: userId,
          page_route: pageRoute,
          ...updates,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,page_route'
        })
        .select()
        .single();

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.warn('[PageContext] Table does not exist. Run the migration first.');
          return null;
        }
        console.error('[PageContext] Error updating user progress:', error);
        return null;
      }
      return data;
    } catch (error) {
      console.error('[PageContext] Error updating user progress:', error);
      return null;
    }
  },

  /**
   * Get user's training progress
   */
  async getUserProgress(userId) {
    try {
      const { data, error } = await supabase
        .from('user_training_progress')
        .select('*')
        .eq('user_id', userId);

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          console.warn('[PageContext] Table does not exist. Run the migration first.');
          return [];
        }
        console.error('[PageContext] Error fetching user progress:', error);
        return [];
      }
      return data || [];
    } catch (error) {
      console.error('[PageContext] Error fetching user progress:', error);
      return [];
    }
  }
};

export default pageContextService;
