"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

export default function Home() {
  const [prompt, setPrompt] = useState("")
  const [loading, setLoading] = useState(false)
  const [resultUrl, setResultUrl] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setResultUrl(null)

    // 暂时用占位图模拟生成，下一步会替换成真实 Fal.ai 调用
    await new Promise((r) => setTimeout(r, 1500))
    setResultUrl(
      `https://picsum.photos/seed/${encodeURIComponent(prompt)}/600/600`
    )
    setLoading(false)
  }

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">AI 照片工作室</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 左侧：输入区 */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">输入</h2>
            <div className="space-y-4">
              <Input
                placeholder="描述你想生成的图片，例如：一只穿着宇航服的猫"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={loading}
              />
              <Button
                onClick={handleGenerate}
                disabled={loading || !prompt.trim()}
                className="w-full"
              >
                {loading ? "生成中..." : "生成图片"}
              </Button>
            </div>
          </Card>

          {/* 右侧：结果区 */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">结果</h2>
            <div className="aspect-square bg-muted rounded-lg flex items-center justify-center overflow-hidden">
              {loading && (
                <p className="text-muted-foreground">生成中...</p>
              )}
              {!loading && !resultUrl && (
                <p className="text-muted-foreground">结果将显示在这里</p>
              )}
              {resultUrl && (
                <img
                  src={resultUrl}
                  alt="Generated"
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          </Card>
        </div>
      </div>
    </main>
  )
}