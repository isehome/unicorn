/**
 * Cortex Service
 *
 * Frontend service for Cortex, Stephe's personal AI assistant.
 * Handles communication with the Cortex chat API and manages conversation state.
 *
 * Usage:
 *   import { cortexService } from '../services/cortexService';
 *   const result = await cortexService.sendMessage(messages);
 */

class CortexService {
  /**
   * Send a message to Cortex and get a response
   * @param {Array} messages - Array of { role: 'user'|'assistant', content: string }
   * @returns {Promise<{ response: string, canvasAction: object|null }>}
   */
  async sendMessage(messages) {
    try {
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        throw new Error('Messages array is required and cannot be empty');
      }

      const response = await fetch('/api/cortex/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messages })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          errorData.error ||
          errorData.details ||
          `HTTP ${response.status}`;
        throw new Error(`Failed to send message: ${errorMessage}`);
      }

      const result = await response.json();

      return {
        response: result.response || '',
        canvasAction: result.canvasAction || null
      };
    } catch (error) {
      console.error('[CortexService] Error sending message:', error);

      // Return fallback error message
      return {
        response: `Sorry, I encountered an error: ${error.message || 'Unknown error'}. Please try again.`,
        canvasAction: null
      };
    }
  }

  /**
   * Get conversation history from Supabase
   * @returns {Promise<Array>} - Array of conversation messages
   *
   * NOTE: This is a placeholder for future implementation.
   * Will fetch conversation history from the cortex_conversations table
   * in Supabase once the database schema is set up.
   */
  async getConversationHistory() {
    try {
      // Placeholder implementation - return empty array for now
      // Future implementation will fetch from Supabase:
      //   const { data, error } = await supabase
      //     .from('cortex_conversations')
      //     .select('*')
      //     .order('created_at', { ascending: true });
      //
      //   if (error) throw error;
      //   return data || [];

      return [];
    } catch (error) {
      console.error('[CortexService] Error fetching conversation history:', error);
      return [];
    }
  }

  /**
   * Save a new message to conversation history
   * @param {string} role - 'user' or 'assistant'
   * @param {string} content - Message content
   * @returns {Promise<void>}
   *
   * NOTE: This is a placeholder for future implementation.
   * Will save to the cortex_conversations table in Supabase.
   */
  async saveMessage(role, content) {
    try {
      // Placeholder implementation - no-op for now
      // Future implementation will save to Supabase:
      //   const { error } = await supabase
      //     .from('cortex_conversations')
      //     .insert({
      //       role,
      //       content,
      //       created_at: new Date().toISOString()
      //     });
      //
      //   if (error) throw error;

      console.log('[CortexService] Message save placeholder:', { role, content });
    } catch (error) {
      console.error('[CortexService] Error saving message:', error);
      // Don't throw - allow conversation to continue even if save fails
    }
  }

  /**
   * Clear conversation history
   * @returns {Promise<void>}
   *
   * NOTE: This is a placeholder for future implementation.
   * Will delete from the cortex_conversations table in Supabase.
   */
  async clearHistory() {
    try {
      // Placeholder implementation - no-op for now
      // Future implementation will delete from Supabase:
      //   const { error } = await supabase
      //     .from('cortex_conversations')
      //     .delete()
      //     .neq('id', null);  // Delete all rows
      //
      //   if (error) throw error;

      console.log('[CortexService] History clear placeholder');
    } catch (error) {
      console.error('[CortexService] Error clearing history:', error);
      throw error;
    }
  }
}

/**
 * Export as singleton
 */
export const cortexService = new CortexService();
