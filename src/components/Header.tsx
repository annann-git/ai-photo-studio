"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

const navItems = [
  { href: "/", label: "首页" },
  { href: "/tryon", label: "AI 换装" },
  { href: "/faceswap", label: "换脸" },
  { href: "/background", label: "换背景" },
  { href: "/upscale", label: "高清修复" },
  { href: "/history", label: "历史" },
]

export function Header({ userEmail }: { userEmail: string }) {
  const router = useRouter()
  const pathname = usePathname()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
    router.refresh()
  }

  return (
    <header className="border-b bg-background sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="font-semibold">AI 修图工作室</div>
          <nav className="flex gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  pathname === item.href
                    ? "bg-muted font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{userEmail}</span>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            登出
          </Button>
        </div>
      </div>
    </header>
  )
}