"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ImageUploader } from "@/components/ImageUploader"

export default function TryOnPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [personPath, setPersonPath] = useState("")
  const [garmentPath, setGarmentPath] = useState("")
  const [generating, setGenerating] = useState(false)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  const handleGenerate = async () => {
    if (!personPath || !garmentPath) return
    setGenerating(true)
    setResultUrl(null)
    setError(null)

    try {
      const res = await fetch("/api/jobs/tryon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personPath, garmentPath }),
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

  if (!userId) {
    return <main className="p-8 text-muted-foreground">加载中...</main>
  }

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">AI 换装</h1>
        <p className="text-muted-foreground mb-8">
          上传一张模特照片 + 一张衣服平铺图，AI 会把衣服穿到模特身上
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <ImageUploader
            label="① 模特照片"
            userId={userId}
            onUploaded={(path) => setPersonPath(path)}
            disabled={generating}
          />
          <ImageUploader
            label="② 衣服图（平铺/挂拍均可）"
            userId={userId}
            onUploaded={(path) => setGarmentPath(path)}
            disabled={generating}
          />
          <Card className="p-4">
            <h3 className="text-sm font-medium mb-2">③ 生成结果</h3>
            <div className="aspect-square rounded-lg bg-muted flex items-center justify-center overflow-hidden">
              {generating ? (
                <p className="text-muted-foreground text-sm">生成中...</p>
              ) : resultUrl ? (
                <img
                  src={resultUrl}
                  alt="结果"
                  className="w-full h-full object-cover"
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

        {error && (
          <p className="text-sm text-red-500 mb-4">❌ {error}</p>
        )}

        <Button
          onClick={handleGenerate}
          disabled={!personPath || !garmentPath || generating}
          className="w-full md:w-auto"
          size="lg"
        >
          {generating ? "生成中（约 15-20 秒）..." : "开始换装"}
        </Button>
      </div>
    </main>
  )
}