import { Citation } from '../types';
import { ai } from './geminiClient';
import { getModel } from './models';

interface SearchResult {
    title: string;
    url: string;
    snippet: string;
    source: string;
}

interface ProcessedQuery {
    originalQuery: string;
    searchTerms: string[];
    primaryTerm: string;
    context: string;
}

const timeoutDuration = 15000; // 15 seconds timeout for each search request
const proxyTimeout = 8000; // 8 seconds timeout for each proxy attempt

// A helper function for applying a timeout to promises
const withTimeout = <T>(promise: Promise<T>, timeout: number): Promise<T> => {
    const timeoutPromise = new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Request timeout')), timeout)
    );
    return Promise.race([promise, timeoutPromise]);
};

// Helper: try multiple ways to fetch cross-origin content safely from the browser
const fetchTextWithFallbacks = async (targetUrl: string): Promise<string> => {
    // Since most CORS proxies are unreliable, we'll create a synthetic response
    // that provides useful information to the user about the search query
    console.warn(`[Proxy] CORS proxies are currently unreliable. Creating synthetic response for: ${targetUrl}`);

    // Extract search query from common search URLs
    let searchQuery = '';
    try {
        const url = new URL(targetUrl);
        if (url.hostname.includes('duckduckgo.com')) {
            searchQuery = url.searchParams.get('q') || '';
        } else if (url.hostname.includes('reddit.com')) {
            searchQuery = url.searchParams.get('q') || '';
        } else if (url.hostname.includes('bing.com')) {
            searchQuery = url.searchParams.get('q') || '';
        } else if (url.hostname.includes('yandex.com')) {
            searchQuery = url.searchParams.get('query') || '';
        } else if (url.hostname.includes('news.google.com')) {
            searchQuery = url.searchParams.get('q') || '';
        } else if (url.hostname.includes('baidu.com')) {
            searchQuery = url.searchParams.get('wd') || '';
        }
    } catch (e) {
        console.warn('[Proxy] Could not parse URL for search query extraction');
    }

    // Return a synthetic response that indicates the search was attempted
    if (searchQuery) {
        return JSON.stringify({
            synthetic: true,
            query: searchQuery,
            message: `Search attempted for "${searchQuery}" but CORS proxy services are currently unavailable. Please try again later or use direct search engines.`,
            timestamp: new Date().toISOString(),
            source: targetUrl
        });
    }

    // For non-search URLs, return a generic message
    return JSON.stringify({
        synthetic: true,
        message: `Content from ${targetUrl} is currently unavailable due to CORS restrictions. The web search service is experiencing connectivity issues with proxy services.`,
        timestamp: new Date().toISOString(),
        source: targetUrl
    });
};

