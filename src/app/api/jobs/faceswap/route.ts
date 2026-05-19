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
    facePath,            // 新脸照片（始终在 inputs bucket）
    targetPath,          // 目标模特图（可来自 inputs 或 outputs）
    targetSourceBucket = "inputs",
    workflowType = "target_hair",
    gender = "",
  } = await request.json()

  // 参数校验
  if (!facePath || !targetPath) {
    return NextResponse.json({ error: "缺少图片路径" }, { status: 400 })
  }
  if (targetSourceBucket !== "inputs" && targetSourceBucket !== "outputs") {
    return NextResponse.json({ error: "无效的目标来源" }, { status: 400 })
  }
  if (workflowType !== "user_hair" && workflowType !== "target_hair") {
    return NextResponse.json({ error: "无效的发型策略" }, { status: 400 })
  }
  if (!facePath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "无权访问新脸图片" }, { status: 403 })
  }
  if (!targetPath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "无权访问目标图片" }, { status: 403 })
  }

  // 创建 job
  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .insert({
      user_id: user.id,
      type: "faceswap",
      status: "processing",
      input: { facePath, targetPath, targetSourceBucket, workflowType, gender },
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
    const [faceSigned, targetSigned] = await Promise.all([
      supabase.storage.from("inputs").createSignedUrl(facePath, 600),
      supabase.storage.from(targetSourceBucket).createSignedUrl(targetPath, 600),
    ])

    if (faceSigned.error || targetSigned.error) {
      throw new Error("无法生成签名 URL")
    }

    const falInput: Record<string, unknown> = {
      face_image_0: faceSigned.data.signedUrl,
      target_image: targetSigned.data.signedUrl,
      workflow_type: workflowType,
      upscale: true,
    }
    // 只有用户明确选择了性别才传，否则不传
    if (gender) {
      falInput.gender_0 = gender
    }

    console.log("Fal input:", JSON.stringify({
      ...falInput,
      face_image_0: "<signed_url>",
      target_image: "<signed_url>",
    }))

    const result = await fal.subscribe("easel-ai/advanced-face-swap", {
      input: falInput,
      logs: false,
    })

    console.log("Fal result keys:", Object.keys(result.data || {}))

    const falOutputUrl = result.data?.image?.url
    if (!falOutputUrl) throw new Error("fal.ai 未返回图片")

    const imgResp = await fetch(falOutputUrl)
    if (!imgResp.ok) throw new Error("下载生成图失败")
    const imgBuffer = await imgResp.arrayBuffer()

    const admin = createAdminClient()
    const outputPath = `${user.id}/faceswap-${Date.now()}.png`

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

    const cost = 0.05

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
    console.error("=== Faceswap Error ===")
    console.error("Error type:", error?.constructor?.name)
    console.error("Error:", error)

    let errorMessage = "生成失败"
    let falDetail = ""

    if (error instanceof Error) {
      errorMessage = error.message
      console.error("Error message:", error.message)

      // fal.ai 客户端的错误对象往往有 body / status / response
      const falError = error as unknown as Record<string, unknown>
      if (falError.body) {
        falDetail = typeof falError.body === "string"
          ? falError.body
          : JSON.stringify(falError.body)
        console.error("Fal body:", falDetail)
      }
      if (falError.status) {
        console.error("Fal status:", falError.status)
      }
      if (falError.response) {
        console.error("Fal response:", JSON.stringify(falError.response))
      }
    }

    // 友好提示
    if (errorMessage.includes("Unprocessable Entity") || errorMessage.includes("422")) {
      errorMessage = falDetail
        ? `fal.ai 拒绝：${falDetail}`
        : "fal.ai 无法处理（详情见 Vercel 日志）"
    } else if (errorMessage.includes("Unauthorized") || errorMessage.includes("401")) {
      errorMessage = "fal.ai 认证失败"
    } else if (errorMessage.includes("Payment Required") || errorMessage.includes("402")) {
      errorMessage = "fal.ai 余额不足"
    } else if (errorMessage.includes("Too Many Requests") || errorMessage.includes("429")) {
      errorMessage = "请求太频繁，稍后重试"
    } else if (errorMessage.toLowerCase().includes("timeout")) {
      errorMessage = "生成超时，请重试"
    }

    await supabase
      .from("jobs")
      .update({
        status: "failed",
        error: errorMessage,
        duration_ms: Date.now() - startTime,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id)

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}