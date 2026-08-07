import { useState } from 'react'
import {
  Shield,
  AlertTriangle,
  Trash2,
  Search,
  Lock,
  Unlock,
  Download,
  CheckCircle2,
  XCircle,
  Bot,
  Zap,
  Megaphone,
  CalendarDays,
  Plus,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GlowCard } from '@/components/ui/glow-card'
import { AnimatedList } from '@/components/ui/animated-list'
import { useBotStore, type ActivityLog } from '@/stores/bot'

type LogFilter = 'all' | ActivityLog['type'] | ActivityLog['status']

const TYPE_ICONS: Record<ActivityLog['type'], React.ReactNode> = {
  auto_reply: <Bot className="size-3.5 text-emerald-500" />,
  ai_reply: <Zap className="size-3.5 text-purple-500" />,
  broadcast: <Megaphone className="size-3.5 text-orange-500" />,
  scheduled: <CalendarDays className="size-3.5 text-blue-500" />,
  manual: <CheckCircle2 className="size-3.5 text-sky-500" />,
  error: <AlertTriangle className="size-3.5 text-red-500" />,
}

const TYPE_LABELS: Record<ActivityLog['type'], string> = {
  auto_reply: 'Auto Reply',
  ai_reply: 'AI Reply',
  broadcast: 'Broadcast',
  scheduled: 'Scheduled',
  manual: 'Manual',
  error: 'Error',
}

