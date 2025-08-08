
import React from 'react';
import { apiKeyService } from '../../services/apiKeyService';
import { useLanguage } from '../../contextx/LanguageContext';

interface ApiSettingsProps {
    apiKey: string;
    setApiKey: (key: string) => void;
    apiBaseUrl: string;
    setApiBaseUrl: (url: string) => void;
}

const ApiSettings: React.FC<ApiSettingsProps> = ({ apiKey, setApiKey, apiBaseUrl, setApiBaseUrl }) => {
    const { t } = useLanguage();
    const isEnvKey = apiKeyService.isEnvKey();

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="space-y-4">
                <h3 className="text-lg font-semibold">API Keys</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    This application supports both Google Gemini and OpenRouter APIs. Enter your API key(s) below. You can switch between providers using the API Provider section.
                </p>
                {isEnvKey ? (
                    <div className="w-full p-3 rounded-2xl bg-slate-200/60 dark:bg-black/20 text-gray-500 dark:text-gray-400 border border-transparent">
                        {t('apiKeysConfiguredByHost')}
                    </div>
                ) : (
                    <textarea
                        id="api-key-input"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Enter your Gemini API key (AIza...) or OpenRouter API key (sk-...)"
                        className="w-full h-24 p-3 rounded-2xl resize-none bg-white/60 dark:bg-black/20 border border-transparent focus:border-glow-light dark:focus:border-glow-dark focus:ring-1 focus:ring-glow-light/50 dark:focus:ring-glow-dark/50 focus:outline-none transition-all text-sm"
                        aria-label="AI API Keys"
                    />
                )}
            </div>

            <div className="space-y-4">
                <h3 className="text-lg font-semibold">API Provider</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                    Choose between Google Gemini and OpenRouter APIs. The application will automatically use appropriate models for your selected provider.
                </p>

                {!isEnvKey && (
                    <div className="flex gap-2 mb-4">
                        <button
                            onClick={() => setApiBaseUrl(apiKeyService.getGeminiBaseUrl())}
                            className="px-4 py-2 text-sm rounded-xl bg-blue-500/20 hover:bg-blue-500/30 text-blue-600 dark:text-blue-400 transition-colors"
                        >
                            Google Gemini
                        </button>
                        <button
                            onClick={() => setApiBaseUrl(apiKeyService.getOpenRouterBaseUrl())}
                            className="px-4 py-2 text-sm rounded-xl bg-purple-500/20 hover:bg-purple-500/30 text-purple-600 dark:text-purple-400 transition-colors"
                        >
                            OpenRouter
                        </button>
                    </div>
                )}

                <input
                    id="api-base-url-input"
                    type="url"
                    value={apiBaseUrl}
                    onChange={(e) => setApiBaseUrl(e.target.value)}
                    placeholder="https://openrouter.ai/api/v1 or https://generativelanguage.googleapis.com"
                    className="w-full p-3 rounded-2xl bg-white/60 dark:bg-black/20 border border-transparent focus:border-glow-light dark:focus:border-glow-dark focus:ring-1 focus:ring-glow-light/50 dark:focus:ring-glow-dark/50 focus:outline-none transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="API Base URL"
                    disabled={isEnvKey}
                />

                <div className="text-xs text-gray-500 dark:text-gray-400">
                    Current provider: {apiKeyService.isUsingOpenRouter() ? 'OpenRouter' : apiKeyService.isUsingGemini() ? 'Google Gemini' : 'Custom'}
                </div>
            </div>
        </div>
    );
};

export default ApiSettings;
