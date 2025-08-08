
import { ai } from './geminiClient';
import { getModel } from './models';
import { settingsService } from './settingsService';
import { executeSingleSearch } from './search';

import { parseJsonFromMarkdown } from './utils';
import { ResearchUpdate, AgentPersona, ResearchMode, FileData, Role } from '../types';
import { getPlannerPrompt, plannerTurnSchema } from './plannerPrompt';

interface PlannerTurn {
    thought: any; // sanitize to string at runtime
    action: 'search' | 'continue_debate' | 'finish' | string; // normalize at runtime
    queries?: (string | any)[] | null;
    finish_reason?: string | any | null;
}

// Ensure the model output conforms to expected shapes to avoid UI artifacts like "[object Object]"
function sanitizePlannerTurn(raw: any): { thought: string; action: 'search' | 'continue_debate' | 'finish'; queries: string[] | null; finish_reason: string | null } | null {
    if (!raw || typeof raw !== 'object') return null;

    // Coerce thought to string
    let thought: string;
    const rawThought = (raw as any).thought;
    if (typeof rawThought === 'string') {
        thought = rawThought;
    } else if (rawThought == null) {
        return null;
    } else {
        try {
            thought = JSON.stringify(rawThought);
        } catch {
            thought = String(rawThought);
        }
    }

    // Normalize action
    const allowed: Array<'search' | 'continue_debate' | 'finish'> = ['search', 'continue_debate', 'finish'];
    const rawAction = typeof raw.action === 'string' ? raw.action.trim().toLowerCase() : '';
    const action = (allowed as string[]).includes(rawAction) ? (rawAction as 'search' | 'continue_debate' | 'finish') : 'continue_debate';

    // Normalize queries
    let queries: string[] | null = null;
    if (Array.isArray(raw.queries)) {
        queries = raw.queries
            .map((q: any) => {
                if (typeof q === 'string') return q;
                try { return JSON.stringify(q); } catch { return String(q); }
            })
            .map((q: string) => q.trim())
            .filter((q: string) => q.length > 0)
            .slice(0, 4);
        if ((queries?.length || 0) === 0) queries = null;
    }

    // Normalize finish_reason
    let finish_reason: string | null = null;
    if (raw.finish_reason != null) {
        finish_reason = typeof raw.finish_reason === 'string' ? raw.finish_reason : (() => { try { return JSON.stringify(raw.finish_reason); } catch { return String(raw.finish_reason); } })();
    }

    return { thought, action, queries, finish_reason };
}

