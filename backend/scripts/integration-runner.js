const axios = require('axios');

async function run() {
  const mode = process.env.RUN_BACKEND === 'true' ? 'backend' : 'ai';

  const testImage = process.env.INTEGRATION_IMAGE_URL || 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png';

  if (mode === 'ai') {
    const aiBase = process.env.AI_SERVICE_BASE_URL || 'http://localhost:8000';
    const apiKey = process.env.AI_SERVICE_API_KEY || 'replace_with_shared_secret_between_express_and_fastapi';

    console.log('[integration] Using AI service base:', aiBase);

    // 1) Health check
    try {
      const h = await axios.get(`${aiBase}/health`, { timeout: 5000 });
      console.log('[integration] /health response:', h.data);
    } catch (err) {
      console.error('[integration] FAILED: AI service /health is unreachable', err.message);
      process.exit(2);
    }

    // 2) Predict contract check
    const payload = {
      imageUrl: testImage,
      model: 'LaMa',
      imageId: 'integration-test-1',
    };

    try {
      const resp = await axios.post(`${aiBase}/predict`, payload, {
        headers: { 'X-API-KEY': apiKey },
        timeout: 30000,
      });

      const body = resp.data;
      if (!body.processedImageBase64 || !body.confidenceMapBase64 || !body.metrics) {
        console.error('[integration] FAILED: Response missing required fields');
        console.error('response:', Object.keys(body));
        process.exit(3);
      }

      const { metrics } = body;
      if (typeof metrics.processingTimeMs !== 'number' || typeof metrics.confidenceScore !== 'number') {
        console.error('[integration] FAILED: metrics types are incorrect', metrics);
        process.exit(4);
      }

      if (metrics.confidenceScore < 0 || metrics.confidenceScore > 1) {
        console.error('[integration] FAILED: confidenceScore out of range', metrics.confidenceScore);
        process.exit(5);
      }

      console.log('[integration] Predict contract OK — processingTimeMs:', metrics.processingTimeMs, 'confidenceScore:', metrics.confidenceScore);
      process.exit(0);
    } catch (err) {
      if (err.response) {
        console.error('[integration] AI service returned error:', err.response.status, err.response.data);
        process.exit(6);
      }
      console.error('[integration] Predict request failed:', err.message);
      process.exit(7);
    }
  }

  // backend mode: trigger backend internal endpoint and poll MongoDB for experiment status
  const backendBase = process.env.BACKEND_BASE_URL || 'http://localhost:5000';
  const apiPrefix = process.env.API_PREFIX || '/api/v1';
  const triggerUrl = `${backendBase}${apiPrefix}/internal/integration/trigger`;

  console.log('[integration] Triggering backend integration endpoint:', triggerUrl);

  try {
    const resp = await axios.post(triggerUrl, { imageUrl: testImage }, { timeout: 10000 });
    if (resp.status !== 202) {
      console.error('[integration] Backend trigger failed:', resp.status, resp.data);
      process.exit(11);
    }

    const { experimentId } = resp.data.data || {};
    if (!experimentId) {
      console.error('[integration] Backend did not return experimentId');
      process.exit(12);
    }

    console.log('[integration] Experiment queued:', experimentId, '— polling DB for completion');

    // connect to MongoDB and poll experiments collection
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('[integration] MONGO_URI not set; cannot poll experiment status');
      process.exit(13);
    }

    const { MongoClient, ObjectId } = require('mongodb');
    const client = new MongoClient(mongoUri, { useUnifiedTopology: true });
    await client.connect();
    const dbName = (process.env.MONGO_DB_NAME) || client.db().databaseName;
    const db = client.db(dbName);
    const experiments = db.collection('experiments');

    const maxMs = parseInt(process.env.INTEGRATION_TIMEOUT_MS || '120000', 10);
    const start = Date.now();

    while (Date.now() - start < maxMs) {
      const doc = await experiments.findOne({ _id: new ObjectId(experimentId) });
      if (!doc) {
        console.log('[integration] Experiment not found yet; waiting...');
      } else {
        console.log('[integration] Experiment status:', doc.status);
        if (doc.status === 'completed') {
          console.log('[integration] Job completed successfully');
          await client.close();
          process.exit(0);
        }
        if (doc.status === 'failed') {
          console.error('[integration] Job failed:', doc.errorMessage || 'no errorMessage');
          await client.close();
          process.exit(14);
        }
      }
      await new Promise((r) => setTimeout(r, 3000));
    }

    console.error('[integration] Timed out waiting for experiment to complete');
    await client.close();
    process.exit(15);
  } catch (err) {
    console.error('[integration] Backend integration failed:', err.message || err);
    process.exit(16);
  }
}

if (require.main === module) {
  run();
}

module.exports = { run };
