/**
 * The framework-free domain seam (ADR-0005). Entity types, repository/service
 * ports, and no-op service adapters. ZERO `next/*` imports anywhere under
 * `src/domain/`.
 */

export * from './types';
export * from './ports';
export * as noopAdapters from './adapters/noop';
