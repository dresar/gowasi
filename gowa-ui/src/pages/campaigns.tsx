import { useState } from 'react'
import {
  Target,
  Plus,
  Trash2,
  Play,
  Pause,
  ArrowRight,
  Users,
  CheckCircle2,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { GlowCard } from '@/components/ui/glow-card'
import { AnimatedList } from '@/components/ui/animated-list'
import { useBroadcastStore, type Campaign } from '@/stores/broadcast'

const STATUS_COLORS: Record<Campaign['status'], string> = {
  draft: 'secondary',
  active: 'default',
  paused: 'outline',
  completed: 'default',
}

export default function CampaignsPage() {
  const { campaigns, addCampaign, updateCampaign, deleteCampaign } = useBroadcastStore()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    name: '',
    description: '',
    triggerType: 'keyword' as Campaign['trigger']['type'],
    keyword: '',
    stepMessage: '',
    stepDelay: 24,
  })

  function handleCreate() {
    if (!form.name) {
      toast.error('Nama campaign wajib diisi')
      return
    }
    addCampaign({
      name: form.name,
      description: form.description,
      status: 'draft',
      trigger: { type: form.triggerType, keyword: form.keyword || undefined },
      steps: form.stepMessage
        ? [
            {
              id: Math.random().toString(36).slice(2),
              order: 1,
              delayHours: form.stepDelay,
              message: form.stepMessage,
              messageType: 'text',
            },
          ]
        : [],
    })
    toast.success(`Campaign "${form.name}" dibuat`)
    setDialogOpen(false)
    setForm({ name: '', description: '', triggerType: 'keyword', keyword: '', stepMessage: '', stepDelay: 24 })
  }

  const filteredCampaigns = campaigns.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.description?.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Stats (Directly below top header) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        <GlowCard glowColor="rgba(244,63,94,0.25)">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-12 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
              <Target className="size-6" />
            </div>
            <div>
              <p className="text-3xl font-extrabold font-mono tracking-tight">{campaigns.length}</p>
              <p className="text-muted-foreground text-xs font-medium mt-0.5">Total Campaign</p>
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
                {campaigns.reduce((a, c) => a + c.stats.enrolled, 0)}
              </p>
              <p className="text-muted-foreground text-xs font-medium mt-0.5">Total Enrolled</p>
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
                {campaigns.reduce((a, c) => a + c.stats.completed, 0)}
              </p>
              <p className="text-muted-foreground text-xs font-medium mt-0.5">Campaign Selesai</p>
            </div>
          </CardContent>
        </GlowCard>
      </div>

      {/* Control Bar: Search + Create Campaign Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-card p-4 rounded-2xl border border-border/80 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari campaign..."
            className="pl-10 rounded-xl h-10 text-sm border-border/60"
          />
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2 rounded-xl font-semibold shadow-xs shrink-0">
          <Plus className="size-4" />
          Campaign Baru
        </Button>
      </div>

      {/* Campaigns List */}
      {filteredCampaigns.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground rounded-2xl border-dashed">
          <Target className="size-12 mx-auto mb-3 opacity-30" />
          <p className="text-base font-semibold">Belum Ada Drip Campaign</p>
          <p className="text-xs mt-1">Klik "+ Campaign Baru" untuk membuat alur pesan drip otomatis.</p>
        </Card>
      ) : (
        <AnimatedList className="flex flex-col gap-4">
          {filteredCampaigns.map((c) => (
            <GlowCard key={c.id} glowColor="rgba(244,63,94,0.15)">
              <CardHeader className="pb-3 border-b border-border/40">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      {c.name}
                      <Badge variant={STATUS_COLORS[c.status] as any} className="rounded-lg text-xs">
                        {c.status}
                      </Badge>
                    </CardTitle>
                    {c.description && <CardDescription className="text-xs mt-1">{c.description}</CardDescription>}
                  </div>
                  <div className="flex items-center gap-2">
                    {c.status === 'active' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => updateCampaign(c.id, { status: 'paused' })}
                        className="rounded-xl h-8 gap-1 text-xs"
                      >
                        <Pause className="size-3.5 text-amber-500" /> Jeda
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => updateCampaign(c.id, { status: 'active' })}
                        className="rounded-xl h-8 gap-1 text-xs font-semibold"
                      >
                        <Play className="size-3.5 fill-current" /> Aktifkan
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => deleteCampaign(c.id)} className="h-8 w-8 rounded-lg text-destructive hover:text-destructive">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-4 flex flex-col gap-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Alur Pesan ({c.steps.length} Langkah):
                </p>
                {c.steps.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Belum ada langkah pesan dalam campaign ini.</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    {c.steps.map((step, idx) => (
                      <div key={step.id} className="flex items-center gap-2">
                        <div className="rounded-xl border border-border/40 bg-muted/20 p-3 text-xs max-w-xs">
                          <p className="font-semibold text-foreground mb-1">Step {step.order} ({step.delayHours} jam)</p>
                          <p className="text-muted-foreground line-clamp-2">{step.message}</p>
                        </div>
                        {idx < c.steps.length - 1 && <ArrowRight className="size-4 text-muted-foreground shrink-0" />}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </GlowCard>
          ))}
        </AnimatedList>
      )}

      {/* Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-xl lg:max-w-2xl rounded-2xl p-6 sm:p-8 border border-border/80 shadow-2xl">
          <DialogHeader className="pb-2 border-b border-border/40">
            <DialogTitle className="text-xl font-bold">Buat Campaign Drip Baru</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Nama Campaign</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Contoh: Onboarding Pelanggan Baru"
                className="rounded-xl"
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Deskripsi</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Deskripsi singkat campaign..."
                className="rounded-xl"
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Trigger Pemicu</Label>
              <Select
                value={form.triggerType}
                onValueChange={(v) => setForm({ ...form, triggerType: v as Campaign['trigger']['type'] })}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="keyword">Keyword Terdeteksi</SelectItem>
                  <SelectItem value="manual">Diikutsertakan Manual</SelectItem>
                  <SelectItem value="webhook">Webhook Event</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.triggerType === 'keyword' && (
              <div className="grid gap-1.5">
                <Label>Keyword Pemicu</Label>
                <Input
                  value={form.keyword}
                  onChange={(e) => setForm({ ...form, keyword: e.target.value })}
                  placeholder="Contoh: #JOIN"
                  className="rounded-xl font-mono text-sm"
                />
              </div>
            )}

            <div className="grid gap-1.5 pt-2 border-t border-border/40">
              <Label className="font-bold text-sm">Pesan Langkah Pertama (Step 1)</Label>
              <Textarea
                rows={3}
                value={form.stepMessage}
                onChange={(e) => setForm({ ...form, stepMessage: e.target.value })}
                placeholder="Pesan pertama yang dikirim..."
                className="rounded-xl text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">Batal</Button>
            <Button onClick={handleCreate} className="rounded-xl font-semibold">Simpan Campaign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
