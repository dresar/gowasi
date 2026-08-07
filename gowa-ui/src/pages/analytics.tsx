import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  TrendingUp,
  Bot,
  Zap,
  Users,
  MessageSquare,
  Smartphone,
} from 'lucide-react'
import { listChats } from '@/api/chat'
import { listDevices } from '@/api/devices'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GlowCard } from '@/components/ui/glow-card'
import { useBotStore } from '@/stores/bot'
import { useBroadcastStore } from '@/stores/broadcast'

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export default function AnalyticsPage() {
  const { logs } = useBotStore()
  const { jobs } = useBroadcastStore()

  // Real backend queries
  const { data: chatsData } = useQuery({
    queryKey: ['chats'],
    queryFn: () => listChats({ limit: 100 }),
    refetchInterval: 10_000,
  })

  const { data: devices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: listDevices,
    refetchInterval: 10_000,
  })

  const realChats = chatsData?.data ?? []
  const totalBackendChats = chatsData?.pagination?.total ?? realChats.length
  const activeDevices = devices.filter((d) => d.state === 'logged_in')

  const stats = useMemo(() => {
    const now = Date.now()
    const last24h = logs.filter((l) => now - new Date(l.timestamp).getTime() < 86_400_000)
    const last7d = logs.filter((l) => now - new Date(l.timestamp).getTime() < 7 * 86_400_000)

    const autoReplies = logs.filter((l) => l.type === 'auto_reply' && l.status === 'success')
    const aiReplies = logs.filter((l) => l.type === 'ai_reply' && l.status === 'success')
    const broadcasts = logs.filter((l) => l.type === 'broadcast' && l.status === 'success')
    const failures = logs.filter((l) => l.status === 'failed')

    // Combine top contacts from real backend chats AND logs
    const phoneCounts: Record<string, { name: string; count: number }> = {}

    realChats.forEach((c) => {
      const cleanPhone = c.jid.split('@')[0]
      phoneCounts[cleanPhone] = {
        name: c.name || cleanPhone,
        count: (phoneCounts[cleanPhone]?.count ?? 0) + 1,
      }
    })

    logs.forEach((l) => {
      const cleanPhone = l.phone
      phoneCounts[cleanPhone] = {
        name: phoneCounts[cleanPhone]?.name || cleanPhone,
        count: (phoneCounts[cleanPhone]?.count ?? 0) + 1,
      }
    })

    const topPhones = Object.entries(phoneCounts)
      .map(([phone, data]) => ({ phone, name: data.name, count: data.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6)

    // Daily activity (last 7d)
    const daily = Array(7).fill(0)
    last7d.forEach((l) => {
      const dayAgo = Math.floor((now - new Date(l.timestamp).getTime()) / 86_400_000)
      if (dayAgo < 7) daily[6 - dayAgo]++
    })

    const broadcastSent = jobs.reduce(
      (a, j) => a + j.recipients.filter((r) => r.status === 'sent').length,
      0,
    )

    return {
      totalLogs: logs.length,
      last24h: last24h.length,
      autoReplies: autoReplies.length,
      aiReplies: aiReplies.length,
      broadcasts: broadcasts.length,
      broadcastSent,
      failures: failures.length,
      topPhones,
      daily,
      maxDaily: Math.max(...daily, 1),
    }
  }, [logs, jobs, realChats])

  const dayLabels = ['6d', '5d', '4d', '3d', '2d', '1d', 'hari ini']

  return (
    <div className="flex flex-col gap-6">
      {/* Real Backend KPI Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Real Backend Chats Count */}
        <GlowCard glowColor="rgba(99,102,241,0.25)">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
              <MessageSquare className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold font-mono tracking-tight">{totalBackendChats}</p>
              <p className="text-muted-foreground text-xs font-medium">Chat WhatsApp Aktif</p>
            </div>
          </CardContent>
        </GlowCard>

        {/* Active Connected Devices */}
        <GlowCard glowColor="rgba(16,185,129,0.25)">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <Smartphone className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
                {activeDevices.length} / {devices.length}
              </p>
              <p className="text-muted-foreground text-xs font-medium">Device WA Connected</p>
            </div>
          </CardContent>
        </GlowCard>

        {/* AI Replies */}
        <GlowCard glowColor="rgba(168,85,247,0.25)">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
              <Zap className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold font-mono tracking-tight text-purple-600 dark:text-purple-400">{stats.aiReplies}</p>
              <p className="text-muted-foreground text-xs font-medium">Balasan AI Sukses</p>
            </div>
          </CardContent>
        </GlowCard>

        {/* Auto Reply Bot */}
        <GlowCard glowColor="rgba(59,130,246,0.25)">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <Bot className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold font-mono tracking-tight text-blue-600 dark:text-blue-400">{stats.autoReplies}</p>
              <p className="text-muted-foreground text-xs font-medium">Auto-Reply Triggered</p>
            </div>
          </CardContent>
        </GlowCard>
      </div>

      {/* Real Backend Status Summary & Broadcast Stats */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Trend Activity */}
        <Card className="rounded-2xl shadow-sm border-border/80">
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <TrendingUp className="size-4 text-blue-500" />
              Tren Otomatisasi & Balasan AI (7 Hari Terakhir)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5 flex flex-col gap-4">
            {stats.daily.map((count, idx) => (
              <div key={idx} className="flex flex-col gap-1">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-muted-foreground">{dayLabels[idx]}</span>
                  <span className="font-mono font-bold text-foreground">{count} pesan terproses</span>
                </div>
                <MiniBar value={count} max={stats.maxDaily} color="bg-blue-500" />
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top Interacted WhatsApp Contacts (Real Backend SQLite + Bot Logs) */}
        <Card className="rounded-2xl shadow-sm border-border/80">
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="size-4 text-purple-500" />
              Kontak WhatsApp Aktif (Database Server)
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5 flex flex-col gap-3">
            {stats.topPhones.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-4 text-center">
                Belum ada kontak terdaftar atau pesan percakapan aktif.
              </p>
            ) : (
              stats.topPhones.map((item, idx) => (
                <div key={item.phone} className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/20 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary font-mono font-bold text-[11px]">
                      #{idx + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-foreground">{item.name}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{item.phone}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="font-mono font-bold text-xs">
                    {item.count} interaksi
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
