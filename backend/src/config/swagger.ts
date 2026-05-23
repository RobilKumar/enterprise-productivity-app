import swaggerJsdoc from 'swagger-jsdoc';

export const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title:       'Enterprise Productivity API',
      version:     '1.0.0',
      description: 'Complete REST API for the Enterprise Team Productivity & Work Monitoring System',
      contact:     { name: 'API Support', email: 'support@company.com' },
    },
    servers: [
      { url: 'http://localhost:5000/api/v1',     description: 'Development' },
      { url: 'https://api.company.com/api/v1',   description: 'Production'  },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
});
