import { Kysely, PostgresDialect } from "kysely";
import type { DB } from "./database_schema";
import { Pool } from "pg";

const dialect = new PostgresDialect({
    pool: new Pool({
        host: process.env.DATABASE,
        database: process.env.ARCAEA_DB,
        user: process.env.POSTGRES_USER,
        port: Number(process.env.DB_PORT) || 5432,
        password: process.env.POSTGRES_PASSWORD
    })
})

export const db = new Kysely<DB>({
    dialect,
})