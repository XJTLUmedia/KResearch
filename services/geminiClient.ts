
import { apiKeyService, AllKeysFailedError } from "./apiKeyService";
import OpenAI from 'openai';
import { GenerateContentResponse } from "@google/genai";
import { performWebSearch, formatSearchResults } from "./webSearchService";

// Helper to get a clean error message from various error types
const getCleanErrorMessage = (error: any): string => {
    if (!error) return 'An unknown error occurred.';
    if (typeof error === 'string') return error;

    if (error.message && typeof error.message === 'string') {
        try {
            const parsed = JSON.parse(error.message);
            return parsed?.error?.message || error.message;
        } catch (e) {
            return error.message;
        }
    }
    if (error.str && typeof error.str === 'string') return error.str;
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error !== null) {
        try { return JSON.stringify(error, null, 2); }
        catch { return 'Received an un-stringifiable error object.'; }
    }
    return String(error);
};

// Helper to sanitize potentially large objects for logging
const sanitizeForLogging = (obj: any, truncateLength: number = 500) => {
    if (!obj) return obj;
    try {
        return JSON.parse(JSON.stringify(obj, (key, value) => {
            if (typeof value === 'string' && value.length > truncateLength) {
                return value.substring(0, truncateLength) + '...[TRUNCATED]';
            }
            return value;
        }));
    } catch (e) {
        return { error: "Failed to sanitize for logging" };
    }
};

// Formats the flexible `contents` parameter from the SDK style to the strict REST API style
function formatContentsForRest(contents: any): any[] {
    if (typeof contents === 'string') {
        return [{ role: 'user', parts: [{ text: contents }] }];
    }
    if (Array.isArray(contents)) {
        return contents; // Assumes it's already a Content[] array
    }
    if (typeof contents === 'object' && contents !== null && contents.parts) {
        // A single Content object, wrap it in an array and default the role
        return [{ role: contents.role || 'user', parts: contents.parts }];
    }
    console.warn("Unknown contents format, passing through:", contents);
    return [contents];
}

// Maps the SDK-style `params` object to a REST API-compatible request body
function mapToRestBody(params: any): object {
    const body: any = {};
    if (params.contents) {
        body.contents = formatContentsForRest(params.contents);
    }
    if (params.config) {
        const { systemInstruction, tools, ...generationConfig } = params.config;
        if (Object.keys(generationConfig).length > 0) {
            body.generationConfig = generationConfig;
        }
        if (systemInstruction) {
            body.systemInstruction = { parts: [{ text: systemInstruction }] };
        }
        if (tools) body.tools = tools;
    }
    return body;
}

const operationToRestMethod: Record<string, string> = {
    'generateContent': 'generateContent',
};

