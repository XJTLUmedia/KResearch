export class AllKeysFailedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AllKeysFailedError';
    }
}

const API_KEYS_STORAGE_KEY = 'ai_api_keys'; // Supports both Gemini and OpenRouter
const API_BASE_URL_STORAGE_KEY = 'ai_api_base_url';
const GEMINI_DEFAULT_API_BASE_URL = 'https://generativelanguage.googleapis.com';
const OPENROUTER_DEFAULT_API_BASE_URL = 'https://openrouter.ai/api/v1';


class ApiKeyService {
    private userApiKeys: string[] = [];
    private readonly hasEnvKey: boolean;
    private currentKeyIndex = -1;
    private apiBaseUrl: string;

    constructor() {
        const envKey = process.env.API_KEY;
        this.hasEnvKey = !!envKey && envKey.length > 0;

        if (this.hasEnvKey) {
            this.userApiKeys = this.parseKeys(envKey);
        } else {
            try {
                const storedKeys = localStorage.getItem(API_KEYS_STORAGE_KEY);
                this.userApiKeys = this.parseKeys(storedKeys || '');
            } catch (e) {
                console.warn("Could not access localStorage. API keys will not be persisted.");
                this.userApiKeys = [];
            }
        }

        try {
            const storedBaseUrl = localStorage.getItem(API_BASE_URL_STORAGE_KEY);
            this.apiBaseUrl = storedBaseUrl || GEMINI_DEFAULT_API_BASE_URL; // Default to Gemini for backward compatibility
        } catch (e) {
            console.warn("Could not access localStorage. API base URL will not be persisted.");
            this.apiBaseUrl = GEMINI_DEFAULT_API_BASE_URL;
        }
    }
    
    private parseKeys(keysString: string): string[] {
        if (!keysString) return [];
        return keysString
            .split(/[\n,]+/)
            .map(k => k.trim())
            .filter(k => k.length > 0);
    }

    public hasKey(): boolean {
        return this.getApiKeys().length > 0;
    }

    public isEnvKey(): boolean {
        return this.hasEnvKey;
    }
    
    public getApiKeys(): string[] {
        return this.userApiKeys;
    }

    public getApiKeysString(): string {
        return this.userApiKeys.join('\n');
    }

    public getApiBaseUrl(): string {
        return this.apiBaseUrl;
    }

    public getNextApiKey(): string | undefined {
        const keys = this.getApiKeys();
        if (keys.length === 0) {
            return undefined;
        }
        this.currentKeyIndex = (this.currentKeyIndex + 1) % keys.length;
        return keys[this.currentKeyIndex];
    }

    public setApiKeys(keysString: string): void {
        if (!this.isEnvKey()) {
            this.userApiKeys = this.parseKeys(keysString);
            try {
                if (this.userApiKeys.length > 0) {
                    localStorage.setItem(API_KEYS_STORAGE_KEY, keysString);
                } else {
                    localStorage.removeItem(API_KEYS_STORAGE_KEY);
                }
            } catch (e) {
                 console.warn("Could not access localStorage. API keys will not be persisted.");
            }
        }
    }

    public setApiBaseUrl(url: string): void {
        const oldUrl = this.apiBaseUrl;
        const newUrl = url.trim() || GEMINI_DEFAULT_API_BASE_URL;
        this.apiBaseUrl = newUrl;
        try {
            if (this.isEnvKey()) return; // Do not save if env key is present
            localStorage.setItem(API_BASE_URL_STORAGE_KEY, newUrl);

            // If the API provider changed, clear incompatible model overrides
            const oldIsOpenRouter = oldUrl.includes('openrouter.ai');
            const newIsOpenRouter = newUrl.includes('openrouter.ai');
            if (oldIsOpenRouter !== newIsOpenRouter) {
                // Import settingsService dynamically to avoid circular dependency
                import('./settingsService').then(({ settingsService }) => {
                    settingsService.clearIncompatibleModelOverrides();
                });
            }
        } catch (e) {
            console.warn("Could not access localStorage. API base URL will not be persisted.");
        }
    }

    // Helper methods for API provider detection
    public isUsingOpenRouter(): boolean {
        return this.apiBaseUrl.includes('openrouter.ai');
    }

    public isUsingGemini(): boolean {
        return this.apiBaseUrl.includes('googleapis.com') || this.apiBaseUrl.includes('generativelanguage');
    }

    public getOpenRouterBaseUrl(): string {
        return OPENROUTER_DEFAULT_API_BASE_URL;
    }

    public getGeminiBaseUrl(): string {
        return GEMINI_DEFAULT_API_BASE_URL;
    }

    public reset(): void {
        this.currentKeyIndex = -1;
    }
}

export const apiKeyService = new ApiKeyService();