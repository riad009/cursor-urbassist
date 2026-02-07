"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  PenTool,
  FileText,
  Image,
  Calculator,
  Download,
  Settings,
  HelpCircle,
  Building2,
  FolderOpen,
} from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Projects", href: "/projects", icon: FolderOpen },
  { name: "Editor", href: "/editor", icon: PenTool },
  { name: "Regulations", href: "/regulations", icon: FileText },
  { name: "Landscape", href: "/landscape", icon: Image },
  { name: "Calculations", href: "/calculations", icon: Calculator },
  { name: "Export", href: "/export", icon: Download },
]

const secondaryNavigation = [
  { name: "Settings", href: "/settings", icon: Settings },
  { name: "Help", href: "/help", icon: HelpCircle },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <TooltipProvider>
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-gray-200 bg-white">
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center gap-3 border-b border-gray-200 px-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 shadow-md">
              <Building2 className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">UrbanDesign</h1>
              <p className="text-xs font-medium text-blue-600">roms09</p>
              <p className="text-[10px] text-gray-400">Demo project for roms09</p>
            </div>
          </div>

          {/* Main Navigation */}
          <nav className="flex-1 space-y-1 px-3 py-4">
            <div className="mb-2 px-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Main
              </p>
            </div>
            {navigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Tooltip key={item.name}>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                        isActive
                          ? "bg-blue-50 text-blue-700"
                          : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "h-5 w-5 flex-shrink-0",
                          isActive ? "text-blue-600" : "text-gray-400"
                        )}
                      />
                      {item.name}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{item.name}</p>
                  </TooltipContent>
                </Tooltip>
              )
            })}

            {/* Secondary Navigation */}
            <div className="mb-2 mt-8 px-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Support
              </p>
            </div>
            {secondaryNavigation.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-5 w-5 flex-shrink-0",
                      isActive ? "text-blue-600" : "text-gray-400"
                    )}
                  />
                  {item.name}
                </Link>
              )
            })}
          </nav>

          {/* User Section */}
          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white">
                <span className="text-sm font-semibold">JD</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">John Doe</p>
                <p className="text-xs text-gray-500 truncate">Pro Plan</p>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  )
}
