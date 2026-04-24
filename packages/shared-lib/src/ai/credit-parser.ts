/**
 * Credit Report AI Parser
 * 
 * Identifies the bureau (TransUnion, Experian, XDS, Lightstone) 
 * and extracts the credit score from OCR text.
 */

export interface ParsedCreditReport {
  bureau: "TRANSUNION" | "EXPERIAN" | "XDS" | "LIGHTSTONE" | "UNKNOWN";
  score: number;
  confidence: "HIGH" | "MEDIUM" | "LOW";
}

export function parseCreditReport(text: string): ParsedCreditReport {
  const t = text.toUpperCase();
  let bureau: ParsedCreditReport["bureau"] = "UNKNOWN";
  let score = 0;
  let confidence: ParsedCreditReport["confidence"] = "LOW";

  // 1. Identify Bureau
  if (t.includes("TRANSUNION") || t.includes("TU PROTECT")) {
    bureau = "TRANSUNION";
  } else if (t.includes("EXPERIAN")) {
    bureau = "EXPERIAN";
  } else if (t.includes("XDS") || t.includes("XPERT DECISION")) {
    bureau = "XDS";
  } else if (t.includes("LIGHTSTONE") || t.includes("DCCP")) {
    bureau = "LIGHTSTONE";
  }

  // 2. Extract Score (Regex patterns based on common bureau layouts)
  const scorePatterns = [
    /SCORE\s*[:\-]?\s*(\d{3})/i,
    /CREDIT\s*SCORE\s*[:\-]?\s*(\d{3})/i,
    /VANTAGESCORE\s*[:\-]?\s*(\d{3})/i,
    /EMPIRICA\s*[:\-]?\s*(\d{3})/i,
    /RISK\s*SCORE\s*[:\-]?\s*(\d{3})/i
  ];

  for (const pattern of scorePatterns) {
    const match = t.match(pattern);
    if (match && match[1]) {
      const val = parseInt(match[1]);
      if (val >= 300 && val <= 999) {
        score = val;
        confidence = "HIGH";
        break;
      }
    }
  }

  // Fallback: If no label found but we see a 3-digit number near common keywords
  if (score === 0) {
     const looseMatch = t.match(/(\d{3})/g);
     if (looseMatch) {
        // Look for values in common score ranges
        const likelyScores = looseMatch.map(v => parseInt(v)).filter(v => v > 400 && v < 950);
        if (likelyScores.length > 0) {
           score = likelyScores[0];
           confidence = "MEDIUM";
        }
     }
  }

  return { bureau, score, confidence };
}
