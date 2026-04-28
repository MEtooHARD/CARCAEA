import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { database_name, database_port, postgres_db_name, postgres_password, postgres_user } from "../config";
import type { DB } from "./database_schema";

const dialect = new PostgresDialect({
    pool: new Pool({
        host: database_name,
        database: postgres_db_name,
        user: postgres_user,
        port: Number(database_port) || 5432,
        password: postgres_password
    })
})

export const db = new Kysely<DB>({
    dialect,
})