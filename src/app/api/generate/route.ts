import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json()
    const falKey = process.env.FAL_KEY

    if (!falKey) {
      return NextResponse.json({ error: "FAL_KEY 没配置" }, { status: 500 })
    }

    const response = await fetch("https://fal.run/fal-ai/fast-sdxl", {
      method: "POST",
      headers: {
        Authorization: `Key ${falKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: data.detail || data.message || "fal.ai 生成失败" },
        { status: response.status }
      )
    }

    const imageUrl = data.images?.[0]?.url
    if (!imageUrl) {
      return NextResponse.json({ error: "fal.ai 没返回图片 URL" }, { status: 500 })
    }

    return NextResponse.json({ imageUrl })
  } catch (error) {
    console.error("API route error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "未知错误" },
      { status: 500 }
    )
  }
}