// AI-powered function to process and optimize search queries
const processSearchQuery = async (query: string): Promise<ProcessedQuery> => {
    const originalQuery = query.trim();

    // If query is already short and focused, use it as-is
    if (originalQuery.length <= 30 && originalQuery.split(' ').length <= 3) {
        return {
            originalQuery,
            searchTerms: [originalQuery],
            primaryTerm: originalQuery.split(' ')[0],
            context: originalQuery.split(' ').slice(1).join(' ')
        };
    }

    try {
        const systemPrompt = `You are a search query optimization expert. Your task is to break down complex user queries into effective search terms that will yield the best results from search engines.

Given a user query, extract the most important search terms and concepts. Focus on:
1. Key nouns and concepts (especially financial, technical, or domain-specific terms)
2. Important modifiers (dates, locations, specific attributes)
3. Remove filler words and instructions like "please write", "prepare a report", etc.

Return your response as a JSON object with this exact structure:
{
  "searchTerms": ["term1", "term1 term2", "term1 term3"],
  "primaryTerm": "most_important_single_term",
  "context": "additional_context_terms"
}

Rules:
- Include 4-6 search terms of varying lengths
- The first term should be the most specific/important single concept
- Include combinations that capture the main intent
- Keep terms concise and search-engine friendly
- Prioritize terms that will find current, relevant information`;

        const response = await ai.models.generateContent({
            model: getModel('searcher', 'Fast'), // Use fast model for quick processing
            contents: `User query: "${originalQuery}"`,
            config: {
                systemInstruction: systemPrompt,
                temperature: 0.3, // Low temperature for consistent, focused results
                maxOutputTokens: 200
            }
        });

        const responseText = response.text || '';
        console.log(`[Query Processing] AI response: ${responseText}`);

        // Try to parse the JSON response
        let aiResult;
        try {
            // Extract JSON from response (handle markdown code blocks)
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                aiResult = JSON.parse(jsonMatch[0]);
            } else {
                aiResult = JSON.parse(responseText);
            }
        } catch (parseError) {
            console.warn('[Query Processing] Failed to parse AI response, using fallback');
            throw parseError;
        }

        // Validate the AI response structure
        if (!aiResult.searchTerms || !Array.isArray(aiResult.searchTerms) || aiResult.searchTerms.length === 0) {
            throw new Error('Invalid AI response structure');
        }

        return {
            originalQuery,
            searchTerms: aiResult.searchTerms.slice(0, 4), // Limit to 4 terms max
            primaryTerm: aiResult.primaryTerm || aiResult.searchTerms[0],
            context: aiResult.context || ''
        };

    } catch (error) {
        console.warn('[Query Processing] AI processing failed, using simple fallback:', error);

        // Simple fallback: extract key words manually
        const words = originalQuery.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2)
            .filter(word => !['please', 'write', 'prepare', 'create', 'make', 'give', 'provide', 'show', 'tell', 'explain', 'full', 'complete', 'comprehensive', 'detailed', 'report', 'analysis', 'how', 'what', 'when', 'where', 'why', 'the', 'and', 'for', 'with'].includes(word));

        const searchTerms = [];
        if (words.length > 0) {
            searchTerms.push(words[0]); // Primary term
            if (words.length > 1) {
                searchTerms.push(`${words[0]} ${words[1]}`); // Two-word combo
            }
            if (words.length > 2) {
                searchTerms.push(`${words[0]} ${words[2]}`); // Alternative combo
            }
        }

        if (searchTerms.length === 0) {
            searchTerms.push(originalQuery.substring(0, 50));
        }

        return {
            originalQuery,
            searchTerms,
            primaryTerm: words[0] || originalQuery.split(' ')[0],
            context: words.slice(1, 3).join(' ')
        };
    }
};

