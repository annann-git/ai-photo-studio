import { createClient } from "@supabase/supabase-js"

// ⚠️ 只能在服务端使用！绕过所有 RLS，拥有数据库最高权限
// 用途：API 路由里需要无视权限做事的场景（写日志、批量操作）
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}