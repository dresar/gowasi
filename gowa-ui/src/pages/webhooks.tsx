import { useEffect } from 'react'
import { Link2, Trash2, Clock, Activity, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { GlowCard } from '@/components/ui/glow-card'
import { AnimatedList } from '@/components/ui/animated-list'
import { useBroadcastStore } from '@/stores/broadcast'
import { onWsEvent } from '@/lib/events'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const STATUS_ICON = {
  received: <Clock className="size-3.5 text-blue-500" />,
  processed: <CheckCircle2 className="size-3.5 text-emerald-500" />,
  failed: <XCircle className="size-3.5 text-red-500" />,
}

const EVENT_COLORS: Record<string, string> = {
  MESSAGE_RECEIVED: 'text-blue-600 dark:text-blue-400',
  LOGIN_SUCCESS: 'text-emerald-600 dark:text-emerald-400',
  DEVICE_LOGGED_OUT: 'text-red-600 dark:text-red-400',
  LIST_DEVICES: 'text-purple-600 dark:text-purple-400',
  DEVICE_REMOVED: 'text-orange-600 dark:text-orange-400',
}

export default function WebhooksPage() {
  const { webhookLogs, addWebhookLog, clearWebhookLogs } = useBroadcastStore()

  // Intercept WS events as webhook log entries
  useEffect(() => {
    const unsub = onWsEvent((event: { code: string; result?: unknown }) => {
      addWebhookLog({
        eventType: event.code,
        payload: event,
        status: 'received',
      })
    })
    return unsub
  }, [addWebhookLog])

  const received = webhookLogs.filter((l) => l.status === 'received').length
  const processed = webhookLogs.filter((l) => l.status === 'processed').length
  const failed = webhookLogs.filter((l) => l.status === 'failed').length

  const eventCounts: Record<string, number> = {}
  webhookLogs.forEach((l) => {
    eventCounts[l.eventType] = (eventCounts[l.eventType] ?? 0) + 1
  })

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Stats (Directly below top header) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <GlowCard glowColor="rgba(245,158,11,0.25)">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <Activity className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold font-mono tracking-tight">{webhookLogs.length}</p>
              <p className="text-muted-foreground text-xs font-medium">Total Events</p>
            </div>
          </CardContent>
        </GlowCard>

        <GlowCard glowColor="rgba(59,130,246,0.25)">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <Clock className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold font-mono tracking-tight text-blue-600 dark:text-blue-400">{received}</p>
              <p className="text-muted-foreground text-xs font-medium">Diterima</p>
            </div>
          </CardContent>
        </GlowCard>

        <GlowCard glowColor="rgba(16,185,129,0.25)">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">{processed}</p>
              <p className="text-muted-foreground text-xs font-medium">Diproses</p>
            </div>
          </CardContent>
        </GlowCard>

        <GlowCard glowColor="rgba(239,68,68,0.25)">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
              <XCircle className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold font-mono tracking-tight text-red-600 dark:text-red-400">{failed}</p>
              <p className="text-muted-foreground text-xs font-medium">Gagal</p>
            </div>
          </CardContent>
        </GlowCard>
      </div>

      {/* Control Bar: Event Summary + Clear Log Button */}
      <div className="flex items-center justify-between gap-4 bg-card p-4 rounded-2xl border border-border/80 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Link2 className="size-4 text-teal-500" />
            Live Webhook & WebSocket Event Stream
          </h2>
          <p className="text-xs text-muted-foreground">
            Menampilkan event realtime yang diterima dari server WhatsApp REST/WebSocket.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            clearWebhookLogs()
            toast.success('Log webhook dibersihkan')
          }}
          className="rounded-xl h-10 gap-2 font-medium shrink-0"
        >
          <Trash2 className="size-4 text-destructive" /> Clear Log
        </Button>
      </div>

      {/* Event Stream Content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Stream List */}
        <div className="lg:col-span-2">
          <Card className="rounded-2xl shadow-sm border-border/80">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-base font-semibold">Log Realtime</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {webhookLogs.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Activity className="size-12 mx-auto mb-3 opacity-30 animate-pulse" />
                  <p className="text-base font-semibold">Mendengarkan Event Webhook...</p>
                  <p className="text-xs mt-1">Event WhatsApp yang masuk akan tampil secara otomatis di sini.</p>
                </div>
              ) : (
                <ScrollArea className="h-[480px]">
                  <AnimatedList className="flex flex-col gap-2.5 pr-3">
                    {webhookLogs.map((log) => (
                      <div key={log.id} className="rounded-xl border border-border/40 bg-muted/20 p-3.5 text-xs flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {STATUS_ICON[log.status]}
                            <span className={`font-mono font-bold ${EVENT_COLORS[log.eventType] ?? 'text-foreground'}`}>
                              {log.eventType}
                            </span>
                          </div>
                          <span className="font-mono text-muted-foreground text-[11px]">{formatTime(log.timestamp)}</span>
                        </div>

                        <pre className="rounded-lg bg-background/80 p-2.5 font-mono text-[11px] text-muted-foreground overflow-x-auto border border-border/30 max-h-32">
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </AnimatedList>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Event Breakdown */}
        <div>
          <Card className="rounded-2xl shadow-sm border-border/80">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-base font-semibold">Ringkasan Jenis Event</CardTitle>
            </CardHeader>
            <CardContent className="pt-4 flex flex-col gap-3">
              {Object.keys(eventCounts).length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-4 text-center">Belum ada data event</p>
              ) : (
                Object.entries(eventCounts).map(([evt, count]) => (
                  <div key={evt} className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/20 text-xs">
                    <span className="font-mono font-semibold text-foreground">{evt}</span>
                    <Badge variant="secondary" className="font-mono font-bold text-xs">{count}x</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
