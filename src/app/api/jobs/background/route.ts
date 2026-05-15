import { NextResponse } from "next/server"
import { fal } from "@fal-ai/client"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const maxDuration = 300

fal.config({
  credentials: process.env.FAL_KEY,
})

export async function POST(request: Request) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 })
  }

  const {
    imagePath,
    prompt,
    sourceBucket = "inputs",
  } = await request.json()

  if (!imagePath) {
    return NextResponse.json({ error: "缺少图片路径" }, { status: 400 })
  }
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ error: "缺少背景描述" }, { status: 400 })
  }
  if (sourceBucket !== "inputs" && sourceBucket !== "outputs") {
    return NextResponse.json({ error: "无效的图片来源" }, { status: 400 })
  }
  if (!imagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "无权访问该图片" }, { status: 403 })
  }

  // 创建 job
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      user_id: user.id,
      type: "background",
      status: "processing",
      input: { imagePath, prompt, sourceBucket },
    })
    .select()
    .single()

  if (jobError || !job) {
    return NextResponse.json(
      { error: jobError?.message || "创建任务失败" },
      { status: 500 }
    )
  }

  const startTime = Date.now()

  try {
    const inputSigned = await supabase.storage
      .from(sourceBucket)
      .createSignedUrl(imagePath, 600)

    if (inputSigned.error) throw new Error("无法生成签名 URL")

    // 调 fal.ai IC-Light v2
    const result = await fal.subscribe("fal-ai/iclight-v2", {
      input: {
        image_url: inputSigned.data.signedUrl,
        prompt: prompt.trim(),
        num_inference_steps: 28,
        guidance_scale: 5,
      },
      logs: false,
    })

    const falOutputUrl = result.data?.images?.[0]?.url
    if (!falOutputUrl) throw new Error("fal.ai 未返回图片")

    // 下载并永久存储
    const imgResp = await fetch(falOutputUrl)
    if (!imgResp.ok) throw new Error("下载生成图失败")
    const imgBuffer = await imgResp.arrayBuffer()

    const admin = createAdminClient()
    const outputPath = `${user.id}/background-${Date.now()}.png`

    const { error: uploadError } = await admin.storage
      .from("outputs")
      .upload(outputPath, imgBuffer, {
        contentType: "image/png",
        upsert: false,
      })
    if (uploadError) throw uploadError

    const { data: signedData, error: signedError } = await supabase.storage
      .from("outputs")
      .createSignedUrl(outputPath, 3600)
    if (signedError) throw signedError

    // 估算成本（按输出图尺寸 × $0.10/MP）
    // iclight 返回的 images 数组没有显式 width/height，按输入估算
    // 实际项目里可以用 sharp 之类的库读图，这里简化按典型尺寸估
    const estimatedMP = 1.5 // 默认 1.5MP，能 cover 大部分 1024×1536 场景
    const cost = +(estimatedMP * 0.1).toFixed(4)

    await supabase
      .from("jobs")
      .update({
        status: "completed",
        output: { outputPath, falRequestId: result.requestId },
        fal_request_id: result.requestId,
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
        cost_usd: cost,
      })
      .eq("id", job.id)

    return NextResponse.json({
      jobId: job.id,
      imageUrl: signedData.signedUrl,
      outputPath,
      cost,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "生成失败"

    await supabase
      .from("jobs")
      .update({
        status: "failed",
        error: errorMessage,
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id)

    console.error("Background API error:", error)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}