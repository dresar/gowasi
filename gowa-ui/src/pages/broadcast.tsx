import { useState, useRef } from 'react'
import {
  Megaphone,
  Upload,
  Play,
  Pause,
  Trash2,
  Plus,
  Users,
  CheckCircle2,
  XCircle,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import { GlowCard } from '@/components/ui/glow-card'
import { AnimatedList } from '@/components/ui/animated-list'
import { useBroadcastStore, type BroadcastJob } from '@/stores/broadcast'
import { sendText } from '@/api/send'
import { useDeviceStore } from '@/stores/device'

const STATUS_CONFIG: Record<BroadcastJob['status'], { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'secondary' },
  running: { label: 'Berjalan', color: 'default' },
  paused: { label: 'Dijeda', color: 'outline' },
  completed: { label: 'Selesai', color: 'default' },
  failed: { label: 'Gagal', color: 'destructive' },
}

export default function BroadcastPage() {
  const { jobs, addJob, updateJob, deleteJob, updateRecipient } = useBroadcastStore()
  const deviceId = useDeviceStore((s) => s.selectedDeviceId)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    name: '',
    message: '',
    numbersRaw: '',
    delayMin: 3000,
    delayMax: 7000,
  })
  const fileRef = useRef<HTMLInputElement>(null)
  const runningRef = useRef<Set<string>>(new Set())

  function parseNumbers(raw: string) {
    return raw
      .split(/[\n,;]+/)
      .map((s) => s.trim().replace(/[^0-9+]/g, ''))
      .filter((s) => s.length >= 8)
  }

  function handleCSV(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      setForm((f) => ({ ...f, numbersRaw: f.numbersRaw + '\n' + text }))
      toast.success(`File ${file.name} dimuat`)
    }
    reader.readAsText(file)
  }

  function handleCreate() {
    if (!form.name || !form.message) {
      toast.error('Nama dan pesan wajib diisi')
      return
    }
    const phones = parseNumbers(form.numbersRaw)
    if (phones.length === 0) {
      toast.error('Tambahkan minimal 1 nomor tujuan')
      return
    }
    addJob({
      name: form.name,
      status: 'draft',
      message: form.message,
      messageType: 'text',
      recipients: phones.map((phone) => ({ phone, status: 'pending' })),
      delayMin: form.delayMin,
      delayMax: form.delayMax,
    })
    toast.success(`Broadcast "${form.name}" dibuat dengan ${phones.length} penerima`)
    setForm({ name: '', message: '', numbersRaw: '', delayMin: 3000, delayMax: 7000 })
    setDialogOpen(false)
  }

  async function startBroadcast(job: BroadcastJob) {
    if (!deviceId) {
      toast.error('Pilih device terlebih dahulu')
      return
    }
    if (runningRef.current.has(job.id)) return

    runningRef.current.add(job.id)
    updateJob(job.id, { status: 'running', startedAt: new Date().toISOString() })

    const pending = job.recipients.filter((r) => r.status === 'pending')
    let sentCount = job.recipients.filter((r) => r.status === 'sent').length

    for (const recipient of pending) {
      if (!runningRef.current.has(job.id)) break

      try {
        await sendText({ phone: recipient.phone, message: job.message })
        sentCount++
        updateRecipient(job.id, recipient.phone, {
          status: 'sent',
          sentAt: new Date().toISOString(),
        })
      } catch (e) {
        updateRecipient(job.id, recipient.phone, {
          status: 'failed',
          error: String(e),
        })
      }

      const total = job.recipients.length
      updateJob(job.id, { progress: Math.round((sentCount / total) * 100) })

      // Random delay (anti-ban)
      const delay = job.delayMin + Math.random() * (job.delayMax - job.delayMin)
      await new Promise((r) => setTimeout(r, delay))
    }

    runningRef.current.delete(job.id)
    const allDone = job.recipients.every((r) => r.status !== 'pending')
    updateJob(job.id, {
      status: allDone ? 'completed' : 'paused',
      completedAt: allDone ? new Date().toISOString() : undefined,
      progress: 100,
    })
    toast.success(`Broadcast "${job.name}" ${allDone ? 'selesai' : 'dijeda'}`)
  }

  function pauseBroadcast(id: string) {
    runningRef.current.delete(id)
    updateJob(id, { status: 'paused' })
  }

  const filteredJobs = jobs.filter((j) =>
    j.name.toLowerCase().includes(search.toLowerCase()) ||
    j.message.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Stats (Directly below top header) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        <GlowCard glowColor="rgba(249,115,22,0.25)">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-12 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
              <Megaphone className="size-6" />
            </div>
            <div>
              <p className="text-3xl font-extrabold font-mono tracking-tight">{jobs.length}</p>
              <p className="text-muted-foreground text-xs font-medium mt-0.5">Total Broadcast</p>
            </div>
          </CardContent>
        </GlowCard>

        <GlowCard glowColor="rgba(16,185,129,0.25)">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <CheckCircle2 className="size-6" />
            </div>
            <div>
              <p className="text-3xl font-extrabold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
                {jobs.reduce((a, j) => a + j.recipients.filter((r) => r.status === 'sent').length, 0)}
              </p>
              <p className="text-muted-foreground text-xs font-medium mt-0.5">Total Terkirim</p>
            </div>
          </CardContent>
        </GlowCard>

        <GlowCard glowColor="rgba(59,130,246,0.25)">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <Users className="size-6" />
            </div>
            <div>
              <p className="text-3xl font-extrabold font-mono tracking-tight text-blue-600 dark:text-blue-400">
                {jobs.reduce((a, j) => a + j.recipients.length, 0)}
              </p>
              <p className="text-muted-foreground text-xs font-medium mt-0.5">Total Penerima</p>
            </div>
          </CardContent>
        </GlowCard>
      </div>

      {/* Control Bar: Search + Create Broadcast Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-card p-4 rounded-2xl border border-border/80 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari broadcast..."
            className="pl-10 rounded-xl h-10 text-sm border-border/60"
          />
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2 rounded-xl font-semibold shadow-xs shrink-0">
          <Plus className="size-4" />
          Broadcast Baru
        </Button>
      </div>

      {/* Jobs List */}
      {filteredJobs.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground rounded-2xl border-dashed">
          <Megaphone className="size-12 mx-auto mb-3 opacity-30" />
          <p className="text-base font-semibold">Belum Ada Broadcast Kampanye</p>
          <p className="text-xs mt-1">Klik "+ Broadcast Baru" untuk membuat pengiriman pesan massal pertama.</p>
        </Card>
      ) : (
        <AnimatedList className="flex flex-col gap-4">
          {filteredJobs.map((job) => {
            const sent = job.recipients.filter((r) => r.status === 'sent').length
            const failed = job.recipients.filter((r) => r.status === 'failed').length
            const total = job.recipients.length
            const pct = total > 0 ? Math.round((sent / total) * 100) : 0
            const isRunning = job.status === 'running'

            return (
              <GlowCard key={job.id} glowColor="rgba(249,115,22,0.15)">
                <CardHeader className="pb-3 border-b border-border/40">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
                        <Megaphone className="size-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-bold">{job.name}</CardTitle>
                        <CardDescription className="text-xs mt-0.5">
                          {total} penerima &bull; Delay: {job.delayMin / 1000}s - {job.delayMax / 1000}s
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_CONFIG[job.status].color as any} className="rounded-lg px-2.5 py-0.5 text-xs">
                        {STATUS_CONFIG[job.status].label}
                      </Badge>
                      {isRunning ? (
                        <Button variant="outline" size="sm" onClick={() => pauseBroadcast(job.id)} className="rounded-xl h-8 gap-1.5 text-xs">
                          <Pause className="size-3.5 text-amber-500" /> Jeda
                        </Button>
                      ) : job.status !== 'completed' ? (
                        <Button size="sm" onClick={() => startBroadcast(job)} className="rounded-xl h-8 gap-1.5 text-xs font-semibold">
                          <Play className="size-3.5 fill-current" /> Jalankan
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="icon" onClick={() => deleteJob(job.id)} className="h-8 w-8 rounded-lg text-destructive hover:text-destructive">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-4 flex flex-col gap-4">
                  <div className="rounded-xl border border-border/40 bg-muted/20 p-3 text-xs leading-relaxed font-mono whitespace-pre-wrap text-muted-foreground">
                    {job.message}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs font-medium">
                      <span>Progres Pengiriman ({sent}/{total})</span>
                      <span className="font-mono text-primary font-bold">{pct}%</span>
                    </div>
                    <Progress value={pct} className="h-2 rounded-full" />
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="size-3.5" /> {sent} Berhasil
                    </span>
                    {failed > 0 && (
                      <span className="flex items-center gap-1 text-destructive font-medium">
                        <XCircle className="size-3.5" /> {failed} Gagal
                      </span>
                    )}
                  </div>
                </CardContent>
              </GlowCard>
            )
          })}
        </AnimatedList>
      )}

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-xl lg:max-w-2xl rounded-2xl p-6 sm:p-8 border border-border/80 shadow-2xl">
          <DialogHeader className="pb-2 border-b border-border/40">
            <DialogTitle className="text-xl font-bold">Buat Kampanye Broadcast Baru</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Nama Kampanye</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Contoh: Promo Flash Sale Agustus"
                className="rounded-xl"
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Pesan Broadcast</Label>
              <Textarea
                rows={4}
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Halo! Dapatkan diskon 50% khusus hari ini..."
                className="rounded-xl text-sm"
              />
            </div>

            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label>Nomor Tujuan (Pisahkan dengan baris baru / koma)</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  className="h-7 text-xs gap-1 text-primary"
                >
                  <Upload className="size-3" /> Import CSV/TXT
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleCSV(f)
                  }}
                />
              </div>
              <Textarea
                rows={4}
                value={form.numbersRaw}
                onChange={(e) => setForm({ ...form, numbersRaw: e.target.value })}
                placeholder="628123456789&#10;628987654321"
                className="rounded-xl font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Terdeteksi: <strong>{parseNumbers(form.numbersRaw).length}</strong> nomor valid.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Min Delay (detik)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.delayMin / 1000}
                  onChange={(e) => setForm({ ...form, delayMin: Number(e.target.value) * 1000 })}
                  className="rounded-xl font-mono"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Max Delay (detik)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.delayMax / 1000}
                  onChange={(e) => setForm({ ...form, delayMax: Number(e.target.value) * 1000 })}
                  className="rounded-xl font-mono"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">Batal</Button>
            <Button onClick={handleCreate} className="rounded-xl font-semibold">Buat Broadcast</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
