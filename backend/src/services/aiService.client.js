const axios = require('axios');
const config = require('../config/env');
const { ServiceUnavailableError } = require('../utils/ApiError');
const { aiJobLogger } = require('../config/logger');

const aiClient = axios.create({
  baseURL: config.aiService.baseUrl,
  timeout: config.aiService.timeoutMs,
  headers: {
    'x-api-key': config.aiService.apiKey,
  },
});

async function requestInference({ imageUrl, model, imageId }) {
  try {
    const response = await aiClient.post('/predict', {
      imageUrl,
      model,
      imageId,
    });
    return response.data;
  } catch (err) {
    aiJobLogger.error(
      { err: err.message, model, imageId },
      '[AI Service] Inference request failed'
    );
    if (err.response) {
      throw new ServiceUnavailableError(
        `AI service returned an error: ${err.response.data?.detail || err.response.statusText}`
      );
    }
    throw new ServiceUnavailableError('AI service is currently unreachable. Please try again shortly.');
  }
}

async function checkHealth() {
  try {
    const response = await aiClient.get('/health', { timeout: 5000 });
    return response.data;
  } catch (err) {
    throw new ServiceUnavailableError('AI service health check failed');
  }
}

module.exports = { requestInference, checkHealth };