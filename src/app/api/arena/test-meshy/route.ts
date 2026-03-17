import { NextResponse } from "next/server";

/** GET /api/arena/test-meshy — Test Meshy API connection (no auth required for diagnostics). */
export async function GET() {
  const apiKey = process.env.MESHY_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      error: "MESHY_API_KEY not found",
      exists: false,
    });
  }

  try {
    const response = await fetch("https://api.meshy.ai/v2/text-to-3d", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "preview",
        prompt:
          "A realistic boxer in fighting stance, athletic build, boxing gloves raised, dark background, photorealistic",
        art_style: "realistic",
        negative_prompt: "cartoon, anime, blurry, deformed",
      }),
    });

    const data = (await response.json()) as { result?: string; [key: string]: unknown };

    return NextResponse.json({
      success: true,
      status: response.status,
      taskId: data.result,
      data,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      success: false,
      error: message,
    });
  }
}
