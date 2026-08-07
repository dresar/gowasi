import { useState, useRef } from 'react'
import {
  Users,
  Plus,
  Trash2,
  Pencil,
  Upload,
  Search,
  Tag,
  UserCheck,
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
import { Textarea } from '@/components/ui/textarea'
import { GlowCard } from '@/components/ui/glow-card'
import { AnimatedList } from '@/components/ui/animated-list'
import { useBotStore, type BotContact } from '@/stores/bot'

export default function ContactsPage() {
  const { contacts, addContact, updateContact, deleteContact, importContacts } = useBotStore()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', phone: '', labels: '', notes: '' })
  const fileRef = useRef<HTMLInputElement>(null)

  const filtered = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      c.labels.some((l) => l.toLowerCase().includes(search.toLowerCase())),
  )

  const allLabels = [...new Set(contacts.flatMap((c) => c.labels))]

  function openAdd() {
    setEditingId(null)
    setForm({ name: '', phone: '', labels: '', notes: '' })
    setDialogOpen(true)
  }

  function openEdit(c: BotContact) {
    setEditingId(c.id)
    setForm({ name: c.name, phone: c.phone, labels: c.labels.join(', '), notes: c.notes })
    setDialogOpen(true)
  }

  function handleSave() {
    if (!form.name || !form.phone) {
      toast.error('Nama dan nomor wajib diisi')
      return
    }
    const labels = form.labels
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (editingId) {
      updateContact(editingId, { name: form.name, phone: form.phone, labels, notes: form.notes })
      toast.success('Kontak diperbarui')
    } else {
      addContact({ name: form.name, phone: form.phone, labels, notes: form.notes })
      toast.success('Kontak ditambahkan')
    }
    setDialogOpen(false)
  }

  function handleCSV(file: File) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const lines = text.trim().split('\n').slice(1) // skip header
      const parsed = lines
        .map((line) => {
          const [name = '', phone = '', labels = '', notes = ''] = line.split(',').map((s) => s.trim().replace(/^"|"$/g, ''))
          return { name, phone, labels: labels.split(';').filter(Boolean), notes }
        })
        .filter((c) => c.name && c.phone)
      importContacts(parsed)
      toast.success(`${parsed.length} kontak berhasil diimpor`)
    }
    reader.readAsText(file)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Stats (Directly below top header) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        <GlowCard glowColor="rgba(20,184,166,0.25)">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-12 rounded-xl bg-teal-500/10 text-teal-500 flex items-center justify-center shrink-0">
              <Users className="size-6" />
            </div>
            <div>
              <p className="text-3xl font-extrabold font-mono tracking-tight">{contacts.length}</p>
              <p className="text-muted-foreground text-xs font-medium mt-0.5">Total Kontak</p>
            </div>
          </CardContent>
        </GlowCard>

        <GlowCard glowColor="rgba(168,85,247,0.25)">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-12 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
              <Tag className="size-6" />
            </div>
            <div>
              <p className="text-3xl font-extrabold font-mono tracking-tight text-purple-600 dark:text-purple-400">
                {allLabels.length}
              </p>
              <p className="text-muted-foreground text-xs font-medium mt-0.5">Label Kustom</p>
            </div>
          </CardContent>
        </GlowCard>

        <GlowCard glowColor="rgba(59,130,246,0.25)">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <UserCheck className="size-6" />
            </div>
            <div>
              <p className="text-3xl font-extrabold font-mono tracking-tight text-blue-600 dark:text-blue-400">
                {filtered.length}
              </p>
              <p className="text-muted-foreground text-xs font-medium mt-0.5">Tersaring</p>
            </div>
          </CardContent>
        </GlowCard>
      </div>

      {/* Control Bar: Search + Import CSV + Add Contact Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-card p-4 rounded-2xl border border-border/80 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kontak berdasarkan nama, nomor, atau label..."
            className="pl-10 rounded-xl h-10 text-sm border-border/60"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleCSV(e.target.files[0])}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()} className="rounded-xl h-10 gap-2 font-medium">
            <Upload className="size-4" /> Import CSV
          </Button>
          <Button onClick={openAdd} className="rounded-xl h-10 gap-2 font-semibold shadow-xs">
            <Plus className="size-4" /> Tambah Kontak
          </Button>
        </div>
      </div>

      {/* Contacts List */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground rounded-2xl border-dashed">
          <Users className="size-12 mx-auto mb-3 opacity-30" />
          <p className="text-base font-semibold">Belum Ada Kontak</p>
          <p className="text-xs mt-1">Klik "+ Tambah Kontak" atau "Import CSV" untuk menyimpan kontak pertama.</p>
        </Card>
      ) : (
        <AnimatedList className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <GlowCard key={c.id} glowColor="rgba(20,184,166,0.15)">
              <CardContent className="p-5 flex flex-col justify-between gap-4 h-full">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-base line-clamp-1">{c.name}</h3>
                      <p className="text-xs font-mono text-muted-foreground mt-0.5">{c.phone}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)} className="h-8 w-8 rounded-lg">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteContact(c.id)} className="h-8 w-8 rounded-lg text-destructive hover:text-destructive">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  {c.notes && (
                    <p className="text-xs text-muted-foreground line-clamp-2 bg-muted/20 p-2.5 rounded-xl border border-border/40">
                      {c.notes}
                    </p>
                  )}

                  {c.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {c.labels.map((l) => (
                        <Badge key={l} variant="secondary" className="text-[10px] rounded-lg">
                          {l}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </GlowCard>
          ))}
        </AnimatedList>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-xl lg:max-w-2xl rounded-2xl p-6 sm:p-8 border border-border/80 shadow-2xl">
          <DialogHeader className="pb-2 border-b border-border/40">
            <DialogTitle className="text-xl font-bold">{editingId ? 'Edit Kontak' : 'Tambah Kontak Baru'}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Nama Lengkap</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Contoh: Budi Santoso"
                className="rounded-xl"
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Nomor WhatsApp</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="628123456789"
                className="rounded-xl font-mono text-sm"
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Label (Pisahkan dengan koma)</Label>
              <Input
                value={form.labels}
                onChange={(e) => setForm({ ...form, labels: e.target.value })}
                placeholder="Pelanggan, VIP, Lead"
                className="rounded-xl text-sm"
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Catatan (Opsional)</Label>
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Catatan tambahan tentang kontak ini..."
                className="rounded-xl text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="rounded-xl">Batal</Button>
            <Button onClick={handleSave} className="rounded-xl font-semibold">Simpan Kontak</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
