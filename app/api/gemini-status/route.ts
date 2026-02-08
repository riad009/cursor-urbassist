import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/gemini-status
 * Returns whether GEMINI_API_KEY is set and optionally verifies it with a minimal Gemini call.
 * Query: ?check=1 to verify the key works (one quick Gemini request).
 */
export async function GET(request: NextRequest) {
  const key = process.env.GEMINI_API_KEY;
  const configured = Boolean(key?.trim());

  const searchParams = request.nextUrl.searchParams;
  const shouldCheck = searchParams.get("check") === "1";

  if (!configured) {
    return NextResponse.json({
      configured: false,
      working: false,
      message: "GEMINI_API_KEY is not set. AI features use mock/fallback data.",
    });
  }

  if (!shouldCheck) {
    return NextResponse.json({
      configured: true,
      message: "GEMINI_API_KEY is set. Use ?check=1 to verify the key with Gemini.",
    });
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Reply with exactly: OK" }] }],
          generationConfig: { maxOutputTokens: 10 },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({
        configured: true,
        working: false,
        error: `Gemini API returned ${res.status}`,
        details: errText.slice(0, 200),
      });
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    const working = text.length > 0;

    return NextResponse.json({
      configured: true,
      working,
      message: working ? "Gemini API key is valid and working." : "Gemini responded but no text returned.",
    });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return NextResponse.json({
      configured: true,
      working: false,
      error: "Request failed",
      details: error,
    });
  }
}
