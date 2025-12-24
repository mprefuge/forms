/**
 * FormConfigLoader.ts
 * 
 * Initializes the form registry with all available configurations.
 * This module should be imported early in application startup.
 */

import { FormRegistry, getGlobalRegistry } from './FormRegistry';
import { genericFormConfig } from './genericFormConfig';

/**
 * Initialize the form registry with all available form configurations
 * Should be called once at application startup
 */
export function initializeFormRegistry(): FormRegistry {
  const registry = getGlobalRegistry({
    builtInForms: {
      general: genericFormConfig,
      // Specific form configs should be provided by JavaScript files
      // This is only a fallback for when no config is sent
    },
  });

  // Validate generic fallback config on initialization
  registry.listForms().forEach(formId => {
    const config = registry.getFormConfig(formId);
    const errors = registry.validateConfig(config);
    if (errors.length > 0) {
      console.warn(`Form configuration warnings for '${formId}':`, errors);
      throw new Error(`Invalid form configuration: ${formId}\n${errors.join('\n')}`);
    }
  });

  console.log(`Form registry initialized with ${registry.listForms().length} forms: ${registry.listForms().join(', ')}`);
  return registry;
}

/**
 * Get the form configuration for a specific form ID
 */
export function getFormConfig(formId: string) {
  return getGlobalRegistry().getFormConfig(formId);
}

/**
 * Get the global registry instance (must be initialized first)
 */
export function getRegistry() {
  return getGlobalRegistry();
}

// Auto-initialize on first import (can be disabled if needed)
try {
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
    // Don't auto-init during tests, let them control initialization
    initializeFormRegistry();
  }
} catch (err) {
  // Only warn, don't throw - allows application to continue with deferred initialization
  console.warn('Form registry initialization deferred:', (err as any)?.message);
}
