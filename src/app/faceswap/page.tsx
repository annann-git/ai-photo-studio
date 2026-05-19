"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ImageUploader } from "@/components/ImageUploader"

const WORKFLOW_OPTIONS = [
  { value: "target_hair", label: "保留原发型", desc: "推荐电商" },
  { value: "user_hair", label: "用新脸的发型", desc: "整体换人" },
]

const GENDER_OPTIONS = [
  { value: "", label: "自动检测" },
  { value: "female", label: "女" },
  { value: "male", label: "男" },
]

export default function FaceSwapPage() {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [facePath, setFacePath] = useState("")
  const [targetPath, setTargetPath] = useState("")
  const [targetSourceBucket, setTargetSourceBucket] = useState<"inputs" | "outputs">("inputs")
  const [externalTargetPreview, setExternalTargetPreview] = useState<string | null>(null)
  const [workflowType, setWorkflowType] = useState("target_hair")
  const [gender, setGender] = useState("")
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

  useEffect(() => {
    if (!userId || typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const source = params.get("source")
    const path = params.get("path")

    if ((source === "outputs" || source === "inputs") && path) {
      setTargetPath(path)
      setTargetSourceBucket(source)

      const supabase = createClient()
      supabase.storage
        .from(source)
        .createSignedUrl(path, 3600)
        .then(({ data, error }) => {
          if (data && !error) setExternalTargetPreview(data.signedUrl)
        })
    }
  }, [userId])

  const handleReplaceTarget = () => {
    setExternalTargetPreview(null)
    setTargetPath("")
    setTargetSourceBucket("inputs")
    router.replace("/faceswap")
  }

  const handleGenerate = async () => {
    if (!facePath || !targetPath) return
    setGenerating(true)
    setResultUrl(null)
    setError(null)

    try {
      const res = await fetch("/api/jobs/faceswap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facePath,
          targetPath,
          targetSourceBucket,
          workflowType,
          gender,
        }),
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
        <h1 className="text-3xl font-bold mb-2">模特换脸</h1>
        <p className="text-muted-foreground mb-8">
          上传一张新脸 + 一张目标模特图，AI 把脸换上去，保留衣服、姿势、背景。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <ImageUploader
            label="① 新脸（清晰正面照最佳）"
            userId={userId}
            onUploaded={(path) => setFacePath(path)}
            disabled={generating}
          />

          {externalTargetPreview ? (
            <Card className="p-4">
              <h3 className="text-sm font-medium mb-2">
                ② 目标模特图{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  （来自历史）
                </span>
              </h3>
              <div className="aspect-square rounded-lg bg-muted overflow-hidden">
                <img
                  src={externalTargetPreview}
                  alt="目标"
                  className="w-full h-full object-cover"
                />
              </div>
              <Button
                onClick={handleReplaceTarget}
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
              label="② 目标模特图"
              userId={userId}
              onUploaded={(path) => {
                setTargetPath(path)
                setTargetSourceBucket("inputs")
              }}
              disabled={generating}
            />
          )}

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

        <Card className="p-4 mb-6 bg-muted/30">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">发型策略</label>
              <div className="flex gap-2 flex-wrap">
                {WORKFLOW_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    variant={workflowType === opt.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setWorkflowType(opt.value)}
                    disabled={generating}
                  >
                    {opt.label}
                    <span className="ml-2 text-xs opacity-70">
                      ({opt.desc})
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">
                性别提示（提升准确度）
              </label>
              <div className="flex gap-2">
                {GENDER_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    variant={gender === opt.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setGender(opt.value)}
                    disabled={generating}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {error && <p className="text-sm text-red-500 mb-4">❌ {error}</p>}

        <Button
          onClick={handleGenerate}
          disabled={!facePath || !targetPath || generating}
          size="lg"
        >
          {generating ? "生成中（20-40 秒）..." : "开始换脸"}
        </Button>
      </div>
    </main>
  )
}