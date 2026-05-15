"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ImageUploader } from "@/components/ImageUploader"

// 电商常用背景预设（label 是中文给用户看，prompt 是英文给模型）
const BACKGROUND_PRESETS = [
  {
    label: "纯白工作室",
    prompt:
      "professional fashion studio with pure white seamless backdrop, soft diffused studio lighting, clean and bright",
  },
  {
    label: "极简灰背景",
    prompt:
      "minimalist gray seamless backdrop, professional studio lighting, neutral mood",
  },
  {
    label: "城市街拍",
    prompt:
      "urban city street fashion photography, modern buildings, soft daylight, slight bokeh background",
  },
  {
    label: "户外花园",
    prompt:
      "outdoor garden with soft natural sunlight, lush green plants, blurred bokeh background",
  },
  {
    label: "海滩黄昏",
    prompt:
      "beach at golden hour, soft warm sunset light, ocean and sand in background",
  },
  {
    label: "高级复古",
    prompt:
      "vintage luxury interior, marble walls and gold accents, dramatic warm lighting",
  },
  {
    label: "室内家居",
    prompt:
      "modern minimalist home interior, warm soft natural lighting, scandinavian design",
  },
  {
    label: "电影感日落",
    prompt:
      "golden sunset light, warm cinematic lighting, dreamy soft bokeh background",
  },
]

export default function BackgroundPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [imagePath, setImagePath] = useState("")
  const [sourceBucket, setSourceBucket] = useState<"inputs" | "outputs">("inputs")
  const [externalPreview, setExternalPreview] = useState<string | null>(null)
  const [prompt, setPrompt] = useState("")
  const [generating, setGenerating] = useState(false)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enhancing, setEnhancing] = useState(false)

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

  useEffect(() => {
    if (!userId || typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const source = params.get("source")
    const path = params.get("path")

    if ((source === "outputs" || source === "inputs") && path) {
      setImagePath(path)
      setSourceBucket(source)

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
    router.replace("/background")
  }

  const handleGenerate = async () => {
    if (!imagePath || !prompt.trim()) return
    setGenerating(true)
    setResultUrl(null)
    setError(null)

    try {
      const res = await fetch("/api/jobs/background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagePath, prompt, sourceBucket }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "生成失败")

      setResultUrl(data.imageUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败")
    } finally {
      setGenerating(false)
    }
  }
  
  const handleEnhance = async () => {
  if (!prompt.trim() || enhancing) return
  setEnhancing(true)
  setError(null)
  try {
    const res = await fetch("/api/enhance-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "优化失败")
    setPrompt(data.enhanced)
  } catch (err) {
    setError(err instanceof Error ? err.message : "优化失败")
  } finally {
    setEnhancing(false)
  }
}

  if (!userId) {
    return <main className="p-8 text-muted-foreground">加载中...</main>
  }

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">换背景</h1>
        <p className="text-muted-foreground mb-8">
          保留模特和衣服，AI 重新生成背景并自动匹配光影。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* 输入区 */}
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
              label="输入图（模特照片）"
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
            <h3 className="text-sm font-medium mb-2">结果</h3>
            <div className="aspect-square rounded-lg bg-muted flex items-center justify-center overflow-hidden">
              {generating ? (
                <p className="text-muted-foreground text-sm">
                  生成中（30-60 秒）...
                </p>
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
                  下载图片
                </Button>
              </a>
            )}
          </Card>
        </div>

        {/* 背景描述区 */}
        <Card className="p-4 mb-6">
          <div className="flex items-center justify-between mb-3">
  <h3 className="text-sm font-medium">背景描述</h3>
  <Button
    variant="outline"
    size="sm"
    onClick={handleEnhance}
    disabled={!prompt.trim() || enhancing || generating}
    className="text-xs h-7"
  >
    {enhancing ? "✨ 优化中..." : "✨ AI 优化"}
  </Button>
</div>

          <div className="flex flex-wrap gap-2 mb-3">
            {BACKGROUND_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant={prompt === preset.prompt ? "default" : "outline"}
                size="sm"
                onClick={() => setPrompt(preset.prompt)}
                disabled={generating}
                className="text-xs"
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={generating}
            placeholder="点上面的预设，或自己输入英文描述（例如：modern art gallery with white walls and spotlights）"
            className="w-full h-20 px-3 py-2 text-sm rounded-md border border-input bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground mt-2">
            💡 用英文描述效果最好。中文也能用但可能不够精准。
          </p>
        </Card>

        {error && <p className="text-sm text-red-500 mb-4">❌ {error}</p>}

        <Button
          onClick={handleGenerate}
          disabled={!imagePath || !prompt.trim() || generating}
          size="lg"
        >
          {generating ? "生成中..." : "开始换背景"}
        </Button>
      </div>
    </main>
  )
}