
import { ai } from './geminiClient';
import { getModel } from './models';
import { parseJsonFromMarkdown } from './utils';

export const generateNameAndEmoji = async (prompt: string): Promise<{ name: string; emoji: string }> => {
    const systemPrompt = `Analyze the user's role prompt. Based on its content, suggest a short, catchy name (3 words max) and a single, representative emoji.
Your response MUST be a single, valid JSON object and nothing else, like this: { "name": "Creative Writer", "emoji": "✍️" }`;

    const nameAndEmojiSchema = {
        type: 'object',
        properties: {
            name: { type: 'string' },
            emoji: { type: 'string' }
        },
        required: ['name', 'emoji']
    };

    const response = await ai.models.generateContent({
        model: getModel('roleAI', 'Balanced'),
        contents: prompt,
        config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json",
            responseSchema: nameAndEmojiSchema,
            temperature: 0.8,
        }
    });

    const parsed = parseJsonFromMarkdown(response.text || '');
    if (!parsed || !parsed.name || !parsed.emoji) {
        throw new Error("AI failed to generate a valid name and emoji object.");
    }
    return parsed;
};


export const optimizePrompt = async (prompt: string, mode: 'creative' | 'refine', roleName?: string): Promise<string> => {
    const baseInstruction = "You are an expert prompt engineer. Your task is to rewrite or generate a user-provided prompt to be a highly effective, detailed directive for a sophisticated AI research agent.";

    const modeInstruction = mode === 'creative'
        ? `
Your goal is to generate a comprehensive, open-ended, deep-research prompt.
- If the user provides an existing prompt, enhance it by adding new dimensions, suggesting specific research methodologies (e.g., "start with a historical analysis, then a competitive landscape review"), and defining a clear structure for the final report.
- If the user provides ONLY a role name, create a full research directive from scratch for that persona.

The generated prompt must guide the AI on *what* to search for (specific data points, primary sources, expert opinions, contrarian views) and *how* to synthesize it. The final prompt should be substantial and detailed, giving the AI a clear mission and structure for its report.

--- EXAMPLES ---

**Example 1: From Role Name**
*   User Input Role Name: "Tech Futurist"
*   Ideal Output Prompt: "You are a Tech Futurist, specializing in identifying and extrapolating long-term technology trends. Your research should begin by establishing the current state-of-the-art for the user's query. Then, identify the key players (companies, researchers) and inflection points. The core of your research is to synthesize these findings to forecast the technology's trajectory over the next 5, 10, and 20 years. Your final report must include a 'Future Scenarios' section with optimistic, pessimistic, and most-likely outcomes, complete with supporting data and reasoning."

**Example 2: From Role Name**
*   User Input Role Name: "Investment Analyst"
*   Ideal Output Prompt: "You are a sharp-eyed Investment Analyst. Your research must assess the complete market landscape for the user's query. This includes identifying the total addressable market (TAM), key competitors, pricing strategies, and target customer segments. A core part of your report must be a SWOT analysis (Strengths, Weaknesses, Opportunities, Threats). Conclude with a clear 'Investment Thesis' section that provides a 'Buy', 'Hold', or 'Sell' recommendation based on your findings."

**Example 3: Enhancing an existing prompt**
*   User Input Prompt: "You are a historian. Write about the topic."
*   Ideal Output Prompt: "You are a meticulous Historian. Your research must place the user's query within its full historical context. Your methodology should be: 1. Identify the key figures, events, and antecedent conditions. 2. Establish a clear timeline of developments. 3. Analyze the primary sources from the period, noting their biases. Your final report must be structured chronologically, explaining the cause-and-effect relationships that shaped the topic. Conclude with a section on the topic's lasting legacy and historical significance."
---`
        : `Crucially, DO NOT add new instructions or change the core intent. Simply refine the existing text for maximum impact and clarity. Polish the language, improve the structure, and make it a more effective and direct directive for an AI agent. Ensure the prompt is at least 100 characters long if you have to expand on it.`;

    const systemPrompt = `${baseInstruction}\n\n${modeInstruction}\n\nYour final output MUST be only the text of the rewritten prompt. Do not add any conversational text, explanations, or markdown formatting.`;
    
    const contentForAI = prompt 
        ? `Role Name: "${roleName || 'Unnamed'}"\n\nExisting Prompt to Enhance:\n---\n${prompt}`
        : `Role Name: "${roleName}"\n\nExisting Prompt: [NONE - Please generate a new, detailed deep-research prompt from the role name.]`;

    const response = await ai.models.generateContent({
        model: getModel('roleAI', 'Balanced'),
        contents: contentForAI,
        config: {
            systemInstruction: systemPrompt,
            temperature: mode === 'creative' ? 0.8 : 0.3
        }
    });
    
    if (!response.text) {
        throw new Error("AI failed to return an optimized prompt.");
    }

    return response.text.trim();
};