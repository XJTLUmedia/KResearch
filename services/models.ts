import { settingsService } from './settingsService';
import { ResearchMode, AgentRole } from '../types';

// Gemini models (original)
const geminiModels: Record<AgentRole, Record<ResearchMode, string>> = {
    planner: {
        Balanced: 'gemini-2.5-pro',
        DeepDive: 'gemini-2.5-pro',
        Fast: 'gemini-2.5-flash',
        UltraFast: 'gemini-2.5-flash-lite',
    },
    searcher: {
        Balanced: 'gemini-2.5-flash-lite',
        DeepDive: 'gemini-2.5-pro',
        Fast: 'gemini-2.5-flash',
        UltraFast: 'gemini-2.5-flash-lite',
    },
    outline: {
        Balanced: 'gemini-2.5-flash',
        DeepDive: 'gemini-2.5-pro',
        Fast: 'gemini-2.5-flash',
        UltraFast: 'gemini-2.5-flash-lite',
    },
    synthesizer: {
        Balanced: 'gemini-2.5-flash',
        DeepDive: 'gemini-2.5-pro',
        Fast: 'gemini-2.5-flash',
        UltraFast: 'gemini-2.5-flash-lite',
    },
    clarification: {
        Balanced: 'gemini-2.5-flash',
        DeepDive: 'gemini-2.5-pro',
        Fast: 'gemini-2.5-flash',
        UltraFast: 'gemini-2.5-flash-lite',
    },
    visualizer: {
        Balanced: 'gemini-2.5-flash',
        DeepDive: 'gemini-2.5-pro',
        Fast: 'gemini-2.5-flash',
        UltraFast: 'gemini-2.5-flash-lite',
    },
    roleAI: {
        Balanced: 'gemini-2.5-flash',
        DeepDive: 'gemini-2.5-flash',
        Fast: 'gemini-2.5-flash',
        UltraFast: 'gemini-2.5-flash',
    }
};

// OpenRouter default models (example mappings)
const openRouterModels: Record<AgentRole, Record<ResearchMode, string>> = {
    planner: {
        Balanced: 'openrouter/auto',
        DeepDive: 'openrouter/auto',
        Fast: 'openrouter/auto',
        UltraFast: 'openrouter/auto',
    },
    searcher: {
        Balanced: 'openrouter/auto',
        DeepDive: 'openrouter/auto',
        Fast: 'openrouter/auto',
        UltraFast: 'openrouter/auto',
    },
    outline: {
        Balanced: 'openrouter/auto',
        DeepDive: 'openrouter/auto',
        Fast: 'openrouter/auto',
        UltraFast: 'openrouter/auto',
    },
    synthesizer: {
        Balanced: 'openrouter/auto',
        DeepDive: 'openrouter/auto',
        Fast: 'openrouter/auto',
        UltraFast: 'openrouter/auto',
    },
    clarification: {
        Balanced: 'openrouter/auto',
        DeepDive: 'openrouter/auto',
        Fast: 'openrouter/auto',
        UltraFast: 'openrouter/auto',
    },
    visualizer: {
        Balanced: 'openrouter/auto',
        DeepDive: 'openrouter/auto',
        Fast: 'openrouter/auto',
        UltraFast: 'openrouter/auto',
    },
    roleAI: {
        Balanced: 'openrouter/auto',
        DeepDive: 'openrouter/auto',
        Fast: 'openrouter/auto',
        UltraFast: 'openrouter/auto',
    }
};

// Dynamic default models based on current API provider
const getDefaultModelsForCurrentProvider = () => {
    // Import apiKeyService dynamically to avoid circular dependency
    try {
        const { apiKeyService } = require('./apiKeyService');
        return apiKeyService.isUsingOpenRouter() ? openRouterModels : geminiModels;
    } catch {
        // Fallback to OpenRouter if there's any issue
        return openRouterModels;
    }
};

// Dynamic model selection based on current API provider

export const getDefaultModelForRole = (role: AgentRole, mode: ResearchMode): string => {
    const currentDefaults = getDefaultModelsForCurrentProvider();
    return currentDefaults[role][mode];
}

export const getGeminiModelForRole = (role: AgentRole, mode: ResearchMode): string => {
    return geminiModels[role][mode];
}

export const getOpenRouterModelForRole = (role: AgentRole, mode: ResearchMode): string => {
    return openRouterModels[role][mode];
}

/**
 * Gets the appropriate model for a given agent role and research mode.
 * It first checks for a user-defined override in settings, then falls back
 * to the default model for the selected mode.
 * @param role The role of the agent (e.g., 'planner', 'searcher').
 * @param mode The current research mode (e.g., 'Balanced', 'DeepDive').
 * @param provider Optional provider preference ('gemini' or 'openrouter')
 * @returns The name of the model to be used.
 */
export const getModel = (role: AgentRole, mode: ResearchMode, provider?: 'gemini' | 'openrouter'): string => {
    const override = settingsService.getSettings().modelOverrides[role];
    if (override) {
        return override;
    }

    // If provider is specified, use that provider's models
    if (provider === 'gemini') {
        return getGeminiModelForRole(role, mode);
    } else if (provider === 'openrouter') {
        return getOpenRouterModelForRole(role, mode);
    }

    // Use models appropriate for current API provider
    return getDefaultModelForRole(role, mode);
};

/**
 * Get all available models for both providers
 */
export const getAllAvailableModels = (): string[] => {
    const geminiModelsList = Object.values(geminiModels).flatMap(modes => Object.values(modes));
    const openRouterModelsList = Object.values(openRouterModels).flatMap(modes => Object.values(modes));
    return [...new Set([...geminiModelsList, ...openRouterModelsList])];
};
