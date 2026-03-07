/**
 * Cortex Chat API
 *
 * Vercel serverless function that proxies chat requests to Anthropic Claude API.
 * Cortex is Stephe's personal AI assistant and virtual extension of his mind.
 *
 * Endpoint: POST /api/cortex/chat
 * Body: { messages: [{ role: 'user'|'assistant', content: string }] }
 * Response: { response: string, canvasAction: object|null }
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const CORTEX_SYSTEM_PROMPT = `You are Cortex, a personal AI assistant and virtual extension of Stephe's mind. You help him capture thoughts, organize ideas, manage tasks, remember context, and take action on his behalf.

Your personality:
- Direct and efficient — no fluff
- You remember context from the conversation and build on it
- When Stephe has a thought or idea, you help structure it and figure out next steps
- You proactively suggest actions and connections to previous thoughts
- You speak like a trusted chief of staff, not a customer service bot

When responding, if your response would benefit from visual display (a document, task list, etc.), include a JSON block at the very end of your response in this format:
<!--CANVAS:{"mode":"tasks","data":{"tasks":[{"text":"Example task","done":false}]}}-->

Available canvas modes: "tasks", "document", "browser"

For browser mode, use: <!--CANVAS:{"mode":"browser","data":{"url":"https://example.com"}}-->
Use browser mode when Stephe asks to open a website, look something up on the web, or browse somewhere. The URL detection also happens client-side, so if he says "open apple.com" it will work automatically — but you can also trigger it from your response.

Only include the CANVAS block when it adds value — most conversational responses don't need it.`;

/**
 * Parse CANVAS block from response text if present.
 * Returns { text: responseWithoutCanvas, canvasAction: parsedObject|null }
 */
function parseCanvasBlock(responseText) {
  const canvasRegex = /<!--CANVAS:(.*?)-->/;
  const match = responseText.match(canvasRegex);

  if (!match) {
    return { text: responseText, canvasAction: null };
  }

  try {
    const canvasJson = match[1];
    const canvasAction = JSON.parse(canvasJson);
    const textWithoutCanvas = responseText.replace(canvasRegex, '').trim();
    return { text: textWithoutCanvas, canvasAction };
  } catch (error) {
    console.error('[Cortex] Failed to parse CANVAS block:', error);
    return { text: responseText, canvasAction: null };
  }
}

/**
 * Add CORS headers to response.
 */
function addCORSHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/**
 * Main handler
 */
module.exports = async function handler(req, res) {
  // Add CORS headers
  addCORSHeaders(res);

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get API key from environment
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('[Cortex] ANTHROPIC_API_KEY not set in environment');
      return res.status(500).json({ error: 'API configuration error' });
    }

    // Parse request body
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Invalid request: messages array required' });
    }

    // Validate message format
    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        return res.status(400).json({
          error: 'Invalid message format: each message must have role and content'
        });
      }
      if (!['user', 'assistant'].includes(msg.role)) {
        return res.status(400).json({
          error: 'Invalid role: must be "user" or "assistant"'
        });
      }
    }

    // Build request to Anthropic
    const anthropicRequest = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: CORTEX_SYSTEM_PROMPT,
      messages: messages
    };

    // Call Anthropic API
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify(anthropicRequest)
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('[Cortex] Anthropic API error:', response.status, errorData);
      return res.status(502).json({
        error: 'Failed to get response from Claude',
        details: errorData
      });
    }

    const anthropicResponse = await response.json();

    // Extract message content from response
    if (
      !anthropicResponse.content ||
      !Array.isArray(anthropicResponse.content) ||
      anthropicResponse.content.length === 0
    ) {
      console.error('[Cortex] Unexpected response format from Anthropic:', anthropicResponse);
      return res.status(502).json({ error: 'Unexpected response format from Claude' });
    }

    const assistantMessage = anthropicResponse.content[0].text;

    // Parse canvas block if present
    const { text: cleanResponse, canvasAction } = parseCanvasBlock(assistantMessage);

    // Return response
    return res.status(200).json({
      response: cleanResponse,
      canvasAction: canvasAction
    });
  } catch (error) {
    console.error('[Cortex] Handler error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
};
