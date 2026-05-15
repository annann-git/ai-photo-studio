const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

export async function chatComplete(opts: {
  systemPrompt: string
  userPrompt: string
  model?: string
  maxTokens?: number
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("OPENROUTER_API_KEY 没配置")

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://ai-photo-studio.local",
      "X-Title": "AI Photo Studio",
    },
    body: JSON.stringify({
      model: opts.model || "deepseek/deepseek-chat",
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: opts.userPrompt },
      ],
      max_tokens: opts.maxTokens || 500,
      temperature: 0.7,
    }),
  })

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`OpenRouter 调用失败: ${res.status} ${errorText.slice(0, 200)}`)
  }

  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error("OpenRouter 返回为空")
  return content.trim()
}