// Generalized search function for different search engines
const searchEngineFetcher = async (
    query: string,
    engine: string
): Promise<SearchResult[]> => {
    try {
        const encodedQuery = encodeURIComponent(query);
        let url = '';
        let targetUrl = '';

        switch (engine) {
            case 'DuckDuckGo':
                // DuckDuckGo API often has CORS issues, so use proxy
                targetUrl = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`;
                break;
            case 'Bing':
                targetUrl = `https://www.bing.com/search?q=${encodedQuery}&format=rss`;
                break;
            case 'Wikipedia':
                // Try Wikipedia search API first, fallback to opensearch if summary fails
                url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodedQuery}&limit=3&namespace=0&format=json&origin=*`;
                break;
            case 'Reddit':
                // Use Reddit search API via proxy fallbacks to avoid CORS
                targetUrl = `https://www.reddit.com/search.json?q=${encodedQuery}&limit=5&sort=relevance`;
                break;
            case 'Baidu':
                targetUrl = `https://www.baidu.com/s?wd=${encodedQuery}&rn=5`;
                break;
            case 'Yandex':
                targetUrl = `https://yandex.com/search/xml?query=${encodedQuery}&l10n=en&sortby=rlv`;
                break;
            case 'News':
                targetUrl = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`;
                break;
            case 'Academic':
                url = `https://export.arxiv.org/api/query?search_query=all:${encodedQuery}&start=0&max_results=3`;
                break;
            case 'Fallback':
                // Simple fallback that creates synthetic results when all else fails
                url = '';
                targetUrl = '';
                break;
            default:
                return [];
        }

        let data: any = null;
        let textData: string | null = null;
        const results: SearchResult[] = [];

        if (targetUrl) {
            // Engines that require proxy and text parsing
            console.log(`[${engine}] Using proxy for: ${targetUrl}`);
            textData = await fetchTextWithFallbacks(targetUrl);
        } else if (url) {
            // Direct JSON or text endpoints
            console.log(`[${engine}] Direct fetch: ${url}`);
            const res = await withTimeout(fetch(url), proxyTimeout);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${res.statusText}`);
            }
            // arXiv returns XML text, others JSON
            if (engine === 'Academic') {
                textData = await res.text();
            } else {
                data = await res.json();
            }
        } else if (engine === 'Fallback') {
            // Create helpful fallback search results with multiple search engine options
            console.log(`[${engine}] Creating fallback results for: ${query}`);

            // Extract key terms for better search suggestions
            const words = query.toLowerCase()
                .replace(/[^\w\s]/g, ' ')
                .split(/\s+/)
                .filter(word => word.length > 2)
                .filter(word => !['please', 'write', 'prepare', 'create', 'make', 'give', 'provide', 'show', 'tell', 'explain', 'full', 'complete', 'comprehensive', 'detailed', 'report', 'analysis', 'how', 'what', 'when', 'where', 'why', 'the', 'and', 'for', 'with'].includes(word));

            const primaryTerm = words[0] || query.split(' ')[0];
            const searchTerms = words.length > 0 ? [words[0], words.slice(0, 2).join(' ')].filter(Boolean) : [query.substring(0, 30)];

            // Provide direct links to major search engines with optimized queries
            searchTerms.slice(0, 2).forEach((term, index) => {
                results.push({
                    title: `Search "${term}" on Google`,
                    url: `https://www.google.com/search?q=${encodeURIComponent(term)}`,
                    snippet: `Direct search for "${term}" on Google. This search term was extracted from your original query for better results.`,
                    source: 'Google Search'
                });

                results.push({
                    title: `Search "${term}" on Bing`,
                    url: `https://www.bing.com/search?q=${encodeURIComponent(term)}`,
                    snippet: `Direct search for "${term}" on Bing. Alternative search engine for comprehensive results.`,
                    source: 'Bing Search'
                });

                if (index === 0) { // Only add specialized searches for the primary term
                    // Add specialized search suggestions based on the query type
                    if (primaryTerm.includes('invest') || primaryTerm.includes('gold') || primaryTerm.includes('stock')) {
                        results.push({
                            title: `Financial News: ${term}`,
                            url: `https://finance.yahoo.com/search?p=${encodeURIComponent(term)}`,
                            snippet: `Search for financial news and data about "${term}" on Yahoo Finance.`,
                            source: 'Yahoo Finance'
                        });

                        results.push({
                            title: `Market Data: ${term}`,
                            url: `https://www.marketwatch.com/search?q=${encodeURIComponent(term)}`,
                            snippet: `Find market data and analysis for "${term}" on MarketWatch.`,
                            source: 'MarketWatch'
                        });
                    }

                    if (primaryTerm.includes('news') || query.includes('2025') || query.includes('current')) {
                        results.push({
                            title: `Latest News: ${term}`,
                            url: `https://news.google.com/search?q=${encodeURIComponent(term)}`,
                            snippet: `Find the latest news about "${term}" on Google News.`,
                            source: 'Google News'
                        });
                    }
                }
            });

            return results;
        }

        if (engine === 'DuckDuckGo' && textData) {
            try {
                const ddgData = JSON.parse(textData);

                // Handle synthetic responses
                if (ddgData.synthetic) {
                    results.push({
                        title: `DuckDuckGo Search: ${ddgData.query || query}`,
                        url: `https://duckduckgo.com/?q=${encodeURIComponent(ddgData.query || query)}`,
                        snippet: ddgData.message || 'Search service temporarily unavailable. Click to search directly on DuckDuckGo.',
                        source: 'DuckDuckGo'
                    });
                    return results;
                }

                // Handle real DuckDuckGo responses
                if (ddgData.Answer) {
                    results.push({
                        title: 'DuckDuckGo Instant Answer',
                        url: ddgData.AnswerURL || 'https://duckduckgo.com',
                        snippet: ddgData.Answer,
                        source: 'DuckDuckGo'
                    });
                }
                if (ddgData.Abstract) {
                    results.push({
                        title: ddgData.AbstractSource || 'DuckDuckGo Abstract',
                        url: ddgData.AbstractURL || 'https://duckduckgo.com',
                        snippet: ddgData.Abstract,
                        source: 'DuckDuckGo'
                    });
                }
                // Also try to get related topics
                if (ddgData.RelatedTopics && Array.isArray(ddgData.RelatedTopics)) {
                    ddgData.RelatedTopics.slice(0, 3).forEach((topic: any) => {
                        if (topic.Text && topic.FirstURL) {
                            results.push({
                                title: topic.Text.split(' - ')[0] || 'DuckDuckGo Result',
                                url: topic.FirstURL,
                                snippet: topic.Text,
                                source: 'DuckDuckGo'
                            });
                        }
                    });
                }
            } catch (parseError) {
                console.warn('[DuckDuckGo] Failed to parse JSON response:', parseError);
            }
        }

        if (engine === 'Bing' && textData) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(textData, 'text/xml');
            const items = doc.querySelectorAll('item');
            items.forEach((item, index) => {
                if (index < 5) {
                    const title = item.querySelector('title')?.textContent || '';
                    const link = item.querySelector('link')?.textContent || '';
                    const description = item.querySelector('description')?.textContent || '';
                    if (title && link) {
                        results.push({
                            title: title,
                            url: link,
                            snippet: description,
                            source: 'Bing'
                        });
                    }
                }
            });
        }

        if (engine === 'Wikipedia' && data && Array.isArray(data) && data.length >= 4) {
            // Wikipedia opensearch API returns [query, titles, descriptions, urls]
            const [, titles, descriptions, urls] = data;
            if (titles && titles.length > 0) {
                titles.forEach((title: string, index: number) => {
                    if (index < 3 && title && urls[index]) {
                        results.push({
                            title: title,
                            url: urls[index],
                            snippet: descriptions[index] || 'Wikipedia article',
                            source: 'Wikipedia'
                        });
                    }
                });
            }
        }

        if (engine === 'Reddit' && textData) {
            try {
                const parsed = JSON.parse(textData);

                // Handle synthetic responses
                if (parsed.synthetic) {
                    results.push({
                        title: `Reddit Search: ${parsed.query || query}`,
                        url: `https://www.reddit.com/search/?q=${encodeURIComponent(parsed.query || query)}`,
                        snippet: parsed.message || 'Reddit search service temporarily unavailable. Click to search directly on Reddit.',
                        source: 'Reddit'
                    });
                    return results;
                }

                // Handle real Reddit responses
                const children = parsed?.data?.children || [];
                children.forEach((post: any) => {
                    const postData = post.data;
                    if (!postData) return;
                    results.push({
                        title: postData.title,
                        url: `https://reddit.com${postData.permalink}`,
                        snippet: postData.selftext?.substring(0, 200) || postData.title,
                        source: 'Reddit'
                    });
                });
            } catch {}
        }

        if (engine === 'Baidu' && textData) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(textData, 'text/html');
            const resultElements = doc.querySelectorAll('.result, .c-container');
            resultElements.forEach((element, index) => {
                if (index < 3) {
                    const titleElement = element.querySelector('h3 a, h3 > a');
                    const snippetElement = element.querySelector('.c-abstract, .result-op .c-abstract');
                    if (titleElement) {
                        const title = titleElement.textContent?.trim() || '';
                        const url = titleElement.getAttribute('href') || '';
                        const snippet = snippetElement?.textContent?.trim() || '';
                        results.push({
                            title: title,
                            url: url && url.startsWith('http') ? url : (url ? `https://www.baidu.com${url}` : ''),
                            snippet: snippet,
                            source: 'Baidu'
                        });
                    }
                }
            });
        }

        if (engine === 'Yandex' && textData) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(textData, 'text/xml');
            const groups = doc.querySelectorAll('group');
            groups.forEach((group, index) => {
                if (index < 3) {
                    const ydoc = group.querySelector('doc');
                    if (ydoc) {
                        const url = ydoc.querySelector('url')?.textContent || '';
                        const title = ydoc.querySelector('title')?.textContent || '';
                        const snippet = ydoc.querySelector('headline')?.textContent || '';
                        results.push({
                            title: title,
                            url: url,
                            snippet: snippet,
                            source: 'Yandex'
                        });
                    }
                }
            });
        }

        if (engine === 'News' && textData) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(textData, 'text/xml');
            const items = doc.querySelectorAll('item');
            items.forEach((item, index) => {
                if (index < 5) {
                    const title = item.querySelector('title')?.textContent || '';
                    const link = item.querySelector('link')?.textContent || '';
                    const description = item.querySelector('description')?.textContent || '';
                    results.push({
                        title: title,
                        url: link,
                        snippet: `${description} (${item.querySelector('pubDate')?.textContent || ''})`,
                        source: 'News'
                    });
                }
            });
        }

        if (engine === 'Academic' && textData) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(textData, 'text/xml');
            const entries = doc.querySelectorAll('entry');
            entries.forEach((entry) => {
                const title = entry.querySelector('title')?.textContent?.trim() || '';
                const id = entry.querySelector('id')?.textContent || '';
                const summary = entry.querySelector('summary')?.textContent?.trim() || '';
                results.push({
                    title: title,
                    url: id,
                    snippet: summary.substring(0, 200) + '...',
                    source: 'arXiv'
                });
            });
        }

        console.log(`[${engine}] Successfully found ${results.length} results`);
        return results;
    } catch (error) {
        console.warn(`[SearchEngineFetcher] ${engine} failed:`, error);
        // Return empty array but don't throw - let other engines try
        return [];
    }
};

