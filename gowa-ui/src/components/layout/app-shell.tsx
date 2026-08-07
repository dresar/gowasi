import { useState } from 'react'
import {
  BarChart3,
  Bot,
  Brain,
  Clock,
  FileText,
  LayoutDashboard,
  Link2,
  Loader2,
  Megaphone,
  Menu,
  MessagesSquare,
  Send,
  Settings,
  Shield,
  Target,
  UserRound,
  Users,
  UsersRound,
  Wrench,
} from 'lucide-react'
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom'
import { DeviceSwitcher } from '@/components/layout/device-switcher'
import { Logo } from '@/components/layout/logo'
import { ThemeToggle } from '@/components/layout/theme-toggle'
import { WsBadge } from '@/components/layout/ws-badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { PasskeyDialog } from '@/features/session/passkey-dialog'
import { cn } from '@/lib/utils'
import { useConnection } from '@/stores/connection'

const routeMeta: Record<string, { title: string; subtitle: string; icon: any; color: string }> = {
  '/': { title: 'Devices', subtitle: 'WhatsApp Accounts & Sesi Login', icon: LayoutDashboard, color: 'text-indigo-500 bg-indigo-500/10' },
  '/messaging': { title: 'Messaging', subtitle: 'Kirim Text, Media, File, Poll & Sticker', icon: Send, color: 'text-blue-500 bg-blue-500/10' },
  '/chats': { title: 'Chats & History', subtitle: 'Riwayat Percakapan & Pesan Local', icon: MessagesSquare, color: 'text-emerald-500 bg-emerald-500/10' },
  '/templates': { title: 'Template Pesan', subtitle: 'Simpan dan Kelola Template Pesan', icon: FileText, color: 'text-amber-500 bg-amber-500/10' },
  '/auto-reply': { title: 'Auto Reply Bot', subtitle: 'Balas Pesan Masuk Otomatis Berdasarkan Keyword', icon: Bot, color: 'text-emerald-500 bg-emerald-500/10' },
  '/broadcast': { title: 'Broadcast Massal', subtitle: 'Kirim Pesan Massal dengan Anti-Ban Delay', icon: Megaphone, color: 'text-purple-500 bg-purple-500/10' },
  '/scheduler': { title: 'Pesan Terjadwal', subtitle: 'Jadwalkan Pengiriman Pesan Otomatis', icon: Clock, color: 'text-cyan-500 bg-cyan-500/10' },
  '/campaigns': { title: 'Campaign Drip', subtitle: 'Multi-Step Drip Messaging Campaign', icon: Target, color: 'text-pink-500 bg-pink-500/10' },
  '/ai-assistant': { title: 'AI Assistant & One Key Hub', subtitle: 'Bot Cerdas Gemini & Custom AI', icon: Brain, color: 'text-violet-500 bg-violet-500/10' },
  '/analytics': { title: 'Analitik & Performa', subtitle: 'Statistik Pengiriman & Performa Bot', icon: BarChart3, color: 'text-blue-500 bg-blue-500/10' },
  '/contacts': { title: 'Kontak & Database', subtitle: 'Manajemen Daftar Kontak & Label', icon: Users, color: 'text-emerald-500 bg-emerald-500/10' },
  '/groups': { title: 'WhatsApp Groups', subtitle: 'Kelola Peserta & Informasi Grup', icon: UsersRound, color: 'text-indigo-500 bg-indigo-500/10' },
  '/account': { title: 'Profil Akun', subtitle: 'Informasi Akun WhatsApp', icon: UserRound, color: 'text-amber-500 bg-amber-500/10' },
  '/webhooks': { title: 'Webhooks & Logs', subtitle: 'Monitor WebSocket & Event Retries', icon: Link2, color: 'text-teal-500 bg-teal-500/10' },
  '/security': { title: 'Keamanan & Blocklist', subtitle: 'Audit Log & Daftar Nomor Diblokir', icon: Shield, color: 'text-red-500 bg-red-500/10' },
  '/misc': { title: 'Channels & Calls', subtitle: 'Fitur Saluran & Riwayat Panggilan', icon: Wrench, color: 'text-slate-500 bg-slate-500/10' },
  '/settings': { title: 'Settings & Backend', subtitle: 'URL Backend REST & Tampilan UI', icon: Settings, color: 'text-indigo-500 bg-indigo-500/10' },
}

