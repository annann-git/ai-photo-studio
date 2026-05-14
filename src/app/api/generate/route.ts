import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { prompt } = await request.json();
  const falKey = process.env.FAL_KEY; // 从 .env.local 读取

  // 这里写调用 fal.ai 的逻辑
  const response = await fetch('https://fal.run/fal-ai/fast-sdxl', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${falKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt })
  });

  const data = await response.json();
  return NextResponse.json(data);
}