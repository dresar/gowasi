import { useState, useEffect } from 'react'
import {
  Clock,
  Plus,
  Trash2,
  CalendarDays,
  Bell,
  RefreshCw,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { GlowCard } from '@/components/ui/glow-card'
import { AnimatedList } from '@/components/ui/animated-list'
import { useBroadcastStore, type ScheduleRepeat } from '@/stores/broadcast'
import { sendText } from '@/api/send'

const REPEAT_LABELS: Record<ScheduleRepeat, string> = {
  once: 'Sekali',
  daily: 'Setiap hari',
  weekly: 'Setiap minggu',
  monthly: 'Setiap bulan',
}

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

function formatCountdown(nextRun: string) {
  const diff = new Date(nextRun).getTime() - Date.now()
  if (diff <= 0) return 'Sekarang'
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  if (h > 0) return `${h}j ${m}m`
  if (m > 0) return `${m}m ${s}d`
  return `${s}d`
}

export default function SchedulerPage() {
  const { scheduledMessages, addSchedule, updateSchedule, deleteSchedule, toggleSchedule } =
    useBroadcastStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [tick, setTick] = useState(0)
  const [form, setForm] = useState({
    name: '',
    phone: '',
    message: '',
    repeat: 'once' as ScheduleRepeat,
    scheduledAt: '',
    repeatTime: '08:00',
    repeatDay: 1,
  })

  // Tick every second for countdown
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  // Check scheduled messages
  useEffect(() => {
    const now = Date.now()
    scheduledMessages.forEach((msg) => {
      if (!msg.enabled || !msg.nextRun) return
      if (new Date(msg.nextRun).getTime() <= now) {
        sendText({ phone: msg.phone, message: msg.message })
          .then(() => {
            toast.success(`Pesan terjadwal "${msg.name}" berhasil dikirim`)
            // Compute next run
            let nextRun: string | undefined
            if (msg.repeat === 'daily') {
              const next = new Date()
              const [h, m] = msg.repeatTime.split(':').map(Number)
              next.setHours(h, m, 0, 0)
              if (next.getTime() <= now) next.setDate(next.getDate() + 1)
              nextRun = next.toISOString()
            } else if (msg.repeat === 'weekly') {
              const next = new Date()
              const [h, m] = msg.repeatTime.split(':').map(Number)
              next.setHours(h, m, 0, 0)
              const daysUntil = ((msg.repeatDay ?? 1) - next.getDay() + 7) % 7 || 7
              next.setDate(next.getDate() + daysUntil)
              nextRun = next.toISOString()
            }
            updateSchedule(msg.id, {
              lastRun: new Date().toISOString(),
              nextRun,
              runCount: msg.runCount + 1,
              enabled: msg.repeat !== 'once',
            })
          })
          .catch(() => toast.error(`Gagal mengirim pesan terjadwal "${msg.name}"`))
      }
    })
  }, [tick]) // eslint-disable-line react-hooks/exhaustive-deps

  function computeNextRun() {
    if (form.repeat === 'once') return form.scheduledAt
    const now = new Date()
    const [h, m] = form.repeatTime.split(':').map(Number)
    now.setHours(h, m, 0, 0)
    if (form.repeat === 'daily' && now.getTime() <= Date.now()) {
      now.setDate(now.getDate() + 1)
    }
    return now.toISOString()
  }

  function handleCreate() {
    if (!form.name || !form.phone || !form.message) {
      toast.error('Nama, nomor, dan pesan wajib diisi')
      return
    }
    addSchedule({
      name: form.name,
      enabled: true,
      phone: form.phone,
      message: form.message,
      messageType: 'text',
      scheduledAt: form.scheduledAt || new Date().toISOString(),
      repeat: form.repeat,
      repeatTime: form.repeatTime,
      repeatDay: form.repeatDay,
      nextRun: computeNextRun(),
    })
    toast.success(`Jadwal "${form.name}" berhasil dibuat`)
    setDialogOpen(false)
    setForm({ name: '', phone: '', message: '', repeat: 'once', scheduledAt: '', repeatTime: '08:00', repeatDay: 1 })
  }

  const filteredSchedules = scheduledMessages.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.phone.includes(search) ||
      m.message.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Stats (Directly below top header) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        <GlowCard glowColor="rgba(6,182,212,0.25)">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-12 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center shrink-0">
              <CalendarDays className="size-6" />
            </div>
            <div>
              <p className="text-3xl font-extrabold font-mono tracking-tight">{scheduledMessages.length}</p>
              <p className="text-muted-foreground text-xs font-medium mt-0.5">Total Jadwal</p>
            </div>
          </CardContent>
        </GlowCard>

        <GlowCard glowColor="rgba(16,185,129,0.25)">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <Bell className="size-6" />
            </div>
            <div>
              <p className="text-3xl font-extrabold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
                {scheduledMessages.filter((m) => m.enabled).length}
              </p>
              <p className="text-muted-foreground text-xs font-medium mt-0.5">Jadwal Aktif</p>
            </div>
          </CardContent>
        </GlowCard>

        <GlowCard glowColor="rgba(168,85,247,0.25)">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-12 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
              <RefreshCw className="size-6" />
            </div>
            <div>
              <p className="text-3xl font-extrabold font-mono tracking-tight text-purple-600 dark:text-purple-400">
                {scheduledMessages.reduce((a, m) => a + m.runCount, 0)}
              </p>
              <p className="text-muted-foreground text-xs font-medium mt-0.5">Total Terkirim</p>
            </div>
          </CardContent>
        </GlowCard>
      </div>

      {/* Control Bar: Search + Create Schedule Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-card p-4 rounded-2xl border border-border/80 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari jadwal berdasarkan nama / nomor..."
            className="pl-10 rounded-xl h-10 text-sm border-border/60"
          />
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2 rounded-xl font-semibold shadow-xs shrink-0">
          <Plus className="size-4" />
          Jadwal Baru
        </Button>
      </div>

      {/* Schedules List */}
      {filteredSchedules.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground rounded-2xl border-dashed">
          <Clock className="size-12 mx-auto mb-3 opacity-30" />
          <p className="text-base font-semibold">Belum Ada Pesan Terjadwal</p>
          <p className="text-xs mt-1">Klik "+ Jadwal Baru" untuk menjadwalkan pengiriman pesan otomatis.</p>
        </Card>
      ) : (
        <AnimatedList className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSchedules.map((msg) => (
            <GlowCard key={msg.id} glowColor="rgba(6,182,212,0.15)">
              <CardContent className="p-5 flex flex-col justify-between gap-4 h-full">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-bold text-base">{msg.name}</h3>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">Ke: {msg.phone}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs font-medium">
                        {REPEAT_LABELS[msg.repeat]}
                      </Badge>
                      <Switch
                        checked={msg.enabled}
                        onCheckedChange={() => toggleSchedule(msg.id)}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/40 bg-muted/20 p-3 text-xs leading-relaxed font-mono whitespace-pre-wrap text-muted-foreground">
                    {msg.message}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs text-muted-foreground">
                  {msg.nextRun ? (
                    <span className="font-mono text-cyan-600 dark:text-cyan-400 font-semibold">
                      Pengiriman berikutnya: {formatCountdown(msg.nextRun)}
                    </span>
                  ) : (
                    <span>Terkirim: {msg.runCount}x</span>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => deleteSchedule(msg.id)} className="h-8 w-8 rounded-lg text-destructive hover:text-destructive">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </CardContent>
            </GlowCard>
          ))}
        </AnimatedList>
      )}

      {/* Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-xl lg:max-w-2xl rounded-2xl p-6 sm:p-8 border border-border/80 shadow-2xl">
          <DialogHeader className="pb-2 border-b border-border/40">
            <DialogTitle className="text-xl font-bold">Buat Pesan Terjadwal Baru</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Nama Jadwal</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Contoh: Pengingat Pembayaran"
                className="rounded-xl"
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Nomor Whatsapp Tujuan</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="628123456789"
                className="rounded-xl font-mono text-sm"
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Pesan</Label>
              <Textarea
                rows={4}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Halo, ini pesan otomatis..."
                className="rounded-xl text-sm"
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Pengulangan</Label>
              <Select
                value={form.repeat}
                onValueChange={(v) => setForm({ ...form, repeat: v as ScheduleRepeat })}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {Object.entries(REPEAT_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.repeat === 'once' ? (
              <div className="grid gap-1.5">
                <Label>Waktu Pengiriman</Label>
                <Input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                  className="rounded-xl font-mono text-sm"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label>Jam Pengiriman</Label>
                  <Input
                    type="time"
                    value={form.repeatTime}
                    onChange={(e) => setForm({ ...form, repeatTime: e.target.value })}
                    className="rounded-xl font-mono text-sm"
                  />
                </div>
                {form.repeat === 'weekly' && (
                  <div className="grid gap-1.5">
                    <Label>Hari</Label>
                    <Select
                      value={String(form.repeatDay)}
                      onValueChange={(v) => setForm({ ...form, repeatDay: Number(v) })}
                    >
                      <SelectTrigger className="rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {DAYS.map((d, i) => (
                          <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">Batal</Button>
            <Button onClick={handleCreate} className="rounded-xl font-semibold">Simpan Jadwal</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
