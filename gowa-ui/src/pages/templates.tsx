import { useState } from 'react'
import {
  FileText,
  Plus,
  Trash2,
  Pencil,
  Send,
  Search,
  Tag,
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
import { Textarea } from '@/components/ui/textarea'
import { GlowCard } from '@/components/ui/glow-card'
import { AnimatedList } from '@/components/ui/animated-list'
import { useBotStore, type BotTemplate } from '@/stores/bot'

const CATEGORIES = ['Promosi', 'Customer Service', 'Pengingat', 'Sambutan', 'Informasi', 'Lainnya']

export default function TemplatesPage() {
  const { templates, addTemplate, updateTemplate, deleteTemplate } = useBotStore()
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    name: '',
    category: 'Lainnya',
    content: '',
    type: 'text' as BotTemplate['type'],
    mediaUrl: '',
  })

  const filtered = templates.filter((t) => {
    const matchSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.content.toLowerCase().includes(search.toLowerCase())
    const matchCategory = !selectedCategory || t.category === selectedCategory
    return matchSearch && matchCategory
  })

  function extractVars(content: string) {
    const matches = content.matchAll(/\{\{(\w+)\}\}/g)
    return [...new Set([...matches].map((m) => m[1]))]
  }

  function openAdd() {
    setEditingId(null)
    setForm({ name: '', category: 'Lainnya', content: '', type: 'text', mediaUrl: '' })
    setDialogOpen(true)
  }

  function openEdit(t: BotTemplate) {
    setEditingId(t.id)
    setForm({
      name: t.name,
      category: t.category,
      content: t.content,
      type: t.type,
      mediaUrl: t.mediaUrl ?? '',
    })
    setDialogOpen(true)
  }

  function handleSave() {
    if (!form.name || !form.content) {
      toast.error('Nama dan konten wajib diisi')
      return
    }
    const vars = extractVars(form.content)
    if (editingId) {
      updateTemplate(editingId, { ...form, variables: vars })
      toast.success('Template diperbarui')
    } else {
      addTemplate({ ...form, variables: vars })
      toast.success('Template ditambahkan')
    }
    setDialogOpen(false)
  }

  function openSend(t: BotTemplate) {
    navigator.clipboard.writeText(t.content)
    toast.success(`Isi template "${t.name}" disalin ke clipboard!`)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Stats (Directly below top fixed header) */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <GlowCard glowColor="rgba(59,130,246,0.25)">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <FileText className="size-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold font-mono tracking-tight">{templates.length}</p>
              <p className="text-muted-foreground text-xs font-medium">Total Template</p>
            </div>
          </CardContent>
        </GlowCard>

        {CATEGORIES.slice(0, 3).map((cat) => (
          <GlowCard key={cat} glowColor="rgba(168,85,247,0.15)">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="size-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
                <Tag className="size-5" />
              </div>
              <div>
                <p className="text-2xl font-extrabold font-mono tracking-tight">
                  {templates.filter((t) => t.category === cat).length}
                </p>
                <p className="text-muted-foreground text-xs font-medium">{cat}</p>
              </div>
            </CardContent>
          </GlowCard>
        ))}
      </div>

      {/* Control Bar: Search + Category Filter Chips + Add Template Button */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-card p-4 rounded-2xl border border-border/80 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            className="pl-10 rounded-xl h-10 text-sm border-border/60"
            placeholder="Cari nama atau isi template..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <Button
              variant={!selectedCategory ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(null)}
              className="rounded-xl h-9 text-xs font-medium"
            >
              Semua
            </Button>
            {CATEGORIES.map((cat) => (
              <Button
                key={cat}
                variant={selectedCategory === cat ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                className="rounded-xl h-9 text-xs font-medium"
              >
                {cat}
              </Button>
            ))}
          </div>

          <Button onClick={openAdd} className="gap-2 rounded-xl font-semibold shadow-xs h-9 ml-auto lg:ml-2">
            <Plus className="size-4" />
            Tambah Template
          </Button>
        </div>
      </div>

      {/* Template Cards */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground rounded-2xl border-dashed">
          <FileText className="size-12 mx-auto mb-3 opacity-30" />
          <p className="text-base font-semibold">Belum Ada Template Pesan</p>
          <p className="text-xs mt-1">Klik "+ Tambah Template" untuk membuat template pesan WhatsApp pertama.</p>
        </Card>
      ) : (
        <AnimatedList className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <GlowCard key={t.id} glowColor="rgba(59,130,246,0.15)">
              <CardContent className="p-5 flex flex-col justify-between gap-4 h-full">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-base line-clamp-1">{t.name}</h3>
                    <Badge variant="secondary" className="text-[11px] rounded-lg shrink-0">
                      {t.category}
                    </Badge>
                  </div>

                  <div className="rounded-xl border border-border/40 bg-muted/20 p-3 text-xs leading-relaxed font-mono whitespace-pre-wrap line-clamp-4 text-muted-foreground">
                    {t.content}
                  </div>

                  {t.variables.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {t.variables.map((v) => (
                        <code key={v} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-md font-mono">
                          {`{{${v}}}`}
                        </code>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/40 gap-2">
                  <Button variant="outline" size="sm" onClick={() => openSend(t)} className="rounded-xl h-8 text-xs font-semibold gap-1 flex-1">
                    <Send className="size-3" /> Gunakan
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(t)} className="h-8 w-8 rounded-lg">
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteTemplate(t.id)} className="h-8 w-8 rounded-lg text-destructive hover:text-destructive">
                    <Trash2 className="size-3.5" />
                  </Button>
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
            <DialogTitle className="text-xl font-bold">{editingId ? 'Edit Template' : 'Tambah Template Pesan'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Nama Template</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Contoh: Konfirmasi Pesanan"
                className="rounded-xl"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Kategori</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Isi Template (Gunakan {'{{nama_variabel}}'} untuk variabel)</Label>
              <Textarea
                rows={5}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="Halo {{nama}}, pesanan Anda {{order_id}} sedang diproses."
                className="rounded-xl text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">Batal</Button>
            <Button onClick={handleSave} className="rounded-xl font-semibold">Simpan Template</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
