import { NextResponse } from "next/server"
import { fal } from "@fal-ai/client"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

// Vercel: 这个路由可能跑 30 秒，调大超时
export const maxDuration = 300

fal.config({
  credentials: process.env.FAL_KEY,
})

export async function POST(request: Request) {
  const supabase = await createClient()

  // ============ 1. 鉴权 ============
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 })
  }

  // ============ 2. 解析输入 ============
  const { personPath, garmentPath } = await request.json()
  if (!personPath || !garmentPath) {
    return NextResponse.json({ error: "缺少图片路径" }, { status: 400 })
  }

  // ============ 3. 安全检查：路径必须属于当前用户 ============
  // 防止恶意用户传别人的图片路径
  if (
    !personPath.startsWith(`${user.id}/`) ||
    !garmentPath.startsWith(`${user.id}/`)
  ) {
    return NextResponse.json({ error: "无权访问该图片" }, { status: 403 })
  }

  // ============ 4. 在 jobs 表创建任务记录 ============
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      user_id: user.id,
      type: "tryon",
      status: "processing",
      input: { personPath, garmentPath },
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
    // ============ 5. 给两张输入图生成签名 URL，让 fal.ai 能下载 ============
    const [personSigned, garmentSigned] = await Promise.all([
      supabase.storage.from("inputs").createSignedUrl(personPath, 600),
      supabase.storage.from("inputs").createSignedUrl(garmentPath, 600),
    ])

    if (personSigned.error || garmentSigned.error) {
      throw new Error("无法生成签名 URL")
    }

    // ============ 6. 调用 fal.ai FASHN v1.6 ============
    const result = await fal.subscribe("fal-ai/fashn/tryon/v1.6", {
      input: {
        model_image: personSigned.data.signedUrl,
        garment_image: garmentSigned.data.signedUrl,
      },
      logs: false,
    })

    const falOutputUrl = result.data?.images?.[0]?.url
    if (!falOutputUrl) {
      throw new Error("fal.ai 未返回图片")
    }

    // ============ 7. 把结果从 fal.ai 下载下来（它们的 URL 24 小时后过期） ============
    const imgResp = await fetch(falOutputUrl)
    if (!imgResp.ok) throw new Error("下载生成图失败")
    const imgBuffer = await imgResp.arrayBuffer()

    // ============ 8. 永久存到我们自己的 Supabase Storage ============
    // 用 admin client 绕过 RLS（因为 API 端是服务端代用户存）
    const admin = createAdminClient()
    const outputPath = `${user.id}/tryon-${Date.now()}.png`

    const { error: uploadError } = await admin.storage
      .from("outputs")
      .upload(outputPath, imgBuffer, {
        contentType: "image/png",
        upsert: false,
      })
    if (uploadError) throw uploadError

    // ============ 9. 给前端生成签名 URL 用于展示 ============
    const { data: signedData, error: signedError } = await supabase.storage
      .from("outputs")
      .createSignedUrl(outputPath, 3600)
    if (signedError) throw signedError

    // ============ 10. 更新 jobs 表：completed ============
    await supabase
      .from("jobs")
      .update({
        status: "completed",
        output: { outputPath, falRequestId: result.requestId },
        fal_request_id: result.requestId,
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
        cost_usd: 0.04,
      })
      .eq("id", job.id)

    return NextResponse.json({
      jobId: job.id,
      imageUrl: signedData.signedUrl,
      outputPath,
    })
  } catch (error) {
    // ============ 出错处理：更新 jobs 表为 failed ============
    const errorMessage =
      error instanceof Error ? error.message : "生成失败"

    await supabase
      .from("jobs")
      .update({
        status: "failed",
        error: errorMessage,
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id)

    console.error("Tryon API error:", error)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}