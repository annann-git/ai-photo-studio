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

  const { imagePath, upscaleFactor = 2, sourceBucket = "inputs" } = await request.json()
  if (!imagePath) {
    return NextResponse.json({ error: "缺少图片路径" }, { status: 400 })
  }

  if (!imagePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "无权访问该图片" }, { status: 403 })
  }

  if (sourceBucket !== "inputs" && sourceBucket !== "outputs") {
    return NextResponse.json({ error: "无效的图片来源" }, { status: 400 })
  }

  // 创建 job 记录
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      user_id: user.id,
      type: "upscale",
      status: "processing",
      input: { imagePath, upscaleFactor },
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
    // 生成签名 URL 给 fal.ai 用
    const inputSigned = await supabase.storage
    .from(sourceBucket)
    .createSignedUrl(imagePath, 600)

    if (inputSigned.error) throw new Error("无法生成签名 URL")

    // 调 fal.ai Clarity Upscaler
    // 参数说明：
    //   creativity 0.25 = 低创造性（不要乱加细节）
    //   resemblance 0.75 = 高相似度（保留原图特征）
    //   适合电商场景的设置
    const result = await fal.subscribe("fal-ai/clarity-upscaler", {
      input: {
        image_url: inputSigned.data.signedUrl,
        upscale_factor: upscaleFactor,
        creativity: 0.25,
        resemblance: 0.75,
        prompt: "high quality, sharp, detailed, photorealistic, ultra detailed",
      },
      logs: false,
    })

    const falOutputUrl = result.data?.image?.url
    if (!falOutputUrl) throw new Error("fal.ai 未返回图片")

    // 下载并永久存储
    const imgResp = await fetch(falOutputUrl)
    if (!imgResp.ok) throw new Error("下载生成图失败")
    const imgBuffer = await imgResp.arrayBuffer()

    const admin = createAdminClient()
    const outputPath = `${user.id}/upscale-${Date.now()}.png`

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

    // 按输出图实际尺寸算成本
    const outputWidth = result.data?.image?.width || 1024
    const outputHeight = result.data?.image?.height || 1024
    const megapixels = (outputWidth * outputHeight) / 1_000_000
    const cost = +(megapixels * 0.03).toFixed(4)

    await supabase
      .from("jobs")
      .update({
        status: "completed",
        output: {
          outputPath,
          falRequestId: result.requestId,
          width: outputWidth,
          height: outputHeight,
        },
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
      width: outputWidth,
      height: outputHeight,
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

    console.error("Upscale API error:", error)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}