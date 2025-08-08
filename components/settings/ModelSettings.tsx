
import React, { useState, useEffect, useCallback } from 'react';
import { settingsService } from '../../services/settingsService';
import { getDefaultModelForRole } from '../../services/models';
import { AppSettings, AgentRole, ResearchMode } from '../../types';
import Spinner from '../Spinner';
import { useLanguage } from '../../contextx/LanguageContext';
import { apiKeyService } from '../../services/apiKeyService';

interface ModelSettingsProps {
    settings: AppSettings;
    setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
    currentMode: ResearchMode;
}

const AGENT_ROLES: AgentRole[] = ['planner', 'searcher', 'outline', 'synthesizer', 'clarification', 'visualizer', 'roleAI'];

const ModelSettings: React.FC<ModelSettingsProps> = ({ settings, setSettings, currentMode }) => {
    const { t } = useLanguage();
    const [availableModels, setAvailableModels] = useState<string[]>([]);
    const [isLoadingModels, setIsLoadingModels] = useState(false);
    const [modelsError, setModelsError] = useState<string | null>(null);

    // Check for incompatible model overrides
    const isOpenRouter = apiKeyService.isUsingOpenRouter();
    const hasIncompatibleOverrides = Object.values(settings.modelOverrides).some(override => {
        if (!override) return false;
        const isOverrideOpenRouter = !override.includes('gemini');
        const isOverrideGemini = override.includes('gemini');
        return (isOpenRouter && isOverrideGemini) || (!isOpenRouter && isOverrideOpenRouter);
    });

    const fetchModels = useCallback(async (force = false) => {
        setIsLoadingModels(true);
        setModelsError(null);
        try {
            const models = await settingsService.fetchAvailableModels(force);
            setAvailableModels(models);
        } catch (e: any) {
            setModelsError(e.message || "An unknown error occurred while fetching models.");
        } finally {
            setIsLoadingModels(false);
        }
    }, []);

    useEffect(() => {
        fetchModels();
    }, [fetchModels]);


    const handleModelOverrideChange = (role: AgentRole, value: string) => {
        setSettings(prev => ({
            ...prev,
            modelOverrides: { ...prev.modelOverrides, [role]: value === 'default' ? null : value }
        }));
    };
    
    const getRoleLabel = (role: AgentRole) => {
        if (role === 'roleAI') return t('roleAI');
        return t(role);
    }

    return (
        <div className="space-y-4 animate-fade-in">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">{t('modelConfig')}</h3>
                <div className="flex items-center gap-2">
                     {isLoadingModels && <div className="flex items-center gap-2 text-sm"><Spinner /><span>{t('loading')}</span></div>}
                     <button
                        onClick={() => {
                            settingsService.clearAllModelOverrides();
                            setSettings(prev => ({ ...prev, modelOverrides: {} }));
                        }}
                        className="px-3 py-1 text-xs rounded-xl bg-orange-500/20 hover:bg-orange-500/30 text-orange-600 dark:text-orange-400 transition-colors"
                        title="Reset all model overrides to defaults"
                     >
                        Reset to Defaults
                     </button>
                     <button onClick={() => fetchModels(true)} disabled={isLoadingModels} className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors disabled:opacity-50" title={t('refreshModelList')}>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 -960 960 960" fill="currentColor">
                            <path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-720q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z"/>
                        </svg>
                     </button>
                </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('modelConfigDesc')}</p>
            {modelsError && <div className="p-3 text-sm rounded-2xl bg-red-500/10 text-red-800 dark:text-red-200 border border-red-500/20">{modelsError}</div>}
            {hasIncompatibleOverrides && (
                <div className="p-3 text-sm rounded-2xl bg-yellow-500/10 text-yellow-800 dark:text-yellow-200 border border-yellow-500/20">
                    <div className="flex items-center gap-2 mb-2">
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <strong>Incompatible Model Overrides Detected</strong>
                    </div>
                    <p>Some model overrides don't match your current API provider ({isOpenRouter ? 'OpenRouter' : 'Gemini'}). Click "Reset to Defaults" to fix this.</p>
                </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {AGENT_ROLES.map(role => {
                    const defaultModelName = getDefaultModelForRole(role, currentMode);
                    return (
                        <div key={role} className="space-y-1">
                            <label htmlFor={`model-${role}`} className="font-semibold text-gray-700 dark:text-gray-300 capitalize text-sm">{getRoleLabel(role)}</label>
                            <select id={`model-${role}`} value={settings.modelOverrides[role] || 'default'} onChange={e => handleModelOverrideChange(role, e.target.value)} disabled={isLoadingModels || availableModels.length === 0} className="w-full p-2 rounded-2xl bg-white/60 dark:bg-black/20 border border-transparent focus:border-glow-light dark:focus:border-glow-dark focus:ring-1 focus:ring-glow-light/50 dark:focus:ring-glow-dark/50 focus:outline-none transition-all text-sm disabled:opacity-50">
                                <option value="default">{t('defaultModel')} ({defaultModelName})</option>
                                {availableModels.map(modelName => <option key={modelName} value={modelName}>{modelName}</option>)}
                            </select>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ModelSettings;
