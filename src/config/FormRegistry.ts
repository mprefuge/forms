/**
 * FormRegistry.ts
 * 
 * Manages loading and caching of form configurations.
 * Supports loading from multiple sources:
 * - File system (local configs)
 * - Environment variables
 * - Remote endpoints
 */

import { FormConfig } from './formConfigTypes';

export interface FormRegistryOptions {
  configDir?: string; // Directory to load form configs from
  builtInForms?: { [formId: string]: FormConfig }; // Pre-loaded configs
  remoteUrl?: string; // Optional remote endpoint for configs
}

export class FormRegistry {
  private configs: Map<string, FormConfig> = new Map();
  private options: FormRegistryOptions;

  constructor(options: FormRegistryOptions = {}) {
    this.options = options;
    // Pre-register built-in forms
    if (options.builtInForms) {
      Object.entries(options.builtInForms).forEach(([formId, config]) => {
        this.configs.set(formId, config);
      });
    }
  }

  /**
   * Register a form configuration
   */
  registerForm(formId: string, config: FormConfig): void {
    if (config.id !== formId) {
      throw new Error(`Form ID mismatch: config.id='${config.id}' but registering as '${formId}'`);
    }
    this.configs.set(formId, config);
  }

  /**
   * Get a form configuration by ID
   */
  getFormConfig(formId: string): FormConfig {
    const config = this.configs.get(formId);
    if (!config) {
      throw new Error(`Form configuration not found: ${formId}`);
    }
    return config;
  }

  /**
   * Check if a form configuration exists
   */
  hasForm(formId: string): boolean {
    return this.configs.has(formId);
  }

  /**
   * List all registered form IDs
   */
  listForms(): string[] {
    return Array.from(this.configs.keys());
  }

  /**
   * Validate a form configuration
   */
  validateConfig(config: FormConfig): string[] {
    const errors: string[] = [];

    if (!config.id) errors.push('Form config missing required field: id');
    if (!config.name) errors.push('Form config missing required field: name');
    if (!config.phases) errors.push('Form config missing required field: phases');
    if (!config.fieldMetadata) errors.push('Form config missing required field: fieldMetadata');
    if (!config.salesforceMapping) errors.push('Form config missing required field: salesforceMapping');
    if (!config.salesforce) errors.push('Form config missing required field: salesforce');

    // Validate phase structure
    if (config.phases) {
      const phaseIds = Object.keys(config.phases);
      if (!config.defaultPhase) errors.push('Form config missing required field: defaultPhase');
      else if (!phaseIds.includes(config.defaultPhase)) {
        errors.push(`defaultPhase '${config.defaultPhase}' not found in phases`);
      }

      phaseIds.forEach(phaseId => {
        const phase = config.phases[phaseId];
        if (!phase.name) errors.push(`Phase '${phaseId}' missing required field: name`);
        if (!Array.isArray(phase.steps)) errors.push(`Phase '${phaseId}' missing required field: steps`);

        // Validate steps reference valid fields
        phase.steps.forEach((step, idx) => {
          if (!step.title) errors.push(`Phase '${phaseId}' step ${idx} missing title`);
          if (!Array.isArray(step.fields)) errors.push(`Phase '${phaseId}' step '${step.title}' missing fields array`);
          
          step.fields.forEach(fieldKey => {
            if (!config.fieldMetadata[fieldKey]) {
              errors.push(`Phase '${phaseId}' step '${step.title}' references undefined field: ${fieldKey}`);
            }
          });
        });
      });
    }

    // Validate field metadata references Salesforce mappings
    Object.keys(config.fieldMetadata).forEach(fieldKey => {
      if (!config.salesforceMapping[fieldKey]) {
        errors.push(`Field '${fieldKey}' is in fieldMetadata but not in salesforceMapping`);
      }
    });

    return errors;
  }
}

// Global registry instance
let globalRegistry: FormRegistry | null = null;

export function getGlobalRegistry(options?: FormRegistryOptions): FormRegistry {
  if (!globalRegistry) {
    globalRegistry = new FormRegistry(options);
  }
  return globalRegistry;
}

export function setGlobalRegistry(registry: FormRegistry): void {
  globalRegistry = registry;
}