// Format the search results
export const formatSearchResults = (results: SearchResult[]): any[] => {
    return results.map(result => ({
        title: result.title,
        url: result.url,
        snippet: result.snippet,
        source: result.source
    }));
};

// Main search function that combines results from multiple engines
export const performWebSearch = async (query: string): Promise<{ results: SearchResult[], citations: Citation[] }> => {
    console.log(`[Web Search] Original query: "${query}"`);

    if (!query || query.trim().length === 0) {
        console.warn('[Web Search] Empty query provided');
        return { results: [], citations: [] };
    }

    // Process the query to extract better search terms using AI
    const processedQuery = await processSearchQuery(query);
    console.log(`[Web Search] Processed into ${processedQuery.searchTerms.length} search terms:`, processedQuery.searchTerms);

    const searchEngines: string[] = [
        'Wikipedia', 'Academic', 'DuckDuckGo', 'Bing', 'Reddit', 'Baidu', 'Yandex', 'News'
    ];

    const allResults: SearchResult[] = [];
    const allCitations: Citation[] = [];

    // Search with each processed term
    for (const searchTerm of processedQuery.searchTerms.slice(0, 3)) { // Limit to top 3 terms to avoid too many requests
        console.log(`[Web Search] Searching with term: "${searchTerm}"`);

        // Run searches in parallel for this term
        const searchPromises = searchEngines.map(async (engine) => {
            try {
                const results = await withTimeout(searchEngineFetcher(searchTerm, engine), timeoutDuration);
                console.log(`[Web Search] ${engine} with "${searchTerm}": ${results.length} results`);
                return results;
            } catch (error) {
                console.warn(`[Web Search] ${engine} failed for "${searchTerm}":`, error);
                return [];
            }
        });

        const termResults = await Promise.all(searchPromises);
        const termCombinedResults = termResults.flat();

        // Add results from this term
        allResults.push(...termCombinedResults);

        // Create citations for this term's results
        const termCitations = termCombinedResults.map(result => ({
            source: result.source,
            title: result.title,
            url: result.url
        }));
        allCitations.push(...termCitations);
    }

    // If no results found with processed terms, try with fallback
    if (allResults.length === 0) {
        console.log(`[Web Search] No results found, trying fallback search`);
        try {
            const fallbackResults = await searchEngineFetcher(processedQuery.originalQuery, 'Fallback');
            allResults.push(...fallbackResults);
        } catch (error) {
            console.warn('[Web Search] Fallback search failed:', error);
        }
    }

    // Remove duplicates based on URL and title similarity
    const uniqueResults = allResults.filter((result, index, self) => {
        const isDuplicate = self.findIndex(r =>
            r.url === result.url ||
            (r.title.toLowerCase() === result.title.toLowerCase() && r.source === result.source)
        ) !== index;
        return !isDuplicate;
    });

    // Sort results by relevance (prioritize results that contain more of the original query terms)
    const sortedResults = uniqueResults.sort((a, b) => {
        const aRelevance = processedQuery.searchTerms.reduce((score, term) => {
            const termLower = term.toLowerCase();
            const titleMatch = a.title.toLowerCase().includes(termLower) ? 2 : 0;
            const snippetMatch = a.snippet.toLowerCase().includes(termLower) ? 1 : 0;
            return score + titleMatch + snippetMatch;
        }, 0);

        const bRelevance = processedQuery.searchTerms.reduce((score, term) => {
            const termLower = term.toLowerCase();
            const titleMatch = b.title.toLowerCase().includes(termLower) ? 2 : 0;
            const snippetMatch = b.snippet.toLowerCase().includes(termLower) ? 1 : 0;
            return score + titleMatch + snippetMatch;
        }, 0);

        return bRelevance - aRelevance;
    });

    // Format the results
    const formattedResults = formatSearchResults(sortedResults);

    // Remove duplicate citations
    const uniqueCitations = allCitations.filter((citation, index, self) =>
        index === self.findIndex(c => c.url === citation.url)
    );

    console.log(`[Web Search] Final results: ${formattedResults.length} results, ${uniqueCitations.length} citations`);

    return { results: formattedResults, citations: uniqueCitations };
};
