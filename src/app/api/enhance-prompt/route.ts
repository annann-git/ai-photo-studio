import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { chatComplete } from "@/lib/openrouter"

const SYSTEM_PROMPT = `You are an expert at writing image generation prompts for IC-Light V2 (fal.ai), an AI model that re-lights photos and replaces backgrounds for fashion/ecommerce model photos.

The user gives you a short description (in Chinese or English) of a desired background or setting. Your job: produce a detailed, vivid English prompt for IC-Light V2.

Rules:
- Output ONLY the prompt, no preamble, no quotes, no explanation
- 1-2 sentences, under 60 words total
- Specify: scene, lighting (direction/quality/time), color mood, atmosphere
- Use professional photography vocabulary: "soft bokeh", "golden hour", "cinematic", "natural lighting"
- Preserve the user's intent — don't add unrequested elements
- The subject (model + clothing) will be preserved, you only describe the new environment

Examples:
User: 海滩
Assistant: beach at golden hour, soft warm sunset light, ocean waves and golden sand, gentle bokeh background, cinematic atmosphere

User: studio
Assistant: professional fashion studio with pure white seamless backdrop, soft diffused studio lighting, clean and bright atmosphere

User: 复古酒吧
Assistant: vintage cocktail bar interior, warm amber lighting, dark wood and brass accents, soft bokeh background, moody cinematic atmosphere`

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 })
  }

  const { prompt } = await request.json()
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "缺少 prompt" }, { status: 400 })
  }

  try {
    const enhanced = await chatComplete({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: prompt.trim(),
      maxTokens: 200,
    })
    return NextResponse.json({ enhanced })
  } catch (error) {
    console.error("Enhance prompt error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "优化失败" },
      { status: 500 }
    )
  }
}