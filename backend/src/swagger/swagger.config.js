const swaggerJsdoc = require('swagger-jsdoc');
const config = require('../config/env');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'CloudVision AI API',
      version: '1.0.0',
      description:
        'AI-powered cloud removal & reconstruction platform for LISS-IV satellite imagery. ' +
        'This spec documents the Express REST API; the FastAPI inference service has its own ' +
        'interactive docs at its /docs endpoint.',
    },
    servers: [
      { url: `http://localhost:${config.port}${config.apiPrefix}`, description: 'Local development' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Access token obtained from POST /auth/login, sent as "Authorization: Bearer <token>"',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;