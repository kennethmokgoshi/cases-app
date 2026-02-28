import OpenAI from "openai";
import { logger } from '@zenowethu/shared-lib';

// Define the shape of the analysis result
export interface AgreementAnalysis {
    parties: string[];
    effectiveDate: string | null;
    expirationDate: string | null;
    termDuration: string | null;
    keyObligations: string[];
    missingClauses: string[];
    riskFactors: string[];
    summary: string;
}

export async function analyzeAgreementText(text: string): Promise<AgreementAnalysis> {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY });

    const prompt = `
    You are an expert legal AI assistant. Analyze the following contract text and extract key information.
    Return the result in JSON format with the following keys:
    - parties: Array of strings (names of improved parties).
    - effectiveDate: String (YYYY-MM-DD) or null.
    - expirationDate: String (YYYY-MM-DD) or null.
    - termDuration: String (e.g., "1 year") or null.
    - keyObligations: Array of strings (summarize top 3-5 obligations).
    - missingClauses: Array of strings (list any standard clauses that are missing, e.g., "Confidentiality", "Termination", "Dispute Resolution").
    - riskFactors: Array of strings (list any high-risk clauses or terms).
    - summary: String (brief overview of the contract).

    Contract Text:
    ${text.substring(0, 15000)} // Truncate to avoid token limits if necessary
  `;

    try {
        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "gpt-4o-mini", // Use a cost-effective model
            response_format: { type: "json_object" } });

        const content = completion.choices[0].message.content;
        if (!content) {
            throw new Error("No content received from AI");
        }

        const result = JSON.parse(content) as AgreementAnalysis;
        return result;
    } catch (error) {
        logger.error("Error analyzing agreement:", error);
        throw new Error("Failed to analyze agreement");
    }
}
