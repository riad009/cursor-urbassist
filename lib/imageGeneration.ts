/**
 * Optional image generation (e.g. OpenAI DALL·E 3) for landscape insertion and developer visuals.
 * Set OPENAI_API_KEY and IMAGE_GENERATION_ENABLED=true to enable.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ENABLED = process.env.IMAGE_GENERATION_ENABLED === "true" || process.env.IMAGE_GENERATION_ENABLED === "1";

export interface GenerateImageOptions {
  prompt: string;
  size?: "1024x1024" | "1792x1024" | "1024x1792";
  style?: "vivid" | "natural";
}

/** Returns base64 image (data URL) or null if not configured or failed. */
export async function generateImage(options: GenerateImageOptions): Promise<string | null> {
  if (!ENABLED || !OPENAI_API_KEY) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: options.prompt.slice(0, 4000),
        n: 1,
        size: options.size || "1024x1024",
        style: options.style || "natural",
        response_format: "b64_json",
        quality: "standard",
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error("OpenAI image generation failed:", res.status, err);
      return null;
    }
    const data = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) return null;
    return `data:image/png;base64,${b64}`;
  } catch (e) {
    console.error("Image generation error:", e);
    return null;
  }
}

export function isImageGenerationEnabled(): boolean {
  return !!(ENABLED && OPENAI_API_KEY);
}
