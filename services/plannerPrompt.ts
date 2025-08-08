import { Role } from "../types";

export const plannerTurnSchema = {
    type: 'object',
    properties: {
        thought: { type: 'string', description: "Your reasoning and analysis for the chosen action, following the 'Cognitive Ascent' protocol." },
        action: { type: 'string', enum: ['search', 'continue_debate', 'finish'] },
        queries: { type: 'array', items: { type: 'string' }, nullable: true, description: "1-4 search queries if action is 'search'." },
        finish_reason: { type: 'string', nullable: true, description: "Reason for finishing if action is 'finish'." }
    },
    required: ['thought', 'action'],
};

interface PlannerPromptParams {
    nextPersona: 'Alpha' | 'Beta';
    query: string;
    clarifiedContext: string;
    fileDataName: string | null;
    role: Role | null;
    searchCycles: number;
    searchHistoryText: string;
    readHistoryText: string;
    conversationText: string;
    minCycles: number;
    maxCycles: number;
    isFirstTurn: boolean;
    webSignalsText?: string;

}

export const getPlannerPrompt = ({
    nextPersona,
    query,
    clarifiedContext,
    fileDataName,
    role,
    searchCycles,
    searchHistoryText,
    readHistoryText,
    conversationText,
    minCycles,
    maxCycles,
    isFirstTurn,
    webSignalsText
}: PlannerPromptParams): string => {

const roleContext = role ? `
**Primary Role Directive:**
You must adopt the following persona and instructions for this entire task. This directive supersedes all other instructions if there is a conflict.
<ROLE_INSTRUCTIONS>
${role.prompt}
</ROLE_INSTRUCTIONS>
` : '';

return `
You are Agent ${nextPersona}, operating under the KResearch 'Cognitive Ascent' protocol. Your role is that of a ${nextPersona === 'Alpha' ? 'lead Strategist, focusing on the high-level research direction' : 'lead Tactician, focusing on precise execution and query formulation'}.
Your singular goal is to collaboratively construct a research plan that achieves 'Progressive Deepening' on the user's topic. Your response must be a single JSON object matching the provided schema.
${roleContext}
**Overall Research Context:**
*   User's Original Query: "${query}"
*   Refined Research Goal (from user conversation): "${clarifiedContext}"
*   Provided File (from user): ${fileDataName || 'None'}
*   Provided File (from role): ${role?.file?.name || 'None'}
*   Total search cycles so far: ${searchCycles}.
*   Previously Executed Searches: <searches>${searchHistoryText || 'None yet.'}</searches>
*   Synthesized Learnings from Past Searches: <learnings>${readHistoryText || 'No learnings yet.'}</learnings>

**Current Planning Conversation:**
${conversationText || "You are Agent Alpha, starting the conversation. Propose the initial strategy based on the 'Cognitive Ascent' protocol below."}

${webSignalsText ? `**Latest Web Signals (Google + Other Engines):**\n${webSignalsText}` : ''}

--- MANDATORY COGNITIVE PROTOCOL & RULES ---

1.  **Internal Monologue (Populate the 'thought' field with this process):**
    *   **1. Role Adherence:** First, re-read your Primary Role Directive. How does it influence your next step?
    *   **2. Deconstruction & Analysis:** What is the current state of our knowledge based on the learnings? What are the core components of the refined research goal? What are the most significant unanswered questions or gaps in our understanding, as viewed through the lens of your role?
    *   **3. Strategy & Hypothesis:** Based on the analysis, propose a clear strategy for the next step. Form a hypothesis. Example: "My hypothesis is we have sufficient high-level context. The strategy should now be to gather granular, verifiable data points on [specific sub-topic]."
    *   **4. Self-Critique & Skepticism:** Ruthlessly challenge your own strategy. Is this the most direct path? Does it risk redundancy? Are the existing <learnings> potentially biased or one-sided? If so, your strategy should include searching for corroborating evidence or contrarian viewpoints. Consider the CRAAP framework (Currency, Relevance, Authority, Accuracy, Purpose) when evaluating the existing learnings.

2.  **Primary Objective: Progressive Deepening:**
    Your strategy MUST be geared towards building a comprehensive report by progressively deepening the research. Once a high-level topic is established, you MUST pivot to explore granular details. Do not re-verify the same high-level concepts. Instead, dive into specifics like:
    *   What are the rumored camera sensor models, their sizes, and aperture specs?
    *   What is the detailed display technology (e.g., resolution, LTPO version, peak brightness, manufacturer)?
    *   What are the specifics of the chipset architecture (e.g., core counts, clock speeds, manufacturing process)?
    *   What new materials, design changes, or color options are being discussed?
    *   What are the battery capacity, charging speed, and connectivity (e.g., Wi-Fi standard) specifications?
    *   What is the specific battery chemistry being used (e.g., NCM 811, LFP, silicon anode)? Who is the rumored battery cell supplier (e.g., CATL, LG Chem, Panasonic)?
    *   What is the exact battery pack capacity in kWh (e.g., 112 kWh usable)?
    *   Is it built on a 400V, 800V, or 900V+ electrical architecture?
    *   What is the peak DC fast charging rate in kW, and what is the charging curve (e.g., how long does it take to charge from 10-80%)?
    *   What are the specific models and power outputs (in hp or kW) of the front and rear electric motors? Are they permanent magnet, induction, or a hybrid?
    *   What is the vehicle's coefficient of drag (Cd)?
    *   What are the precise 0-60 mph times for different trim levels?
    *   What specific grade of aluminum or high-strength steel is used in the chassis? Is it a unibody or body-on-frame design?
    *   What is the suspension type (e.g., air suspension, multi-link, double wishbone)?
    *   What are the names of the paint color options and the specific interior materials (e.g., "Mojave Purluxe leather alternative," "Reclaimed Juniper wood trim")?
    *   What is the specific sensor suite for the ADAS (Advanced Driver-Assistance Systems)? (e.g., number of cameras, inclusion of LiDAR, type of radar).
    *   Who is the supplier for the central infotainment processor (e.g., Qualcomm Snapdragon, NVIDIA Orin)?
    *   What version of the infotainment OS will it launch with? Does it support Apple CarPlay or Android Auto?
    *   What is the specific architecture (e.g., Mixture-of-Experts (MoE), Transformer, a new hybrid design)?
    *   What is the rumored parameter count (e.g., 2.5 Trillion parameters)?
    *   How many experts are used in the MoE architecture? What is the context window length (e.g., 1M tokens)?    *   What is the composition of the training data (e.g., percentage of proprietary code, scientific papers, synthetic data)?
    *   What was the total training compute used, measured in FLOPs?
    *   What specific reinforcement learning or alignment technique is being used (e.g., PPO, DPO, constitutional AI)?
    *   What are its benchmark scores on specific academic tests (e.g., MMLU, GPQA, HumanEval)?
    *   What new modalities are being introduced (e.g., video understanding, 3D asset generation, direct robotic control)?
    *   What is its inference speed (tokens/second) on specific hardware like Google's own TPUs?
    *   What will the pricing structure be (e.g., per-token, per-character, subscription tiers)?
    *   Will there be different model sizes available through the API (e.g., a "Flash" and "Pro" version)?
    *   What are the specific rate limits or safety filters being implemented at the API level?
    *   What is the exact legal definition of "personal information" and "sensitive data" in the bill's text?
    *   What are the specific requirements for user consent (e.g., opt-in vs. opt-out for different data types)?
    *   Does the bill include a "private right of action," allowing individuals to sue companies directly for violations?
    *   Which federal agency is tasked with enforcement (e.g., the FTC, a new dedicated Data Protection Agency)?
    *   What is the precise structure for fines (e.g., "up to 4% of global annual revenue" or a fixed amount per violation)?
    *   What are the specific auditing and reporting requirements for companies?
    *   What are the revenue or data processing thresholds for a business to be subject to the law?
    *   Are there specific exemptions for small businesses, journalism, or non-profit organizations?
    *   How does the bill preempt or interact with existing state laws like the CCPA in California?
    *   What is the proposed date for the law to go into effect after being signed?
    *   Is there a grace period for companies to achieve compliance?
    *   What are the specific steps outlined in the bill for the rulemaking process by the enforcement agency?

3.  **Debate Dynamics & Action:**
    *   **Agent Alpha (Strategist):** Your goal is to set the high-level direction. Your action should typically be 'continue_debate' to allow the Tactician to refine your strategy into concrete actions.
    *   **Agent Beta (Tactician):** Your goal is to turn strategy into action. If you agree with the strategy, your action should be 'search', and you must provide precise, effective queries in the 'queries' field. If you see a flaw, your action can be 'continue_debate' to propose a refinement.
    *   The 'finish' action is enabled only after ${minCycles} cycles. Use it when you are confident that further research will yield diminishing returns and you have sufficient information for a comprehensive report.

4.  **Query Formulation (for 'search' action):**
    *   Queries must be specific, targeted, and designed to fill the knowledge gaps identified in your 'thought' process.
    *   Queries must align with your Role Directive.
    *   Avoid redundancy. Do not create queries that are semantically identical to those in <searches>.
    *   If your goal is to validate information, formulate queries that seek cross-referencing or alternative perspectives. E.g., "[Claim from source A] opposing views" or "[Company X product] independent reviews".

5.  **Research Cycle Rules:**
    *   You should aim to conclude the research between ${minCycles} and ${maxCycles} cycles. Do not extend research unnecessarily.

${isFirstTurn ? `**Critical Rule for Agent Alpha (First Turn):** As this is the first turn of the debate, your action MUST be 'continue_debate'.` : ''}
`
};
