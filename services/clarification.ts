import { ai } from './geminiClient';
import { getModel } from './models';
import { parseJsonFromMarkdown } from './utils';
import { ResearchMode, FileData, ClarificationTurn, Citation, Role } from '../types';

export interface ClarificationResponse {
    type: 'question' | 'summary';
    content: string;
}

const getRoleContext = (role: Role | null): string => {
    if (!role) return '';
    return `
**Primary Role Directive:**
You must adopt the following persona and instructions for this entire task. This directive is your primary guide.
<ROLE_INSTRUCTIONS>
${role.prompt}
</ROLE_INSTRUCTIONS>
`;
};

export const clarifyQuery = async (
    history: ClarificationTurn[],
    mode: ResearchMode,
    fileData: FileData | null,
    role: Role | null,
    initialSearchResult: { text: string, citations: Citation[] } | null
): Promise<ClarificationResponse> => {
    // --- STEP 1: Generate the clarification text ---
        const searchContext = initialSearchResult
        ? `
**Initial Search Context (To Avoid Redundancy):**
An initial search on the topic has already been performed, yielding this summary:
<SEARCH_SUMMARY>
${initialSearchResult.text}
</SEARCH_SUMMARY>
Use this context to ask a more specific question. DO NOT ask about things already covered in this summary.`
        : '';
    
    const roleContext = getRoleContext(role);

    const generationPrompt = `You are a Research Analyst AI. Your primary goal is to help a user refine a broad research topic into a specific, actionable research angle by asking clarifying questions. Your responses must be in English.
${roleContext}
${searchContext}
**Workflow:**
1.  You will receive a user's research query and the conversation history.
2.  Critically analyze the query to identify its core subject and potential areas of focus.
3.  **If the query is broad (e.g., "AI in healthcare"), ask a targeted question to present distinct, meaningful sub-topics.**
4.  **If the user has provided enough detail or after 1-2 clarifying questions, provide a final, refined research topic summary.** This summary will be used to guide the research.
5.  If the user explicitly states they want information on "everything" or provides a very broad but clear topic without wanting to narrow it down, your final summary should reflect this broad scope.

**CRITICAL RULES:**
-   **DO NOT ask for definitions.** You are expected to know what terms mean or to figure it out. Your role is to narrow scope, not to learn basic concepts from the user. For example, if the query is "What is the future of the 'Rabbit R1' device?", DO NOT ask "What is a 'Rabbit R1' device?". Instead, ask a question like "Are you more interested in the 'Rabbit R1's' technical specifications and hardware, its market reception and sales performance, or its long-term impact on the AI hardware industry?"
-   **Your questions must be about scoping the research, not about facts.**
-   Your output must be ONLY the plain text of your question or your summary.
-   Do NOT add any conversational filler, introductory phrases, or markdown formatting.

Example output for a question:
Are you more interested in the commercial applications of quantum computing or the theoretical physics behind it?

Example output for a summary:
The user wants to research the impact of recent advancements in large language models on the software development industry, focusing on code generation and automated testing tools.`;
    
    const contents = history.map((turn, index) => {
        const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [{ text: turn.content }];
        // Add research file
        if (turn.role === 'user' && index === 0 && fileData) {
            parts.push({ inlineData: { mimeType: fileData.mimeType, data: fileData.data } });
        }
        // Add role file
        if (turn.role === 'user' && index === 0 && role?.file) {
            parts.push({ inlineData: { mimeType: role.file.mimeType, data: role.file.data } });
        }
        return { role: turn.role, parts: parts };
    });

    const generationResponse = await ai.models.generateContent({
        model: getModel('clarification', mode),
        contents: contents,
        config: { 
            systemInstruction: generationPrompt, 
            temperature: 0.5,
        }
    });

    const generatedText = generationResponse.text.trim();
    if (!generatedText) {
        console.error("Clarification Step 1 failed: No text was generated.");
        return { type: 'summary', content: `AI clarification failed. Proceeding with original query: ${history[0].content}` };
    }

    // --- STEP 2: Format the generated text into a structured JSON object ---
    const formattingPrompt = `Analyze the following text and classify it.
Your response MUST be a single, valid JSON object and nothing else.
- If the text is a question, set "type" to "question".
- If the text is a summary or statement, set "type" to "summary".
- The "content" key must contain the original, unmodified text.

Text to analyze: "${generatedText}"
`;

    const clarificationResponseSchema = {
        type: 'object',
        properties: {
            type: { type: 'string', enum: ['question', 'summary'] },
            content: { type: 'string' }
        },
        required: ['type', 'content']
    };

    const formattingResponse = await ai.models.generateContent({
        model: getModel('clarification', mode),
        contents: formattingPrompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: clarificationResponseSchema,
            temperature: 0.0,
        }
    });

    const parsedResponse = parseJsonFromMarkdown(formattingResponse.text) as ClarificationResponse;

    if (!parsedResponse || !parsedResponse.type || !parsedResponse.content) {
        console.error("Clarification Step 2 (JSON formatting) failed. Raw text from formatter:", formattingResponse.text);
        // Fallback: If JSON formatting fails, make an intelligent guess based on the original generated text.
        if (generatedText.includes('?')) {
            return { type: 'question', content: generatedText };
        }
        return { type: 'summary', content: generatedText };
    }
    
    return parsedResponse;
};
