import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import express from 'express';
import routes from './routes';
import { mid_logger } from './util/middleware';

// const pg_pwd = process.env.POSTGRES_PASSWORD;
// const pg_user = process.env.POSTGRES_USER;
// const arcaea_db = process.env.ARCAEA_DB;
// const extractor_url = process.env.EXTRACTOR_URL;


const app = express();

app.use(express.json());

app.get('/', (req, res) => {
    res.send('You\'re at the wrong place, dumbass.');
})

app.use('/', mid_logger('==='), routes);

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns server health status
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 */
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
});

const specs = swaggerJsdoc({
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'ARCAEA API',
            version: '1.0.0',
            description: 'Music search API based on emotional characteristics (valence & arousal)',
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
    },
    apis: ['./src/app.ts', './src/routes/**/*.ts'],
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

export default app;
