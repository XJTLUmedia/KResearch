import { apiKeyService } from './apiKeyService';
import { AppSettings } from '../types';

export const DEFAULT_SETTINGS: AppSettings = {
  modelOverrides: {
    planner: null,
    searcher: null,
    outline: null,
    synthesizer: null,
    clarification: null,
    visualizer: null,
  },
  researchParams: {
    minCycles: 7,
    maxCycles: 20,
    maxDebateRounds: 20,
  },
};

class SettingsService {
  private settings: AppSettings;
  private availableModels: string[] = [];

  constructor() {
    this.settings = this.load();
  }

  private load(): AppSettings {
    try {
      const storedSettings = localStorage.getItem('k-research-settings');
      if (storedSettings) {
        const parsed = JSON.parse(storedSettings);
        return {
          modelOverrides: { ...DEFAULT_SETTINGS.modelOverrides, ...parsed.modelOverrides },
          researchParams: { ...DEFAULT_SETTINGS.researchParams, ...parsed.researchParams },
        };
      }
    } catch (e) {
      console.error("Failed to load settings from localStorage", e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }

  public save(newSettings: AppSettings) {
    const toStore: AppSettings = {
        modelOverrides: newSettings.modelOverrides || this.settings.modelOverrides,
        researchParams: newSettings.researchParams || this.settings.researchParams,
    };
    try {
      localStorage.setItem('k-research-settings', JSON.stringify(toStore));
      this.settings = toStore;
    } catch (e) {
      console.error("Failed to save settings to localStorage", e);
    }
  }

  public getSettings(): AppSettings {
    return this.settings;
  }

  public clearIncompatibleModelOverrides(): void {
    const isOpenRouter = apiKeyService.isUsingOpenRouter();
    const currentOverrides = this.settings.modelOverrides;
    let hasChanges = false;

    // Clear any model overrides that don't match the current API provider
    for (const role in currentOverrides) {
      const override = currentOverrides[role];
      if (override) {
        const isOverrideOpenRouter = !override.includes('gemini'); // any non-Gemini is considered OpenRouter-side
        const isOverrideGemini = override.includes('gemini');

        if (isOpenRouter && isOverrideGemini) {
          currentOverrides[role] = null;
          hasChanges = true;
          console.log(`Cleared incompatible Gemini model override for ${role}: ${override}`);
        } else if (!isOpenRouter && isOverrideOpenRouter) {
          currentOverrides[role] = null;
          hasChanges = true;
          console.log(`Cleared incompatible OpenRouter model override for ${role}: ${override}`);
        }
      }
    }

    if (hasChanges) {
      this.save(this.settings);
      console.log('Cleared incompatible model overrides based on current API provider');
    }
  }

  public clearAllModelOverrides(): void {
    const currentOverrides = this.settings.modelOverrides;
    let hasChanges = false;

    for (const role in currentOverrides) {
      if (currentOverrides[role]) {
        currentOverrides[role] = null;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      this.save(this.settings);
      console.log('Cleared all model overrides, will use defaults based on current API provider');
    }
  }
  
  public async fetchAvailableModels(forceRefetch: boolean = false): Promise<string[]> {
    const apiKeys = apiKeyService.getApiKeys();
    if (apiKeys.length === 0) {
      this.availableModels = [];
      throw new Error("API Key not set.");
    }

    if (this.availableModels.length > 0 && !forceRefetch) return this.availableModels;

    const allModelNames = new Set<string>();
    let lastError: any = null;
    const baseUrl = apiKeyService.getApiBaseUrl();
    const isOpenRouter = apiKeyService.isUsingOpenRouter();

    for (const key of apiKeys) {
        try {
            let response;
            if (isOpenRouter) {
                // OpenRouter uses OpenAI-compatible models endpoint
                response = await fetch(`${baseUrl}/models`, {
                    headers: {
                        'Authorization': `Bearer ${key}`,
                        'Content-Type': 'application/json'
                    }
                });
            } else {
                // Gemini API endpoint
                response = await fetch(`${baseUrl}/v1beta/models?pageSize=50`, {
                    headers: { 'x-goog-api-key': key }
                });
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                const errorMessage = errorData?.error?.message || response.statusText;
                throw new Error(`Failed with key ending in ...${key.slice(-4)}: ${errorMessage}`);
            }

            const data = await response.json();
            let modelNames: string[] = [];

            if (isOpenRouter) {
                // OpenRouter response format: { data: [{ id: "openrouter/model-id", object: "model", ... }] }
                modelNames = (data.data || [])
                    .map((m: { id: string }) => m.id)
                    .filter((name: string) => !name.includes('gemini'));
            } else {
                // Gemini API response format: { models: [{ name: "models/gemini-pro", ... }] }
                modelNames = (data.models || [])
                    .map((m: { name: string }) => m.name.replace(/^models\//, ''))
                    .filter((name: string) => name.includes('gemini'));
            }

            modelNames.forEach(name => allModelNames.add(name));
            // We only need one successful key to get the models.
            lastError = null; 
            break;
        } catch (error) {
            console.warn(`Could not fetch models for one of the keys:`, error);
            lastError = error;
        }
    }

    if (allModelNames.size === 0) {
        console.error("Error fetching available models from any key:", lastError);
        this.availableModels = [];
        throw lastError || new Error("Failed to fetch models from any of the provided API keys.");
    }
    
    this.availableModels = Array.from(allModelNames).sort();
    return this.availableModels;
  }
}

export const settingsService = new SettingsService();