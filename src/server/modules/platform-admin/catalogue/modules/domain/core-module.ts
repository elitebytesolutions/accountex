/**
 * Core-module rule (Phase 36): a core platform module is always enabled and can't be removed, because every tenant
 * relies on it (Accounting & GL in the template). The DB enforces the first half too (platformModuleCoreOnChk).
 */
export type CoreModuleState = { isCore: boolean; isEnabled: boolean };

/** Would this change leave a core module disabled? */
export const disablesCore = (current: CoreModuleState, next: Partial<CoreModuleState>) =>
  Boolean(next.isCore ?? current.isCore) && (next.isEnabled ?? current.isEnabled) === false;