// The core executor with retry logic, now using `fetch` instead of the SDK
async function executeWithRetry(operationName: string, params: any): Promise<any> {
    const keys = apiKeyService.getApiKeys();
    if (keys.length === 0) {
        throw new Error("No API keys provided. Please add at least one key in the application settings.");
    }

    const maxRetriesPerKeyCycle = 3;
    const maxAttempts = keys.length * maxRetriesPerKeyCycle;
    let lastError: any = null;
    const baseUrl = apiKeyService.getApiBaseUrl();
    const modelName = params.model;
    const restMethod = operationToRestMethod[operationName];

    if (!modelName || !restMethod) {
        throw new Error(`Invalid model or operation for API call: ${modelName}, ${operationName}`);
    }

    const url = `${baseUrl}/v1beta/models/${modelName}:${restMethod}`;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const key = apiKeyService.getNextApiKey();
        if (!key) continue;

        console.log(`[API Request] URL: ${url}, Attempt: ${attempt}/${maxAttempts}, Key: ...${key.slice(-4)}`);
        console.log(`[API Request] Parameters:`, sanitizeForLogging(params, 4000));

        try {
            const body = mapToRestBody(params);
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
                body: JSON.stringify(body)
            });

            const responseText = await response.text();

            if (!response.ok) {
                let errorData;
                try {
                    errorData = JSON.parse(responseText);
                } catch {
                    const err = new Error(`API Error: ${response.status} - ${responseText}`);
                    (err as any).status = response.status;
                    throw err;
                }
                const err = new Error(errorData?.error?.message || `API Error: ${response.status}`);
                (err as any).status = response.status;
                (err as any).data = errorData;
                throw err;
            }
            
            const result = JSON.parse(responseText);

            const sdkLikeResponse = {
                ...result,
                text: result?.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
            };

            console.log(`[API Success] Operation: ${operationName}`);
            console.log(`[API Response]:`, sanitizeForLogging(sdkLikeResponse));
            apiKeyService.reset(); // Reset key rotation for next independent operation
            return sdkLikeResponse;

        } catch (error: any) {
            const errorMessage = getCleanErrorMessage(error);
            console.warn(`[API Call Failed: Attempt ${attempt}/${maxAttempts}] Operation: '${operationName}' with key ...${key.slice(-4)}. Error: ${errorMessage}`);
            lastError = error;
            
            if (error.status === 429) {
                // Rate limit error, let's wait and retry
                const currentCycle = Math.floor((attempt - 1) / keys.length) + 1;
                let delayMs = 2000 * currentCycle; // Exponential backoff based on how many times we've cycled through all keys

                const retryInfo = error.data?.error?.details?.find(
                    (d: any) => d['@type'] === 'type.googleapis.com/google.rpc.RetryInfo'
                );

                if (retryInfo?.retryDelay) {
                    const secondsMatch = retryInfo.retryDelay.match(/(\d+)/);
                    if (secondsMatch && secondsMatch[1]) {
                        const delaySeconds = parseInt(secondsMatch[1], 10);
                        delayMs = delaySeconds * 1000 + 500; // Add 500ms buffer
                        console.log(`[API Retry] Rate limit hit. Respecting 'retryDelay' of ${delaySeconds}s. Waiting...`);
                    }
                } else {
                    console.log(`[API Retry] Rate limit hit. Applying exponential backoff of ${delayMs}ms. Waiting...`);
                }
                
                await new Promise(resolve => setTimeout(resolve, delayMs));
                // Continue to the next attempt after the delay
            }
        }
    }

    const finalErrorMessage = getCleanErrorMessage(lastError);
    console.error(`[API Error: All Keys Failed] Operation: '${operationName}'. Last error: ${finalErrorMessage}`);
    console.error(`[API Error] Failed Parameters:`, sanitizeForLogging(params, 4000));
    throw new AllKeysFailedError(`All API keys failed. Last error: ${finalErrorMessage}`);
}

// OpenRouter API integration using OpenAI SDK-compatible client

// Convert Gemini-style parameters to OpenAI-style parameters
const convertToOpenAIParams = (params: any) => {
    const messages: any[] = [];

    // Handle system instruction
    if (params.config?.systemInstruction) {
        messages.push({
            role: 'system',
            content: params.config.systemInstruction
        });
    }
    // If caller expects JSON (Gemini's responseMimeType/responseSchema), enforce via system msg for OpenRouter
    if (params.config?.responseMimeType === 'application/json' || params.config?.responseSchema) {
        const schemaHint = params.config?.responseSchema ? (() => {
            try { return JSON.stringify(params.config.responseSchema).slice(0, 2000); } catch { return ''; }
        })() : '';
        const jsonRules = `You MUST respond with a single valid JSON object only. Do not include markdown fences, prefixes, or prose. ${schemaHint ? `It MUST conform to this JSON Schema (approximate): ${schemaHint}` : ''}`;
        messages.push({ role: 'system', content: jsonRules });
    }

    // Handle contents
    if (params.contents) {
        const contents = Array.isArray(params.contents) ? params.contents : [params.contents];
        for (const content of contents) {
            if (typeof content === 'string') {
                messages.push({ role: 'user', content });
            } else if (content.parts) {
                const textContent = content.parts.map((part: any) => part.text).join('');
                messages.push({
                    role: content.role === 'model' ? 'assistant' : 'user',
                    content: textContent
                });
            }
        }
    }

    // Handle tools - OpenRouter doesn't have Google Search tools like Gemini
    // For search queries, we'll modify the prompt to indicate this is a search request
    let finalMessages = [...messages];
    if (params.config?.tools && params.config.tools.some((tool: any) => tool.googleSearch)) {
        // Modify the user message to indicate this is a search request
        for (let i = finalMessages.length - 1; i >= 0; i--) {
            if (finalMessages[i].role === 'user') {
                finalMessages[i].content = `Please provide a comprehensive response based on your knowledge for: ${finalMessages[i].content}. Include relevant facts, statistics, and information as if you were summarizing from multiple reliable sources.`;
                break;
            }
        }
    }

    return {
        model: params.model,
        messages: finalMessages,
        temperature: params.config?.temperature,
        max_tokens: params.config?.maxOutputTokens,
    };
};

