"use client"

import { useState, useRef } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { uploadImage } from "@/lib/storage"

interface ImageUploaderProps {
  label: string                             // 显示给用户的标题，如"模特照片"
  userId: string
  onUploaded: (path: string, previewUrl: string) => void  // 上传成功回调
  disabled?: boolean
}

export function ImageUploader({
  label,
  userId,
  onUploaded,
  disabled,
}: ImageUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("请选择图片文件")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("图片不能超过 10MB")
      return
    }

    setError(null)
    setUploading(true)

    // 本地预览（不等服务器响应，提升体验）
    const localPreview = URL.createObjectURL(file)
    setPreview(localPreview)

    try {
      const path = await uploadImage(file, "inputs", userId)
      onUploaded(path, localPreview)
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败")
      setPreview(null)
    } finally {
      setUploading(false)
    }
  }

  const handleClick = () => inputRef.current?.click()

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (disabled || uploading) return
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium mb-2">{label}</h3>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
        disabled={disabled || uploading}
      />
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className={`
          aspect-square rounded-lg border-2 border-dashed
          flex items-center justify-center cursor-pointer
          overflow-hidden transition-colors
          ${disabled || uploading ? "opacity-50 cursor-not-allowed" : "hover:border-primary"}
          ${preview ? "border-solid border-muted" : "border-muted-foreground/30"}
        `}
      >
        {preview ? (
          <img src={preview} alt={label} className="w-full h-full object-cover" />
        ) : (
          <div className="text-center text-sm text-muted-foreground p-4">
            {uploading ? "上传中..." : <>点击或拖入图片<br />（≤ 10MB）</>}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      {preview && !uploading && (
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-2"
          onClick={() => {
            setPreview(null)
            if (inputRef.current) inputRef.current.value = ""
            onUploaded("", "")
          }}
          disabled={disabled}
        >
          重新选择
        </Button>
      )}
    </Card>
  )
}