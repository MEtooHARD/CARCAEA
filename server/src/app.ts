import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import express from 'express';
import routes from './routes';
import { mid_logger } from './util/middleware';
import { swaggerSchemas } from './types/swagger-schemas';

const app = express();

app.use(express.json());

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server is running
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 */
// Health check - highest priority
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// API routes
app.use('/', mid_logger('==='), routes);

// Root path fallback
app.get('/', (req, res) => {
    res.send('You\'re at the wrong place, dumbass.');
});

// Error handler - last
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
});

const specs = swaggerJsdoc({
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'CARCAEA API',
            version: '1.0.0',
            description: 'HRV-based music recommendation backend',
        },
        servers: [
            {
                url: 'http://localhost:3001',
                description: 'Development server',
            },
            {
                url: 'http://3.107.5.231:3001',
                description: 'AWS EC2 server',
            },
        ],
        tags: [
            { name: 'Health',    description: 'Server status' },
            { name: 'Recommend', description: 'Music recommendation' },
            { name: 'Feedback',  description: 'HRV feedback recording' },
            { name: 'User',      description: 'User management' },
            { name: 'Songs',     description: 'Song queries' },
        ],
        components: {
            schemas: swaggerSchemas,
        },
    },
    apis: ['./src/app.ts', './src/routes/**/*.ts'],
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

export default app;
