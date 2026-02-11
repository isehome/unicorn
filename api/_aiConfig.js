/**
 * AI Configuration for API Endpoints
 *
 * Backend wrapper for shared/aiConfig.js that provides
 * convenient initialization for Vercel serverless functions.
 *
 * Usage:
 *   const { getModelForService, getGenAI } = require('./_aiConfig');
 *   const model = getModelForService('BUG_ANALYZER');
 *   const result = await model.generateContent(prompt);
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const aiConfig = require('../shared/aiConfig');

// Singleton Gemini client
let _genAI = null;

/**
 * Get initialized Gemini client (singleton)
 * @returns {GoogleGenerativeAI}
 * @throws {Error} If API key not configured
 */
function getGenAI() {
  if (!_genAI) {
    const apiKey = aiConfig.requireGeminiApiKey();
    _genAI = new GoogleGenerativeAI(apiKey);
  }
  return _genAI;
}

/**
 * Get a configured model for a specific service
 * @param {string} serviceName - Key from AI_SERVICES (e.g., 'BUG_ANALYZER')
 * @param {Object} overrides - Optional overrides for generation config
 * @returns {GenerativeModel} Configured Gemini model
 */
function getModelForService(serviceName, overrides = {}) {
  const serviceConfig = aiConfig.getServiceConfig(serviceName);
  const genAI = getGenAI();

  const generationConfig = {
    temperature: serviceConfig.temperature,
    maxOutputTokens: serviceConfig.maxTokens,
    ...overrides,
  };

  return genAI.getGenerativeModel({
    model: serviceConfig.modelId,
    generationConfig,
  });
}

/**
 * Get raw model by ID (for special cases)
 * @param {string} modelId - Model ID (e.g., 'gemini-2.5-flash')
 * @param {Object} generationConfig - Optional generation config
 * @returns {GenerativeModel}
 */
function getModelById(modelId, generationConfig = {}) {
  const genAI = getGenAI();
  return genAI.getGenerativeModel({
    model: modelId,
    generationConfig,
  });
}

/**
 * Log model usage for tracking/debugging
 * @param {string} serviceName - Service name
 * @param {Object} usage - Token usage from response
 */
function logModelUsage(serviceName, usage) {
  const config = aiConfig.getServiceConfig(serviceName);
  console.log(
    `[AI:${serviceName}] Model: ${config.modelId} | ` +
    `Tokens: ${usage.promptTokenCount || 0} prompt + ` +
    `${usage.candidatesTokenCount || 0} output = ` +
    `${usage.totalTokenCount || 0} total`
  );
}

// Re-export everything from aiConfig
module.exports = {
  ...aiConfig,
  getGenAI,
  getModelForService,
  getModelById,
  logModelUsage,
};
