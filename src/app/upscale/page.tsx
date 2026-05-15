"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ImageUploader } from "@/components/ImageUploader"

export default function UpscalePage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [imagePath, setImagePath] = useState("")
  const [sourceBucket, setSourceBucket] = useState<"inputs" | "outputs">("inputs")
  const [externalPreview, setExternalPreview] = useState<string | null>(null)
  const [upscaleFactor, setUpscaleFactor] = useState(2)
  const [generating, setGenerating] = useState(false)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [outputInfo, setOutputInfo] = useState<{
    w: number
    h: number
    cost: number
  } | null>(null)

  // 1. 先拿到 userId
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.push("/login")
        return
      }
      setUserId(data.user.id)
    })
  }, [router])

  // 2. userId 拿到后，检查 URL 参数（从历史页跳过来的情况）
  useEffect(() => {
    if (!userId || typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const source = params.get("source")
    const path = params.get("path")

    if ((source === "outputs" || source === "inputs") && path) {
      setImagePath(path)
      setSourceBucket(source)

      // 生成签名 URL 用于预览
      const supabase = createClient()
      supabase.storage
        .from(source)
        .createSignedUrl(path, 3600)
        .then(({ data, error }) => {
          if (data && !error) setExternalPreview(data.signedUrl)
        })
    }
  }, [userId])

  const handleReplaceImage = () => {
    setExternalPreview(null)
    setImagePath("")
    setSourceBucket("inputs")
    // 清掉 URL 参数（用户体验干净）
    router.replace("/upscale")
  }

  const handleGenerate = async () => {
    if (!imagePath) return
    setGenerating(true)
    setResultUrl(null)
    setError(null)
    setOutputInfo(null)

    try {
      const res = await fetch("/api/jobs/upscale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagePath, upscaleFactor, sourceBucket }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "生成失败")

      setResultUrl(data.imageUrl)
      setOutputInfo({ w: data.width, h: data.height, cost: data.cost })
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败")
    } finally {
      setGenerating(false)
    }
  }

  if (!userId) {
    return <main className="p-8 text-muted-foreground">加载中...</main>
  }

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">高清修复</h1>
        <p className="text-muted-foreground mb-8">
          上传一张图，AI 放大并增强细节。设置为"忠实原图"模式，不会乱加内容。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* 输入区：根据是否有外部预览，显示不同 UI */}
          {externalPreview ? (
            <Card className="p-4">
              <h3 className="text-sm font-medium mb-2">
                输入图{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  （来自历史）
                </span>
              </h3>
              <div className="aspect-square rounded-lg bg-muted overflow-hidden">
                <img
                  src={externalPreview}
                  alt="输入"
                  className="w-full h-full object-cover"
                />
              </div>
              <Button
                onClick={handleReplaceImage}
                variant="outline"
                size="sm"
                className="w-full mt-2"
                disabled={generating}
              >
                换一张图
              </Button>
            </Card>
          ) : (
            <ImageUploader
              label="输入图"
              userId={userId}
              onUploaded={(path) => {
                setImagePath(path)
                setSourceBucket("inputs")
              }}
              disabled={generating}
            />
          )}

          {/* 结果区 */}
          <Card className="p-4">
            <h3 className="text-sm font-medium mb-2">
              结果{" "}
              {outputInfo && (
                <span className="text-muted-foreground font-normal">
                  ({outputInfo.w} × {outputInfo.h} · ${outputInfo.cost})
                </span>
              )}
            </h3>
            <div className="aspect-square rounded-lg bg-muted flex items-center justify-center overflow-hidden">
              {generating ? (
                <p className="text-muted-foreground text-sm">生成中...</p>
              ) : resultUrl ? (
                <img
                  src={resultUrl}
                  alt="结果"
                  className="w-full h-full object-contain"
                />
              ) : (
                <p className="text-muted-foreground text-sm">等待生成</p>
              )}
            </div>
            {resultUrl && !generating && (
              <a
                href={resultUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm" className="w-full mt-2">
                  下载高清图
                </Button>
              </a>
            )}
          </Card>
        </div>

        <Card className="p-4 mb-6 bg-muted/30">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm font-medium">放大倍数：</span>
            <div className="flex gap-2">
              {[2, 4].map((n) => (
                <Button
                  key={n}
                  variant={upscaleFactor === n ? "default" : "outline"}
                  size="sm"
                  onClick={() => setUpscaleFactor(n)}
                  disabled={generating}
                >
                  {n}x
                </Button>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">
              预估成本：{upscaleFactor === 2 ? "$0.05-0.15" : "$0.20-0.60"} ·
              耗时：{upscaleFactor === 2 ? "20-30 秒" : "40-60 秒"}
            </span>
          </div>
        </Card>

        {error && <p className="text-sm text-red-500 mb-4">❌ {error}</p>}

        <Button
          onClick={handleGenerate}
          disabled={!imagePath || generating}
          size="lg"
        >
          {generating ? "生成中..." : "开始高清修复"}
        </Button>
      </div>
    </main>
  )
}