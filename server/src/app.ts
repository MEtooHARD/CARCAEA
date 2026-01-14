import express from 'express';
import routes from './routes';

const pg_pwd = process.env.POSTGRES_PASSWORD;
const pg_user = process.env.POSTGRES_USER;
const arcaea_db = process.env.ARCAEA_DB;
const extractor_url = process.env.EXTRACTOR_URL;

console.log(
    pg_pwd,
    pg_user,
    arcaea_db,
    extractor_url
)

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
    res.send('You\'re at the wrong place, dumbass.');
})

app.use('/', routes);

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
});

export default app;
