import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

const TYPE_LABELS: Record<string, string> = {
  tryon: "AI 换装",
  faceswap: "模特换脸",
  pose: "换姿势",
  background: "换背景",
  upscale: "高清修复",
}

const STATUS_STYLES: Record<string, { text: string; className: string }> = {
  completed: { text: "已完成", className: "bg-green-100 text-green-700" },
  failed: { text: "失败", className: "bg-red-100 text-red-700" },
  processing: { text: "处理中", className: "bg-yellow-100 text-yellow-700" },
  pending: { text: "等待中", className: "bg-gray-100 text-gray-700" },
}

// 筛选选项
const TYPE_FILTERS = [
  { value: "all", label: "全部" },
  { value: "tryon", label: "AI 换装" },
  { value: "background", label: "换背景" },
  { value: "upscale", label: "高清修复" },
]

const STATUS_FILTERS = [
  { value: "all", label: "全部" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
]

type JobRow = {
  id: string
  type: string
  status: string
  input: Record<string, unknown> | null
  output: { outputPath?: string } | null
  error: string | null
  cost_usd: number
  duration_ms: number | null
  created_at: string
}

// 构造保留其他筛选条件的 URL
function buildParams(params: { type?: string; status?: string }) {
  const search = new URLSearchParams()
  if (params.type && params.type !== "all") search.set("type", params.type)
  if (params.status && params.status !== "all") search.set("status", params.status)
  const str = search.toString()
  return str ? `?${str}` : ""
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string }>
}) {
  const { type: filterType = "all", status: filterStatus = "all" } =
    await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // 构造查询
  let query = supabase
    .from("jobs")
    .select(
      "id, type, status, input, output, error, cost_usd, duration_ms, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100) // 多查一点，方便筛选

  if (filterType !== "all") query = query.eq("type", filterType)
  if (filterStatus !== "all") query = query.eq("status", filterStatus)

  const { data: jobs, error } = await query

  if (error) {
    return (
      <main className="p-8">
        <p className="text-red-500">加载失败：{error.message}</p>
      </main>
    )
  }

  const jobsWithUrls = await Promise.all(
    (jobs ?? []).map(async (job: JobRow) => {
      let outputUrl: string | null = null
      if (job.status === "completed" && job.output?.outputPath) {
        const { data } = await supabase.storage
          .from("outputs")
          .createSignedUrl(job.output.outputPath, 3600)
        outputUrl = data?.signedUrl ?? null
      }
      return { ...job, outputUrl }
    })
  )

  const totalCost = jobsWithUrls.reduce((sum, j) => sum + (j.cost_usd || 0), 0)
  const completedCount = jobsWithUrls.filter(
    (j) => j.status === "completed"
  ).length

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">历史记录</h1>
            <p className="text-muted-foreground">
              按时间倒序。点击 →按钮 把任意一张图送到下一道工序。
            </p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <div>
              {jobsWithUrls.length} 个任务（{completedCount} 个成功）
            </div>
            <div>累计成本 ${totalCost.toFixed(4)}</div>
          </div>
        </div>

        {/* 筛选条 */}
        <Card className="p-4 mb-6 bg-muted/30">
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground w-12">
                类型
              </span>
              {TYPE_FILTERS.map((t) => (
                <Link
                  key={t.value}
                  href={`/history${buildParams({ type: t.value, status: filterStatus })}`}
                  className={`px-3 py-1 rounded-md text-xs transition-colors ${
                    filterType === t.value
                      ? "bg-foreground text-background"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  {t.label}
                </Link>
              ))}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground w-12">
                状态
              </span>
              {STATUS_FILTERS.map((s) => (
                <Link
                  key={s.value}
                  href={`/history${buildParams({ type: filterType, status: s.value })}`}
                  className={`px-3 py-1 rounded-md text-xs transition-colors ${
                    filterStatus === s.value
                      ? "bg-foreground text-background"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  {s.label}
                </Link>
              ))}
            </div>
          </div>
        </Card>

        {jobsWithUrls.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            {filterType !== "all" || filterStatus !== "all" ? (
              <>
                没有符合筛选条件的任务。
                <Link href="/history" className="underline ml-2">
                  清空筛选
                </Link>
              </>
            ) : (
              <>
                还没有任何任务。去{" "}
                <Link href="/tryon" className="underline">
                  AI 换装
                </Link>{" "}
                做第一个吧。
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {jobsWithUrls.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function JobCard({
  job,
}: {
  job: JobRow & { outputUrl: string | null }
}) {
  const status = STATUS_STYLES[job.status] || STATUS_STYLES.pending
  const typeLabel = TYPE_LABELS[job.type] || job.type
  const date = new Date(job.created_at).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  const canSendNext = job.status === "completed" && job.output?.outputPath
  const sourceParams = canSendNext
    ? `source=outputs&path=${encodeURIComponent(job.output!.outputPath!)}`
    : ""

  // 给 background 任务显示 prompt 摘要
  const promptSummary =
    job.type === "background" && typeof job.input?.prompt === "string"
      ? (job.input.prompt as string).slice(0, 40)
      : null

  return (
    <Card className="overflow-hidden p-0">
      <div className="aspect-square bg-muted relative">
        {job.outputUrl ? (
          <a href={job.outputUrl} target="_blank" rel="noopener noreferrer">
            <img
              src={job.outputUrl}
              alt={typeLabel}
              className="w-full h-full object-cover hover:opacity-90 transition-opacity cursor-zoom-in"
            />
          </a>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs p-4 text-center">
            {job.status === "failed"
              ? "❌ " + (job.error?.slice(0, 50) || "失败")
              : "处理中..."}
          </div>
        )}
        <span
          className={`absolute top-2 right-2 px-2 py-0.5 rounded text-xs font-medium ${status.className}`}
        >
          {status.text}
        </span>
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium">{typeLabel}</span>
          {job.cost_usd > 0 && (
            <span className="text-xs text-muted-foreground">
              ${Number(job.cost_usd).toFixed(3)}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{date}</p>
        {promptSummary && (
          <p
            className="text-xs text-muted-foreground mt-1 truncate"
            title={job.input?.prompt as string}
          >
            "{promptSummary}..."
          </p>
        )}

        {canSendNext && (
          <div className="flex flex-wrap gap-1 mt-2">
            <Link href={`/upscale?${sourceParams}`} className="flex-1 min-w-[60px]">
              <Button variant="outline" size="sm" className="w-full text-xs h-7">
                → 修复
              </Button>
            </Link>
            <Link href={`/background?${sourceParams}`} className="flex-1 min-w-[60px]">
              <Button variant="outline" size="sm" className="w-full text-xs h-7">
                → 背景
              </Button>
            </Link>
          </div>
        )}
      </div>
    </Card>
  )
}