
import { ai } from './geminiClient';
import { getModel } from './models';
import { apiKeyService } from './apiKeyService';
import { ResearchUpdate, Citation, FinalResearchData, ResearchMode, FileData, ReportVersion, Role } from '../types';

const getRoleContext = (role: Role | null): string => {
    if (!role) return '';
    return `
**Primary Role Directive:**
You must adopt the following persona and instructions for this entire task. This directive supersedes all other instructions if there is a conflict.
<ROLE_INSTRUCTIONS>
${role.prompt}
</ROLE_INSTRUCTIONS>
`;
};

export const synthesizeReport = async (
    query: string,
    history: ResearchUpdate[],
    citations: Citation[],
    mode: ResearchMode,
    fileData: FileData | null,
    role: Role | null,
    reportOutline: string,
): Promise<Omit<FinalResearchData, 'researchTimeMs' | 'searchCycles' | 'researchUpdates' | 'citations'>> => {
    const learnings = history.filter(h => h.type === 'read').map(h => h.content).join('\n\n---\n\n');
    const historyText = history.map(h => `${h.persona ? h.persona + ' ' : ''}${h.type}: ${Array.isArray(h.content) ? h.content.join(' | ') : h.content}`).join('\n');
    const roleContext = getRoleContext(role);

    const corePrompt = `You are an elite Senior Research Analyst. Your mission is to write a comprehensive, insightful, and substantial research report based on a collection of research materials.
${roleContext}
**Your Task:**
Write a polished and extensive final report.

**Core User Requirement:**
<REQUIREMENT>${query}</REQUIREMENT>

**Evidence Base (Your Sole Source of Truth for content):**
*   **Attached File:** ${fileData ? `A file named '${fileData.name}' was provided and its content is a primary source.` : "No file was provided."}
*   **Role-specific File:** ${role?.file ? `A file named '${role.file.name}' was provided with the role and its content is a primary source.` : "No file was provided with the role."}
*   **Synthesized Research Learnings:** <LEARNINGS>${learnings || "No specific content was read during research."}</LEARNINGS>
*   **Full Research History (For Context and Nuance):** <HISTORY>${historyText}</HISTORY>

**--- CRITICAL REPORTING INSTRUCTIONS ---**`;

    const instructions = reportOutline
    ? `
**1. Adherence to Outline & Role:**
*   You **MUST** follow the structure provided in the \`<OUTLINE>\` below. This includes all specified headings, subheadings, and content points.
*   Your output and tone must be consistent with your assigned Role Directive.
*   The very first line of your response **MUST BE** the H1 title as specified in the outline.

**Mandatory Report Outline (Your primary guide for structure and content):**
<OUTLINE>
${reportOutline}
</OUTLINE>
`
    : `
**1. Structure and Content Generation:**
*   You must create a logical and comprehensive structure for the report yourself. A good report generally includes an Executive Summary, a Detailed Analysis with multiple sub-sections for key themes identified from the research, and a Conclusion.
*   Your output and tone must be consistent with your assigned Role Directive.
*   The very first line of your response **MUST BE** an H1 markdown title for the report (e.g., \`# An In-Depth Analysis of X\`).`;

const commonInstructions = `
**2. Content Generation:**
*   Flesh out each section with detailed analysis, synthesizing information from the \`<LEARNINGS>\` block, the attached files, and the broader research history.
*   Provide in-depth analysis. Do not just list facts; interpret them, connect disparate points, and discuss the implications, all through the lens of your role.

**3. Stylistic and Formatting Requirements:**
*   **Evidence-Based Assertions:** This is non-negotiable. Every key assertion, claim, or data point MUST be grounded in the provided research data.
*   **Data Visualization with Mermaid.js:** Mermaid.js syntax is extremely strict. Syntactic perfection is mandatory to prevent rendering errors. If you determine a diagram is necessary to explain a complex relationship or process, you MUST create it following these rules:
    *   **Rule 1: ALWAYS Quote Text.** All user-facing text (in nodes, on edges, for labels, etc.) MUST be enclosed in double quotes. This is the most common source of errors because it correctly handles special characters.
        *   **Correct:** \`A["Node with (parentheses)"] -- "arrow text" --> B\`
        *   **Incorrect:** \`A[Node with (parentheses)] -- arrow text --> B\`
    *   **Rule 2: Use Safe Node IDs.** Node IDs MUST be a single word containing only letters and numbers (e.g., \`node1\`, \`stepA\`, \`db\`). Do NOT use quotes, spaces, hyphens, or other special characters in the IDs themselves.
    *   **Rule 3: Follow Strict Syntax Examples.** Do not deviate from these proven patterns.
        *   **Flowchart:**
            \`\`\`mermaid
            graph TD;
                nodeA["Text for Node A"] --> nodeB{"Decision Point?"};
                nodeB -- "Yes" --> nodeC["Outcome 1"];
                nodeB -- "No" --> nodeD["Outcome 2"];
            \`\`\`
        *   **Sequence Diagram:**
            \`\`\`mermaid
            sequenceDiagram;
                participant Alice;
                participant Bob;
                Alice->>Bob: "Hello Bob, how are you?";
                Bob-->>Alice: "I am great, thanks!";
            \`\`\`
        *   **State Diagram:**
             \`\`\`mermaid
            stateDiagram-v2;
                [*] --> State1;
                State1 --> State2: "Event T1";
                State2 --> [*];
            \`\`\`
    *   **Rule 4: Simplicity is Key.** Do not attempt complex styling or experimental features within the Mermaid code block. A simple, correct diagram is infinitely better than a complex, broken one.
    *   **Rule 5: Embed Correctly.** Embed the complete and valid \`\`\`mermaid ... \`\`\` code block directly in the relevant sections of the report.
*   **Tone & Formatting:** Maintain a formal, objective, and authoritative tone, unless your Role Directive specifies otherwise. Use Markdown extensively for clarity (headings, lists, bold text).
*   **Exclusivity:** The report's content must be based **exclusively** on the information provided. Do NOT invent information or use any outside knowledge. Do NOT include inline citations.

**Final Output:**
Respond ONLY with the raw markdown content of the final report, starting with the H1 title. Do not add any conversational text or explanation.
`;

    // If using OpenRouter, append an Appendix template with combined search sources (Google + other engines)
    let appendixBlock = '';
    if (apiKeyService.isUsingOpenRouter() && citations && citations.length > 0) {
        const uniqueCitations = Array.from(new Map(citations.map(c => [c.url, c])).values());
        const appendixList = uniqueCitations.map(c => `- ${c.title}  \n  ${c.url}`).join('\n');
        appendixBlock = `\n\n**Appendix: Combined Search Sources**\n\nThe following sources were identified via multi-engine search (including Google and other engines) during the research process.\n\n${appendixList}`;
    }

    const finalReportPrompt = `${corePrompt}\n${instructions}\n${commonInstructions}${appendixBlock ? `\n\n${appendixBlock}` : ''}`;

    const parts: ({ text: string } | { inlineData: { mimeType: string; data: string; } })[] = [{ text: finalReportPrompt }];
    if (fileData) {
        parts.push({ inlineData: { mimeType: fileData.mimeType, data: fileData.data } });
    }
    if (role?.file) {
        parts.push({ inlineData: { mimeType: role.file.mimeType, data: role.file.data } });
    }
    const reportResponse = await ai.models.generateContent({
        model: getModel('synthesizer', mode),
        contents: { parts },
        config: { temperature: 0.5 }
    });
    
    if (!reportResponse) {
        throw new Error("The API did not return a response during report synthesis. This might be due to content filters blocking the request.");
    }

    const reportText = reportResponse.text;
    
    if (!reportText) {
         return { reports: [{ content: "Failed to generate an initial report. The response from the AI was empty.", version: 1 }], activeReportIndex: 0 };
    }
    
    const initialReport: ReportVersion = { content: reportText.trim(), version: 1 };
    return { reports: [initialReport], activeReportIndex: 0 };
};

