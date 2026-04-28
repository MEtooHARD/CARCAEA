export const extractor_name = process.env.EXTRACTOR;
export const extractor_port = process.env.EXTRACTOR_IN_PORT;
export const extractor_host_port = process.env.EXTRACTOR_HOST_PORT;

export const database_name = process.env.DATABASE;
export const database_port = process.env.DATABASE_IN_PORT;
export const database_host_port = process.env.DATABASE_HOST_PORT;

export const postgres_user = process.env.POSTGRES_USER;
export const postgres_password = process.env.POSTGRES_PASSWORD;
export const postgres_db_name = process.env.CARCAEA_DB;

if (!extractor_name || !extractor_port || !extractor_host_port) {
    console.error('Extractor configuration is missing. Please set EXTRACTOR, EXTRACTOR_IN_PORT, and EXTRACTOR_HOST_PORT in the environment variables.');
    console.log(`Current values - EXTRACTOR: ${extractor_name}, EXTRACTOR_IN_PORT: ${extractor_port}, EXTRACTOR_HOST_PORT: ${extractor_host_port}`);
    console.log('Shutdown server...');
    process.exit(1);
}

if (!database_name || !database_port || !database_host_port) {
    console.error('Database configuration is missing. Please set DATABASE, DATABASE_IN_PORT, and DATABASE_HOST_PORT in the environment variables.');
    console.log(`Current values - DATABASE: ${database_name}, DATABASE_IN_PORT: ${database_port}, DATABASE_HOST_PORT: ${database_host_port}`);
    console.log('Shutdown server...');
    process.exit(1);
}

if (!postgres_user || !postgres_password || !postgres_db_name) {
    console.error('Postgres configuration is missing. Please set POSTGRES_USER, POSTGRES_PASSWORD, and CARCAEA_DB in the environment variables.');
    console.log(`Current values - POSTGRES_USER: ${postgres_user}, POSTGRES_PASSWORD: ${postgres_password}, CARCAEA_DB: ${postgres_db_name}`);
    console.log('Shutdown server...');
    process.exit(1);
}