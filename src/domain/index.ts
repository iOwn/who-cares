/**
 * The framework-free domain seam (ADR-0005). Entity types, repository/service
 * ports, and no-op service adapters. ZERO `next/*` imports anywhere under
 * `src/domain/`.
 */

export * as noopAdapters from "./adapters/noop";
export * from "./ports";
export * from "./services/bootstrapHousehold";
export * from "./services/childcareDay";
export * from "./services/dayState";
export * from "./types";
