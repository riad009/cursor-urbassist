# Image generation (Landscape & Developer)

The following features require an **image-generation API** and are not fully implemented with picture output:

## Landscape (Section 7)

- **Current**: Text report from Gemini describing how to integrate the project into the photo; analysis of horizon, perspective, ambiance.
- **Missing**: **Realistic image** of the project integrated into the uploaded photo (e.g. photomontage). This would require:
  - An image-generation or image-editing API (e.g. Imagen, DALL·E, or a dedicated photomontage service).
  - Input: site photo + 3D model or footprint + style.
  - Output: single composite image for permit or communication.

## Developer (Section 8)

- **Current**: Gemini text analysis of the uploaded sketch/SketchUp screenshot with recommendations for ultra-realistic rendering.
- **Missing**: **Ultra-realistic image output** (e.g. from sketch to photorealistic view). This would require:
  - An image-generation API that accepts an image input and returns an enhanced/realistic image (e.g. image-to-image, or a dedicated architectural viz API).
  - Optional: integration with a 3D renderer or external service for full control.

## How to add image output

1. **Environment**: Configure an image API key (e.g. `IMAGEN_API_KEY`, `OPENAI_IMAGE_KEY`, or partner API).
2. **Landscape**: In `app/api/landscape/route.ts`, add an `action` that calls the image API with the photo + project description and returns the generated image URL or base64.
3. **Developer**: In `app/api/developer/visual/route.ts`, add a path that calls the image API with the uploaded image + style/purpose and returns the generated image.
4. **Credits**: Keep deducting credits when generating images (already planned in both flows).

Until then, both modules provide **text-only** analysis and recommendations.