// Helper: derive a plain-text prompt from messages for /completions fallback
const buildPromptFromMessages = (messages: { role: string; content: string }[]): string => {
    return messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
};

// OpenRouter API executor with retry logic
async function executeOpenRouterWithRetry(operationName: string, params: any): Promise<any> {
    const keys = apiKeyService.getApiKeys();
    if (keys.length === 0) {
        throw new Error("No API keys provided. Please add at least one key in the application settings.");
    }

    const maxRetriesPerKeyCycle = 3;
    const maxAttempts = keys.length * maxRetriesPerKeyCycle;
    let lastError: any = null;

    console.log(`[OpenRouter API Request] Operation: ${operationName}`);
    console.log(`[OpenRouter API Request] Parameters:`, sanitizeForLogging(params, 4000));

    // Check if this is a search request
    const isSearchRequest = params.config?.tools?.some((tool: any) => tool.googleSearch);
    let searchResults: any = null;
    let searchCitations: any[] = [];

    if (isSearchRequest) {
        try {
            // Extract search query from the content
            let searchQuery = typeof params.contents === 'string'
                ? params.contents
                : Array.isArray(params.contents)
                    ? params.contents.map((c: any) => typeof c === 'string' ? c : c.parts?.map((p: any) => p.text).join('')).join(' ')
                    : '';

            // Extract the actual search query from patterns like 'Concisely summarize key information for the query: "actual query"'
            const queryMatch = searchQuery.match(/(?:query|search):\s*["']([^"']+)["']/i);
            if (queryMatch) {
                searchQuery = queryMatch[1];
            }

            console.log(`[OpenRouter Web Search] Performing web search for: "${searchQuery}"`);
            const webSearchResult = await performWebSearch(searchQuery);
            searchResults = webSearchResult.results;
            searchCitations = webSearchResult.citations;

            // Enhance the prompt with search results
            const searchContext = formatSearchResults(searchResults);
            const enhancedContent = `${params.contents}\n\nWeb Search Results:\n${searchContext}\n\nPlease provide a comprehensive response based on the above search results and your knowledge.`;
            params = { ...params, contents: enhancedContent };
        } catch (searchError) {
            console.warn('[OpenRouter Web Search] Search failed, proceeding without search results:', searchError);
        }
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const key = apiKeyService.getNextApiKey();
        if (!key) continue;

        console.log(`[OpenRouter API Request] Attempt: ${attempt}/${maxAttempts}, Key: ...${key.slice(-4)}`);

        try {
            const client = new OpenAI({
                baseURL: apiKeyService.getApiBaseUrl() || 'https://openrouter.ai/api/v1',
                apiKey: key,
                dangerouslyAllowBrowser: true, // Required for client-side usage
            });

            const openAIParams = convertToOpenAIParams(params);
            const response = await client.chat.completions.create(openAIParams);

            // Convert OpenAI response to Gemini-like format
            const responseText = response.choices[0]?.message?.content || '';
            const geminiLikeResponse = {
                candidates: [{
                    content: {
                        parts: [{
                            text: responseText
                        }]
                    },
                    // For search requests, include real grounding metadata from web search
                    groundingMetadata: isSearchRequest && searchCitations.length > 0 ? {
                        groundingChunks: searchCitations.map((citation: any) => ({
                            web: {
                                uri: citation.url,
                                title: citation.title
                            }
                        }))
                    } : undefined
                }],
                text: responseText,
                usage: response.usage
            };

            console.log(`[OpenRouter API Success] Operation: ${operationName}`);
            console.log(`[OpenRouter API Response]:`, sanitizeForLogging(geminiLikeResponse));
            apiKeyService.reset();
            return geminiLikeResponse;

        } catch (error: any) {
            const errorMessage = getCleanErrorMessage(error);
            console.warn(`[OpenRouter API Call Failed: Attempt ${attempt}/${maxAttempts}] Operation: '${operationName}' with key ...${key.slice(-4)}. Error: ${errorMessage}`);

            // Fallback: try the /completions endpoint with a synthetic prompt
            try {
                const base = apiKeyService.getApiBaseUrl() || 'https://openrouter.ai/api/v1';
                const openAIParams = convertToOpenAIParams(params);
                const prompt = buildPromptFromMessages(openAIParams.messages);
                const resp = await fetch(`${base}/completions`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${key}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: openAIParams.model,
                        prompt,
                        temperature: openAIParams.temperature,
                        max_tokens: openAIParams.max_tokens,
                    }),
                });
                const raw = await resp.text();
                if (!resp.ok) {
                    const err = new Error(`OpenRouter /completions error: ${resp.status} - ${raw}`);
                    (err as any).status = resp.status;
                    throw err;
                }
                const data = JSON.parse(raw);
                const completionText = data.choices?.[0]?.text || data.choices?.[0]?.message?.content || '';
                const geminiLikeResponse = {
                    candidates: [{
                        content: { parts: [{ text: completionText }] },
                        groundingMetadata: isSearchRequest && searchCitations.length > 0 ? {
                            groundingChunks: searchCitations.map((citation: any) => ({
                                web: { uri: citation.url, title: citation.title }
                            }))
                        } : undefined
                    }],
                    text: completionText,
                    usage: data.usage,
                };
                console.log(`[OpenRouter API Success via /completions] Operation: ${operationName}`);
                apiKeyService.reset();
                return geminiLikeResponse;
            } catch (fallbackErr) {
                // If fallback also fails, record and continue to retry logic
                console.warn(`[OpenRouter /completions Fallback Failed] ${getCleanErrorMessage(fallbackErr)}`);
                lastError = error;
            }

            if (error.status === 429) {
                const currentCycle = Math.floor((attempt - 1) / keys.length) + 1;
                const delayMs = 2000 * currentCycle;
                console.log(`[OpenRouter API Retry] Rate limit hit. Applying exponential backoff of ${delayMs}ms. Waiting...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    const finalErrorMessage = getCleanErrorMessage(lastError);
    console.error(`[OpenRouter API Error: All Keys Failed] Operation: '${operationName}'. Last error: ${finalErrorMessage}`);
    console.error(`[OpenRouter API Error] Failed Parameters:`, sanitizeForLogging(params, 4000));
    throw new AllKeysFailedError(`All API keys failed. Last error: ${finalErrorMessage}`);
}

// Determine which API to use based on model name
const isOpenRouterModel = (modelName: string): boolean => {
    return !modelName.includes('gemini'); // treat non-Gemini as OpenRouter
};

// Unified AI client that routes to appropriate API
export const ai = {
    models: {
        generateContent: (params: any): Promise<GenerateContentResponse> => {
            // Any non-Gemini model will route to OpenRouter
            if (isOpenRouterModel(params.model)) {
                return executeOpenRouterWithRetry('generateContent', params);
            }
            return executeWithRetry('generateContent', params);
        },
        // Other methods like generateContentStream, generateImages, and chats are not used
        // by the app and are omitted to avoid implementing their fetch-based logic.
    },
};
