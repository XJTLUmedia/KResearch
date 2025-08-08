import { ai } from './geminiClient';
import { getModel } from './models';
import { Citation, ResearchMode } from '../types';
import { GenerateContentResponse } from "@google/genai";
import { performWebSearch, formatSearchResults } from './webSearchService';


export const executeSingleSearch = async (searchQuery: string, mode: ResearchMode): Promise<{ text: string, citations: Citation[] }> => {
    // 1) Perform our multi-engine web search to ensure freshness and breadth
    let webResults: ReturnType<typeof performWebSearch> extends Promise<infer T> ? T : never;
    try {
        webResults = await performWebSearch(searchQuery);
    } catch (e) {
        console.warn('[executeSingleSearch] performWebSearch failed; will rely on model-only summarization with built-in tools.', e);
        webResults = { results: [], citations: [] } as any;
    }

    const formatted = formatSearchResults(webResults.results);
    const searchContext = formatted.length > 0
        ? `\n\nWeb Search Results (multi-engine):\n${formatted.map(r => `- ${r.title} (${r.source})\n  ${r.url}\n  ${r.snippet}`).join('\n')}`
        : '';

    // 2) Ask the model to synthesize with explicit, grounded context (and enable tool as a fallback)
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: getModel('searcher', mode),
        contents: `Concisely summarize key, current information for the query: "${searchQuery}".${searchContext}\n\nFocus on: facts, figures, dates, and recent developments. If conflicting info appears, note it and prioritize authoritative sources.`,
        config: { tools: [{ googleSearch: {} }] },
    });

    // 3) Merge citations: prefer webResults.citations; include model grounding if present
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const modelCitations: Citation[] = groundingMetadata
        ? groundingMetadata.map((chunk: any) => ({
              url: chunk.web.uri,
              title: chunk.web.title || chunk.web.uri,
          }))
        : [];

    const combined = [...webResults.citations, ...modelCitations];
    const uniqueCitations = Array.from(new Map(combined.map(c => [c.url, c])).values());
    return { text: `Summary for "${searchQuery}": ${response.text}`, citations: uniqueCitations };
};