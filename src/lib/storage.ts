import { createClient } from "@/lib/supabase/client"

/**
 * 上传图片到 Supabase Storage
 * @param file 用户选择的文件
 * @param bucket "inputs" | "outputs"
 * @param userId 当前用户 ID（用于路径隔离）
 * @returns 上传后的 storage path（如 "userId/timestamp-name.jpg"）
 */
export async function uploadImage(
  file: File,
  bucket: "inputs" | "outputs",
  userId: string
): Promise<string> {
  const supabase = createClient()

  // 用 时间戳 + 原文件名 防止重名
  const ext = file.name.split(".").pop() || "jpg"
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const path = `${userId}/${filename}`

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    })

  if (error) throw error
  return path
}

/**
 * 给一个 storage path 生成签名 URL（用于浏览器临时访问私有图）
 * @param path storage path
 * @param bucket "inputs" | "outputs"
 * @param expiresIn 有效期（秒），默认 1 小时
 */
export async function getSignedUrl(
  path: string,
  bucket: "inputs" | "outputs",
  expiresIn = 3600
): Promise<string> {
  const supabase = createClient()
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn)

  if (error) throw error
  return data.signedUrl
}