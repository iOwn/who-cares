/**
 * The persistence seam: schema, migration runner, and the repository adapters
 * that satisfy the `src/domain/ports` interfaces (ADR-0005, ADR-0006).
 *
 * Nothing here imports `next/*`. The domain depends on the ports; this module
 * depends on the domain; the app wires the two together.
 */

export { createDatabase, type Database, type DbExecutor, schema } from "./client";
export { applyMigrations, MIGRATIONS_FOLDER } from "./migrate";
export * from "./repositories";
