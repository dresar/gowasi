import { useState } from 'react'
import {
  Bot,
  Plus,
  Trash2,
  Pencil,
  Zap,
  MessageSquare,
  Shield,
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
import { useBotStore, type AutoReplyRule } from '@/stores/bot'

type TriggerType = AutoReplyRule['trigger']['type']

const TRIGGER_LABELS: Record<TriggerType, string> = {
  exact: 'Sama persis',
  contains: 'Mengandung kata',
  starts_with: 'Diawali dengan',
  ends_with: 'Diakhiri dengan',
  regex: 'Regex',
}

const DEFAULT_FORM = {
  name: '',
  triggerType: 'contains' as TriggerType,
  triggerValue: '',
  caseSensitive: false,
  responseText: '',
  additionalTexts: [] as string[],
  delay: 1000,
  onlyPrivate: false,
  onlyGroups: false,
}

export default function AutoReplyPage() {
  const {
    autoReplyRules,
    autoReplyEnabled,
    toggleAutoReply,
    addRule,
    clearAllRules,
    updateRule,
    deleteRule,
    toggleRule,
  } = useBotStore()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [search, setSearch] = useState('')

  function openAdd() {
    setEditingId(null)
    setForm(DEFAULT_FORM)
    setDialogOpen(true)
  }

  function handleClearAll() {
    if (confirm('Apakah kamu yakin ingin menghapus semua aturan auto-reply?')) {
      clearAllRules()
      toast.success('Semua aturan auto-reply berhasil dibersihkan.')
    }
  }

  function openEdit(rule: AutoReplyRule) {
    setEditingId(rule.id)
    setForm({
      name: rule.name,
      triggerType: rule.trigger.type,
      triggerValue: rule.trigger.value,
      caseSensitive: rule.trigger.caseSensitive,
      responseText: rule.response.text ?? '',
      additionalTexts: rule.response.additionalTexts ?? [],
      delay: rule.response.delay,
      onlyPrivate: rule.conditions.onlyPrivate,
      onlyGroups: rule.conditions.onlyGroups,
    })
    setDialogOpen(true)
  }

  function handleSave() {
    if (!form.name || !form.triggerValue || !form.responseText) {
      toast.error('Nama, trigger, dan balasan wajib diisi')
      return
    }
    const payload = {
      name: form.name,
      enabled: true,
      priority: autoReplyRules.length,
      trigger: {
        type: form.triggerType,
        value: form.triggerValue,
        caseSensitive: form.caseSensitive,
      },
      conditions: {
        onlyPrivate: form.onlyPrivate,
        onlyGroups: form.onlyGroups,
        allowedNumbers: [],
        blockedNumbers: [],
      },
      response: {
        type: 'text' as const,
        text: form.responseText,
        additionalTexts: form.additionalTexts.filter(Boolean),
        delay: form.delay,
      },
    }
    if (editingId) {
      updateRule(editingId, payload)
      toast.success('Aturan berhasil diperbarui')
    } else {
      addRule(payload)
      toast.success('Aturan berhasil ditambahkan')
    }
    setDialogOpen(false)
  }

  const filteredRules = autoReplyRules.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.trigger.value.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Stats (Directly under top header) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        <GlowCard glowColor="rgba(16,185,129,0.25)">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <Shield className="size-6" />
            </div>
            <div>
              <p className="text-3xl font-extrabold font-mono tracking-tight">{autoReplyRules.length}</p>
              <p className="text-muted-foreground text-xs font-medium mt-0.5">Total Aturan</p>
            </div>
          </CardContent>
        </GlowCard>

        <GlowCard glowColor="rgba(59,130,246,0.25)">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <Zap className="size-6" />
            </div>
            <div>
              <p className="text-3xl font-extrabold font-mono tracking-tight text-blue-600 dark:text-blue-400">
                {autoReplyRules.reduce((acc, r) => acc + (r.stats.triggered || 0), 0)}
              </p>
              <p className="text-muted-foreground text-xs font-medium mt-0.5">Total Pesan Dibalas</p>
            </div>
          </CardContent>
        </GlowCard>

        <GlowCard glowColor="rgba(168,85,247,0.25)">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-12 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
              <MessageSquare className="size-6" />
            </div>
            <div>
              <p className="text-3xl font-extrabold font-mono tracking-tight text-purple-600 dark:text-purple-400">
                {autoReplyRules.filter((r) => r.enabled).length}
              </p>
              <p className="text-muted-foreground text-xs font-medium mt-0.5">Aturan Aktif</p>
            </div>
          </CardContent>
        </GlowCard>
      </div>

      {/* Control Bar: Search + Switch + Add Rule Button + 100 Dummy Generator */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-card p-4 rounded-2xl border border-border/80 shadow-xs">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari aturan berdasarkan nama / kata kunci..."
            className="pl-10 rounded-xl h-10 text-sm border-border/60"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="flex items-center gap-2.5 bg-muted/40 px-3 py-1.5 rounded-xl border border-border/40">
            <Badge variant={autoReplyEnabled ? 'default' : 'secondary'} className="px-2.5 py-0.5 text-xs font-semibold">
              {autoReplyEnabled ? '🟢 Bot Aktif' : '⚫ Bot Nonaktif'}
            </Badge>
            <Switch checked={autoReplyEnabled} onCheckedChange={toggleAutoReply} />
          </div>

          {autoReplyRules.length > 0 && (
            <Button
              onClick={handleClearAll}
              variant="outline"
              className="gap-1.5 rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              <Trash2 className="size-4" />
              Reset
            </Button>
          )}

          <Button onClick={openAdd} className="gap-2 rounded-xl font-semibold shadow-xs">
            <Plus className="size-4" />
            Tambah Aturan
          </Button>
        </div>
      </div>

      {/* Status Banner */}
      {autoReplyEnabled && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 shadow-xs">
          <Zap className="size-4 text-emerald-500 shrink-0" />
          <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            Bot auto-reply aktif — {autoReplyRules.filter((r) => r.enabled).length} dari {autoReplyRules.length} aturan aktif dan siap merespons pesan!
          </span>
        </div>
      )}

      {/* Rules List */}
      {filteredRules.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground rounded-2xl border-dashed">
          <Bot className="size-12 mx-auto mb-3 opacity-30" />
          <p className="text-base font-semibold">Belum Ada Aturan Auto Reply</p>
          <p className="text-xs mt-1">Klik "+ Tambah Aturan" untuk membuat kata kunci balasan otomatis pertama.</p>
        </Card>
      ) : (
        <AnimatedList className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredRules.map((rule) => (
            <GlowCard key={rule.id} glowColor="rgba(16,185,129,0.15)">
              <CardContent className="p-5 flex flex-col justify-between gap-4 h-full">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col">
                      <p className="font-bold text-base">{rule.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs font-medium bg-muted/30">
                          {TRIGGER_LABELS[rule.trigger.type]}
                        </Badge>
                        <code className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-md font-semibold">
                          "{rule.trigger.value}"
                        </code>
                      </div>
                    </div>
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={() => toggleRule(rule.id)}
                    />
                  </div>

                  <div className="rounded-xl border border-border/40 bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground font-mono">
                    <p className="font-semibold text-foreground mb-1">Respons:</p>
                    <p className="whitespace-pre-wrap">{rule.response.text}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs text-muted-foreground">
                  <span>Dibalas: <strong>{rule.stats.triggered}x</strong></span>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(rule)} className="h-8 gap-1 text-xs">
                      <Pencil className="size-3.5" /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteRule(rule.id)} className="h-8 gap-1 text-xs text-destructive hover:text-destructive">
                      <Trash2 className="size-3.5" /> Hapus
                    </Button>
                  </div>
                </div>
              </CardContent>
            </GlowCard>
          ))}
        </AnimatedList>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-xl lg:max-w-2xl rounded-2xl p-6 sm:p-8 border border-border/80 shadow-2xl">
          <DialogHeader className="pb-2 border-b border-border/40">
            <DialogTitle className="text-xl font-bold">{editingId ? 'Edit Aturan Auto Reply' : 'Tambah Aturan Auto Reply'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-3">
            <div className="grid gap-1.5">
              <Label>Nama Aturan</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Contoh: Salam Pembuka"
                className="rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Jenis Trigger</Label>
                <Select
                  value={form.triggerType}
                  onValueChange={(v) => setForm({ ...form, triggerType: v as TriggerType })}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label>Kata Kunci (Value)</Label>
                <Input
                  value={form.triggerValue}
                  onChange={(e) => setForm({ ...form, triggerValue: e.target.value })}
                  placeholder="Contoh: halo"
                  className="rounded-xl font-mono text-sm"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Pesan Balasan Utama</Label>
              <Textarea
                rows={3}
                value={form.responseText}
                onChange={(e) => setForm({ ...form, responseText: e.target.value })}
                placeholder="Halo! Selamat datang di toko kami. 😊"
                className="rounded-xl"
              />
            </div>

            {/* Additional Sequential Responses */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-primary">Balasan Lanjutan Berurutan (Unlimited Sequential Reply)</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setForm({ ...form, additionalTexts: [...form.additionalTexts, ''] })}
                  className="h-7 text-xs gap-1 rounded-lg border-primary/30 text-primary"
                >
                  <Plus className="size-3" />
                  + Balasan Lanjutan
                </Button>
              </div>
              {form.additionalTexts.map((text, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Textarea
                    rows={2}
                    value={text}
                    onChange={(e) => {
                      const updated = [...form.additionalTexts]
                      updated[idx] = e.target.value
                      setForm({ ...form, additionalTexts: updated })
                    }}
                    placeholder={`Pesan balasan ke-${idx + 2}...`}
                    className="rounded-xl text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const updated = form.additionalTexts.filter((_, i) => i !== idx)
                      setForm({ ...form, additionalTexts: updated })
                    }}
                    className="size-8 text-destructive shrink-0"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="grid gap-1.5">
              <Label>Delay Pengiriman (ms)</Label>
              <Input
                type="number"
                value={form.delay}
                onChange={(e) => setForm({ ...form, delay: Number(e.target.value) })}
                className="rounded-xl font-mono"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/20">
              <Label htmlFor="only-private" className="cursor-pointer text-xs font-medium">Hanya Balas Chat Private (PM)</Label>
              <Switch
                id="only-private"
                checked={form.onlyPrivate}
                onCheckedChange={(v) => setForm({ ...form, onlyPrivate: v, onlyGroups: v ? false : form.onlyGroups })}
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/20">
              <Label htmlFor="only-groups" className="cursor-pointer text-xs font-medium">Hanya Balas Pesan Grup</Label>
              <Switch
                id="only-groups"
                checked={form.onlyGroups}
                onCheckedChange={(v) => setForm({ ...form, onlyGroups: v, onlyPrivate: v ? false : form.onlyPrivate })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">Batal</Button>
            <Button onClick={handleSave} className="rounded-xl font-semibold">Simpan Aturan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