function formatDatetime(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function SecurityPage() {
  const { logs, blockedNumbers, blockNumber, unblockNumber, clearLogs } = useBotStore()
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<LogFilter>('all')
  const [blockInput, setBlockInput] = useState('')
  const [blockReason, setBlockReason] = useState('')

  const filteredLogs = logs.filter((log) => {
    const matchSearch =
      log.phone.includes(search) ||
      log.message.toLowerCase().includes(search.toLowerCase())
    const matchType =
      typeFilter === 'all' ||
      log.type === typeFilter ||
      log.status === typeFilter
    return matchSearch && matchType
  })

  function handleExportLogs() {
    const csv =
      'timestamp,type,phone,status,message,error\n' +
      logs
        .map(
          (l) =>
            `"${l.timestamp}","${l.type}","${l.phone}","${l.status}","${l.message.replace(/"/g, '""')}","${l.error ?? ''}"`,
        )
        .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gowa-logs-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Log diekspor ke CSV')
  }

  function handleAddBlock() {
    if (!blockInput) {
      toast.error('Masukkan nomor WhatsApp')
      return
    }
    blockNumber(blockInput.replace(/[^0-9]/g, ''), blockReason || undefined)
    toast.success(`Nomor ${blockInput} diblokir`)
    setBlockInput('')
    setBlockReason('')
  }

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Stats (Directly below top header) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <GlowCard glowColor="rgba(100,116,139,0.25)">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-slate-500/10 text-slate-500 flex items-center justify-center shrink-0">
              <Shield className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold font-mono tracking-tight">{logs.length}</p>
              <p className="text-muted-foreground text-xs font-medium">Total Log</p>
            </div>
          </CardContent>
        </GlowCard>

        <GlowCard glowColor="rgba(16,185,129,0.25)">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
                {logs.filter((l) => l.status === 'success').length}
              </p>
              <p className="text-muted-foreground text-xs font-medium">Berhasil</p>
            </div>
          </CardContent>
        </GlowCard>

        <GlowCard glowColor="rgba(239,68,68,0.25)">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
              <XCircle className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold font-mono tracking-tight text-red-600 dark:text-red-400">
                {logs.filter((l) => l.status === 'failed').length}
              </p>
              <p className="text-muted-foreground text-xs font-medium">Gagal</p>
            </div>
          </CardContent>
        </GlowCard>

        <GlowCard glowColor="rgba(245,158,11,0.25)">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <Lock className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold font-mono tracking-tight text-amber-600 dark:text-amber-400">
                {blockedNumbers.length}
              </p>
              <p className="text-muted-foreground text-xs font-medium">Diblokir</p>
            </div>
          </CardContent>
        </GlowCard>
      </div>

      {/* Control Bar: Export + Clear Log Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-card p-4 rounded-2xl border border-border/80 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari log berdasarkan nomor / pesan..."
            className="pl-10 rounded-xl h-10 text-sm border-border/60"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as LogFilter)}>
            <SelectTrigger className="rounded-xl h-10 w-36">
              <SelectValue placeholder="Semua Tipe" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">Semua Tipe</SelectItem>
              <SelectItem value="auto_reply">Auto Reply</SelectItem>
              <SelectItem value="ai_reply">AI Reply</SelectItem>
              <SelectItem value="broadcast">Broadcast</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={handleExportLogs} className="rounded-xl h-10 gap-2 font-medium">
            <Download className="size-4" /> Export CSV
          </Button>

          <Button
            variant="outline"
            onClick={() => {
              clearLogs()
              toast.success('Log dibersihkan')
            }}
            className="rounded-xl h-10 gap-2 font-medium text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" /> Clear Logs
          </Button>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Logs Stream */}
        <div className="lg:col-span-2">
          <Card className="rounded-2xl shadow-sm border-border/80">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-base font-semibold">Audit Log Aktivitas ({filteredLogs.length})</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {filteredLogs.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Shield className="size-12 mx-auto mb-3 opacity-30" />
                  <p className="text-base font-semibold">Tidak Ada Audit Log</p>
                  <p className="text-xs mt-1">Aktivitas balasan bot dan pengiriman pesan akan dicatat di sini.</p>
                </div>
              ) : (
                <ScrollArea className="h-[480px]">
                  <AnimatedList className="flex flex-col gap-2.5 pr-3">
                    {filteredLogs.map((log) => (
                      <div key={log.id} className="rounded-xl border border-border/40 bg-muted/20 p-3.5 text-xs flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {TYPE_ICONS[log.type]}
                            <Badge variant="outline" className="text-[10px]">
                              {TYPE_LABELS[log.type]}
                            </Badge>
                            <span className="font-mono font-semibold text-foreground">{log.phone}</span>
                          </div>
                          <span className="font-mono text-muted-foreground text-[11px]">{formatDatetime(log.timestamp)}</span>
                        </div>

                        <p className="text-muted-foreground font-mono bg-background/80 p-2.5 rounded-lg border border-border/30 line-clamp-3 whitespace-pre-wrap">
                          {log.message}
                        </p>

                        {log.error && (
                          <p className="text-destructive font-mono text-[11px] bg-destructive/10 p-2 rounded-lg border border-destructive/20">
                            Error: {log.error}
                          </p>
                        )}
                      </div>
                    ))}
                  </AnimatedList>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Blocklist Panel */}
        <div>
          <Card className="rounded-2xl shadow-sm border-border/80">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Lock className="size-4 text-amber-500" />
                Daftar Nomor Diblokir
              </CardTitle>
              <CardDescription>Nomor yang diblokir tidak akan direspons oleh bot/AI</CardDescription>
            </CardHeader>
            <CardContent className="pt-4 flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Input
                  value={blockInput}
                  onChange={(e) => setBlockInput(e.target.value)}
                  placeholder="Nomor WhatsApp (628...)"
                  className="rounded-xl text-sm font-mono"
                />
                <Input
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="Alasan pemblokiran (Opsional)"
                  className="rounded-xl text-sm"
                />
                <Button onClick={handleAddBlock} className="rounded-xl gap-2 font-semibold shadow-xs">
                  <Plus className="size-4" /> Blokir Nomor
                </Button>
              </div>

              <div className="pt-2 border-t border-border/40 flex flex-col gap-2">
                {blockedNumbers.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-3 text-center">Belum ada nomor yang diblokir.</p>
                ) : (
                  blockedNumbers.map((b) => (
                    <div key={b.phone} className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/20 text-xs">
                      <div>
                        <p className="font-mono font-semibold text-foreground">{b.phone}</p>
                        {b.reason && <p className="text-[11px] text-muted-foreground mt-0.5">{b.reason}</p>}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          unblockNumber(b.phone)
                          toast.success(`Blokir nomor ${b.phone} dibuka`)
                        }}
                        className="h-8 w-8 rounded-lg text-emerald-500 hover:text-emerald-600"
                      >
                        <Unlock className="size-3.5" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