export const runDynamicConversationalPlanner = async (
    query: string,
    researchHistory: ResearchUpdate[],
    onUpdate: (update: ResearchUpdate) => void,
    checkSignal: () => void,
    idCounter: { current: number },
    mode: ResearchMode,
    clarifiedContext: string,
    fileData: FileData | null,
    role: Role | null,
    searchCycles: number
): Promise<{ search_queries: string[], should_finish: boolean, finish_reason?: string }> => {
    const { minCycles, maxDebateRounds, maxCycles } = settingsService.getSettings().researchParams;

    const searchHistoryText = researchHistory.filter(h => h.type === 'search').map(h => (Array.isArray(h.content) ? h.content : [h.content]).join(', ')).join('; ');
    const readHistoryText = researchHistory.filter(h => h.type === 'read').map(h => h.content).join('\n---\n');

    const currentConversation: { persona: AgentPersona; thought: string }[] = [];
    let lastPersona: AgentPersona | undefined;

    // Reconstruct conversation from the tail of the history log
    for (let i = researchHistory.length - 1; i >= 0; i--) {
        const update = researchHistory[i];
        if (update.type === 'thought' && update.persona) {
            currentConversation.unshift({ persona: update.persona, thought: String(update.content) });
            if (!lastPersona) {
                lastPersona = update.persona;
            }
        } else {
            // Stop when we hit a non-thought update (e.g., 'read', 'search')
            break;
        }
    }

    let nextPersona: AgentPersona = lastPersona === 'Alpha' ? 'Beta' : 'Alpha';
    let debateTurns = currentConversation.length;
    let consecutiveFinishAttempts = 0;

    while (debateTurns < maxDebateRounds) {
        checkSignal();
        debateTurns++;

        // Build a short, fresh web signals block for the agents (combining Google + other engines)
        let webSignalsText = '';
        try {
            // Reuse executeSingleSearch to ensure multi-engine + google are both touched
            const recentPulse = await executeSingleSearch(query, mode);
            const sample = recentPulse.citations.slice(0, 5);
            if (sample.length > 0) {
                webSignalsText = sample.map(c => `- ${c.title}\n  ${c.url}`).join('\n');
            }
        } catch (e) {
            // Non-fatal: agents can proceed without the signals
        }

        const isFirstTurn = currentConversation.length === 0;

        const prompt = getPlannerPrompt({
            nextPersona,
            query,
            clarifiedContext,
            fileDataName: fileData ? fileData.name : null,
            role,
            searchCycles,
            searchHistoryText,
            readHistoryText,
            conversationText: currentConversation.map(t => `${t.persona}: ${t.thought}`).join('\n'),
            minCycles,
            maxCycles,
            isFirstTurn,
        });

        const parts: ({ text: string } | { inlineData: { mimeType: string; data: string; } })[] = [{ text: prompt }];
        if (fileData) {
            parts.push({ inlineData: { mimeType: fileData.mimeType, data: fileData.data } });
        }
        if (role?.file) {
            parts.push({ inlineData: { mimeType: role.file.mimeType, data: role.file.data } });
        }

        const response = await ai.models.generateContent({
            model: getModel('planner', mode),
            contents: { parts },
            config: {
                responseMimeType: "application/json",
                temperature: 0.7,
                responseSchema: plannerTurnSchema
            }
        });
        checkSignal();
        const rawParsed = parseJsonFromMarkdown(response.text || '') as PlannerTurn | null;
        const parsedResponse = sanitizePlannerTurn(rawParsed);

        if (!parsedResponse || !parsedResponse.thought || !parsedResponse.action) {
            // Fallback: treat the raw text as the agent's thought and continue the debate
            const fallbackThought = String((response.text || '').trim() || `Agent ${nextPersona} produced non-JSON output. Proceeding with debate.`);
            onUpdate({ id: idCounter.current++, type: 'thought' as const, persona: nextPersona, content: fallbackThought });
            currentConversation.push({ persona: nextPersona, thought: fallbackThought });
            await new Promise(res => setTimeout(res, 400));
            checkSignal();
            // Switch to the other agent and continue the loop
            nextPersona = (nextPersona === 'Alpha') ? 'Beta' : 'Alpha';
            continue;
        }
        onUpdate({ id: idCounter.current++, type: 'thought' as const, persona: nextPersona, content: parsedResponse.thought });
        currentConversation.push({ persona: nextPersona, thought: parsedResponse.thought });
        await new Promise(res => setTimeout(res, 400));
        checkSignal();

        let effectiveAction = parsedResponse.action;

        if (effectiveAction === 'finish') {
            consecutiveFinishAttempts++;
        } else {
            consecutiveFinishAttempts = 0;
        }

        if (effectiveAction === 'finish' && searchCycles < minCycles) {
             if (consecutiveFinishAttempts >= 2) {
                const thought = `Agent consensus to finish has been detected. Overriding the minimum cycle rule to conclude research.`;
                onUpdate({ id: idCounter.current++, type: 'thought' as const, content: thought });
                // Let the action proceed as 'finish' by not changing it
             } else {
                const thought = `Rule violation: Cannot finish before ${minCycles} search cycles. Forcing debate to continue.`;
                onUpdate({ id: idCounter.current++, type: 'thought' as const, persona: nextPersona, content: thought });
                effectiveAction = 'continue_debate';
             }
        }

        if (effectiveAction === 'finish') {
            return { should_finish: true, search_queries: [], finish_reason: parsedResponse.finish_reason || `${nextPersona} decided to finish.` };
        }

        if (effectiveAction === 'search' && parsedResponse.queries && parsedResponse.queries.length > 0) {
            return { should_finish: false, search_queries: parsedResponse.queries };
        }

        // if we reach here, action is 'continue_debate'
        nextPersona = (nextPersona === 'Alpha') ? 'Beta' : 'Alpha';
    }

    // If the while loop exits, it means maxDebateRounds was reached.
    onUpdate({ id: idCounter.current++, type: 'thought', content: 'Debate reached maximum turns without a decision. Forcing research to conclude.' });
    return { should_finish: true, search_queries: [], finish_reason: 'Planning debate timed out.' };
};