const navGroups = [
  {
    label: 'Overview',
    items: [{ to: '/', label: 'Devices', icon: LayoutDashboard }],
  },
  {
    label: 'Messaging',
    items: [
      { to: '/messaging', label: 'Messaging', icon: Send },
      { to: '/chats', label: 'Chats', icon: MessagesSquare },
      { to: '/templates', label: 'Templates', icon: FileText },
    ],
  },
  {
    label: 'Bot & Automation',
    items: [
      { to: '/auto-reply', label: 'Auto Reply', icon: Bot },
      { to: '/broadcast', label: 'Broadcast', icon: Megaphone },
      { to: '/scheduler', label: 'Scheduler', icon: Clock },
      { to: '/campaigns', label: 'Campaigns', icon: Target },
    ],
  },
  {
    label: 'AI & Intelligence',
    items: [
      { to: '/ai-assistant', label: 'AI Assistant', icon: Brain },
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Directory',
    items: [
      { to: '/contacts', label: 'Contacts', icon: Users },
      { to: '/groups', label: 'Groups', icon: UsersRound },
      { to: '/account', label: 'Account', icon: UserRound },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/webhooks', label: 'Webhooks', icon: Link2 },
      { to: '/security', label: 'Security & Logs', icon: Shield },
      { to: '/misc', label: 'Channels & Calls', icon: Wrench },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-5">
      {navGroups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="text-muted-foreground/60 px-3 text-[10px] font-bold tracking-widest uppercase">
            {group.label}
          </p>
          {group.items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              <Icon className="size-4 shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  )
}

export function AppShell() {
  const status = useConnection((state) => state.status)
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const currentMeta = routeMeta[location.pathname] || routeMeta['/']

  if (status === 'booting') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="text-primary size-8 animate-spin" />
      </div>
    )
  }

  if (status !== 'connected') {
    return <Navigate to="/connect" replace />
  }

  return (
    <div className="relative min-h-screen bg-background antialiased">
      {/* Fixed Desktop Sidebar (w-60 = 240px wide) */}
      <aside className="bg-card text-card-foreground fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r h-screen lg:flex">
        <div className="flex h-16 items-center border-b px-5 shrink-0">
          <Logo />
        </div>
        <ScrollArea className="h-[calc(100vh-4rem)] px-4 py-5">
          <NavContent />
        </ScrollArea>
      </aside>

      {/* Mobile Drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="bg-card w-72 p-0 flex flex-col h-full">
          <SheetHeader className="border-b px-5 h-16 flex justify-center shrink-0">
            <SheetTitle asChild>
              <div>
                <Logo />
              </div>
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-4rem)] px-4 py-5">
            <NavContent onNavigate={() => setMobileNavOpen(false)} />
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Fixed Top Header Bar with Dynamic Active Page Title */}
      <header className="fixed top-0 left-0 right-0 lg:left-60 z-20 flex h-16 items-center justify-between gap-3 border-b bg-background/90 backdrop-blur-md px-4 sm:px-6">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden shrink-0"
            aria-label="Open navigation"
            onClick={() => setMobileNavOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
          {currentMeta && (
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl font-bold shadow-xs', currentMeta.color)}>
                <currentMeta.icon className="size-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <h1 className="text-sm sm:text-base font-bold tracking-tight truncate leading-tight text-foreground">
                  {currentMeta.title}
                </h1>
                <p className="text-muted-foreground text-[11px] truncate hidden sm:block">
                  {currentMeta.subtitle}
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
          <DeviceSwitcher />
          <WsBadge />
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content Area (Spacious pt-24 = 96px top padding, px-6 sm:px-10) */}
      <main className="lg:pl-72 pt-24 px-6 sm:px-10 pb-16 min-h-screen">
        <div key={location.pathname} className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>

      <PasskeyDialog />
    </div>
  )
}
