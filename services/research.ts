



import { runDynamicConversationalPlanner } from './planner';
import { executeSingleSearch } from './search';
import { synthesizeReport } from './synthesis';
import { settingsService } from './settingsService';
import { ResearchUpdate, Citation, FinalResearchData, ResearchMode, FileData, Role } from '../types';

/**
 * Executes a set of search queries and synthesizes the results.
 * @returns A structured update for the research log and a list of new citations.
 */
const performSearchAndRead = async (
    searchQueries: string[],
    mode: ResearchMode,
    checkSignal: () => void,
): Promise<{ readUpdateContent: Omit<ResearchUpdate, 'id' | 'persona'>; newCitations: Citation[] }> => {
    checkSignal();

    const searchPromises = searchQueries.map(q => executeSingleSearch(q, mode));
    const searchResults = await Promise.all(searchPromises);
    checkSignal();

    const readContents = searchResults.map(r => r.text);
    const combinedCitations = searchResults.flatMap(r => r.citations);

    const readUpdateContent = {
        type: 'read' as const,
        content: readContents,
        source: Array.from(new Set(combinedCitations.map(c => c.url)))
    };

    return { readUpdateContent, newCitations: combinedCitations };
};


export const runIterativeDeepResearch = async (
  query: string,
  onUpdate: (update: ResearchUpdate) => void,
  signal: AbortSignal,
  mode: ResearchMode,
  clarifiedContext: string,
  fileData: FileData | null,
  role: Role | null,
  initialSearchResult: { text: string, citations: Citation[] } | null,
  existingHistory: ResearchUpdate[]
): Promise<Omit<FinalResearchData, 'researchTimeMs'>> => {
  console.log(`Starting/Continuing DYNAMIC CONVERSATIONAL research for: ${query}`);

  let history: ResearchUpdate[] = [...existingHistory];
  const idCounter = { current: existingHistory.length };
  let allCitations: Citation[] = [];
  
  if (initialSearchResult) {
      allCitations.push(...initialSearchResult.citations);
  }
  existingHistory.forEach(update => {
      if (update.type === 'read' && Array.isArray(update.source)) {
          update.source.forEach(url => {
              if (typeof url === 'string' && !allCitations.some(c => c.url === url)) {
                  allCitations.push({ url, title: url });
              }
          });
      }
  });

  const { maxCycles } = settingsService.getSettings().researchParams;

  const checkSignal = () => {
    if (signal.aborted) throw new DOMException('Research aborted by user.', 'AbortError');
  }

  // Track consecutive search cycles that produced no sources
  let consecutiveNoSourceCycles = 0;

  // Recovery logic for a failed search/read step
  const lastUpdate = history.length > 0 ? history[history.length - 1] : null;
  if (lastUpdate && lastUpdate.type === 'search') {
    const searchQueries = Array.isArray(lastUpdate.content) ? lastUpdate.content : [String(lastUpdate.content)];
    console.log('Recovering from a previous state. Retrying last search action.', searchQueries);

    const { readUpdateContent, newCitations } = await performSearchAndRead(searchQueries, mode, checkSignal);
    allCitations.push(...newCitations);

    const readUpdate = {
        id: idCounter.current++,
        ...readUpdateContent
    };
    history.push(readUpdate);
    onUpdate(readUpdate);
  }
  
  while (true) {
    checkSignal();
    const totalSearchUpdates = history.filter(h => h.type === 'search').length;
    const internalSearchCycles = initialSearchResult ? Math.max(0, totalSearchUpdates - 1) : totalSearchUpdates;

    if (internalSearchCycles >= maxCycles) {
        const finishUpdate = { id: idCounter.current++, type: 'thought' as const, content: `Maximum research cycles (${maxCycles}) reached. Forcing conclusion to synthesize report.` };
        history.push(finishUpdate);
        onUpdate(finishUpdate);
        break;
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    checkSignal();
    
    const plan = await runDynamicConversationalPlanner(query, history, (update) => {
        history.push(update);
        onUpdate(update);
    }, checkSignal, idCounter, mode, clarifiedContext, fileData, role, totalSearchUpdates);
    
    checkSignal();

    if (plan.should_finish) {
        const finishReason = plan.finish_reason || 'Research concluded.';
        const finishUpdate = { id: idCounter.current++, type: 'thought' as const, content: `Finished research: ${finishReason}` };
        history.push(finishUpdate);
        onUpdate(finishUpdate);
        break;
    }

    const searchQueries = plan.search_queries;

    if (searchQueries && searchQueries.length > 0) {
      const searchUpdate = { id: idCounter.current++, type: 'search' as const, content: searchQueries, source: searchQueries.map(q => `https://www.google.com/search?q=${encodeURIComponent(q)}`) };
      history.push(searchUpdate);
      onUpdate(searchUpdate);

      const { readUpdateContent, newCitations } = await performSearchAndRead(searchQueries, mode, checkSignal);
      allCitations.push(...newCitations);

      // Determine if this cycle produced any sources
      const producedSources = Array.isArray(readUpdateContent.source) && readUpdateContent.source.length > 0;
      if (!producedSources) {
        consecutiveNoSourceCycles += 1;
      } else {
        consecutiveNoSourceCycles = 0;
      }

      const readUpdate = {
        id: idCounter.current++,
        ...readUpdateContent
      };
      history.push(readUpdate);
      onUpdate(readUpdate);

      // If there are sources, surface a brief Alpha/Beta note so the UI shows them in the agent conversation
      if (producedSources) {
        const sampleSources = (Array.isArray(readUpdateContent.source) ? readUpdateContent.source : [])
          .slice(0, 2)
          .map(s => (typeof s === 'string' ? s : String(s)));
        const alphaNote = {
          id: idCounter.current++,
          type: 'thought' as const,
          persona: 'Alpha' as const,
          content: sampleSources.length > 0
            ? `We have new sources to deepen our research. Examples: ${sampleSources.join(', ')}`
            : 'We have new sources to deepen our research.'
        };
        const betaNote = {
          id: idCounter.current++,
          type: 'thought' as const,
          persona: 'Beta' as const,
          content: 'Acknowledged. I will craft the next set of targeted queries based on these sources.'
        };
        history.push(alphaNote); onUpdate(alphaNote);
        history.push(betaNote); onUpdate(betaNote);
      }

      // If 2 consecutive cycles yielded no sources, stop looping to avoid spinning
      if (consecutiveNoSourceCycles >= 2) {
        const loopBreak = { id: idCounter.current++, type: 'thought' as const, content: 'Two consecutive search cycles returned no sources. Concluding research to avoid looping.' };
        history.push(loopBreak);
        onUpdate(loopBreak);
        break;
      }
    } else if (!plan.should_finish) {
        const safetyBreakUpdate = { id: idCounter.current++, type: 'thought' as const, content: 'Planner did not provide a search action. Concluding research to synthesize report.' };
        history.push(safetyBreakUpdate);
        onUpdate(safetyBreakUpdate);
        break;
    }
  }
  
  checkSignal();
  const synthesisMessage = { id: idCounter.current++, type: 'thought' as const, content: 'Synthesizing final report...' };
  history.push(synthesisMessage);
  onUpdate(synthesisMessage);

  // Directly call synthesizeReport, passing an empty string for the outline.
  // The synthesis prompt will handle the lack of an outline.
  const finalReportData = await synthesizeReport(query, history, allCitations, mode, fileData, role, "");

  const uniqueCitations = Array.from(new Map(allCitations.map(c => [c.url, c])).values());
  const totalSearchUpdates = history.filter(h => h.type === 'search').length;
  const internalSearchCycles = initialSearchResult ? Math.max(0, totalSearchUpdates - 1) : totalSearchUpdates;

  return { 
    ...finalReportData, 
    citations: uniqueCitations,
    researchUpdates: history,
    searchCycles: internalSearchCycles
  };
};