export const rewriteReport = async (
    originalReport: string,
    instruction: string,
    mode: ResearchMode,
    file: FileData | null,
    role: Role | null,
): Promise<string> => {
    const roleContext = getRoleContext(role);
    const prompt = `You are an expert copy editor. Your task is to rewrite the provided Markdown report based on a specific instruction.
${roleContext}
You must adhere to these rules:
1.  The output MUST be only the raw Markdown of the rewritten report. Do not add any conversational text, introductions, or explanations.
2.  Preserve the original meaning and data of the report unless the instruction explicitly asks to change it.
3.  Maintain the original Markdown formatting (headings, lists, etc.) as much as possible, including the initial H1 title.

**Original Report:**
<REPORT>
${originalReport}
</REPORT>

**Instruction:**
<INSTRUCTION>
${instruction}
</INSTRUCTION>

**Attached File (if any, provides additional context for the instruction):**
<FILE_CONTEXT>
${file ? `A file named '${file.name}' was attached.` : "No file was attached."}
${role?.file ? `A file named '${role.file.name}' was attached with the role.` : "No file was attached with the role."}
</FILE_CONTEXT>

Respond with the rewritten report now.`;

    const parts: ({ text: string } | { inlineData: { mimeType: string; data: string; } })[] = [{ text: prompt }];
    if (file) {
        parts.push({ inlineData: { mimeType: file.mimeType, data: file.data } });
    }
    if (role?.file) {
        parts.push({ inlineData: { mimeType: role.file.mimeType, data: role.file.data } });
    }

    const response = await ai.models.generateContent({
        model: getModel('synthesizer', mode),
        contents: { parts },
        config: { temperature: 0.7 }
    });

    if (!response || !response.text) {
        throw new Error("The API did not return a response during report rewrite. This might be due to content filters blocking the request.");
    }

    return response.text.trim();
};
