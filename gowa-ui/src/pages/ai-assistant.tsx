import { useState, useEffect } from 'react'
import {
  Sparkles,
  Key,
  Save,
  TestTube,
  CheckCircle2,
  XCircle,
  Loader2,
  Sliders,
  BookOpen,
  Wand2,
  BrainCircuit,
  Eye,
  EyeOff,
  Clock,
  Calculator,
  ShoppingBag,
  UserX,
  Plus,
  Trash2,
  Settings2,
  Bot,
  Zap,
  Heart,
  ShieldCheck,
  Send,
} from 'lucide-react'
import { toast } from 'sonner'
import { saveAIConfig } from '@/api/bot'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { GlowCard } from '@/components/ui/glow-card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useBotStore, type AIProvider } from '@/stores/bot'

const SUGGESTED_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'deepseek-r1-distill-llama-70b',
  'mixtral-8x7b-32768',
  'gemma2-9b-it',
]

const PROMPT_PRESETS = [
  {
    name: '🛍️ CS Toko Online',
    prompt:
      'Kamu adalah CS toko online resmi yang ramah dan solutif. Tugasmu memberikan info produk, menjawab ketersediaan stok, menjelaskan cara pembayaran, serta memandu pembeli dengan santun.',
  },
  {
    name: '💼 Sales & Lead Gen',
    prompt:
      'Kamu adalah konsultan sales profesional. Tugasmu menyapa calon pembeli, menggali kebutuhan mereka, menjelaskan keunggulan layanan, serta mengajak jadwal konsultasi/demo.',
  },
  {
    name: '🛠️ Tech Support & FAQ',
    prompt:
      'Kamu adalah pakar dukungan teknis resmi. Jawab pertanyaan masalah teknis secara lugas, berikan langkah troubleshooting berurutan (1, 2, 3), dan gunakan bahasa yang mudah dipahami.',
  },
  {
    name: '🤖 Asisten AI Serba Bisa',
    prompt:
      'Kamu adalah asisten pribadi AI cerdas di WhatsApp. Jawab pesan pengguna secara singkat, jelas, informatif, dan membantu dalam Bahasa Indonesia.',
  },
  {
    name: '🌐 Penerjemah Multibahasa',
    prompt:
      'Kamu adalah penerjemah profesional. Jawab pesan dalam bahasa yang sama dengan pesan pengirim. Jika pengirim bertanya dalam Bahasa Inggris, jawab dalam Bahasa Inggris secara natural.',
  },
]

const PROVIDERS: { value: AIProvider; label: string; description: string }[] = [
  {
    value: 'groq',
    label: 'Groq Cloud AI (Official Llama 3.3 / DeepSeek R1)',
    description: 'Resmi dari Groq Cloud (Kecepatan Llama 3.3 70B & DeepSeek R1 super cepat dengan Groq LPU)',
  },
  {
    value: 'custom',
    label: 'Custom OpenAI-Compatible Proxy',
    description: 'Endpoint REST kustom seperti OpenRouter, DeepSeek API, atau OpenAI Proxy',
  },
  {
    value: 'ollama',
    label: 'Ollama (Local AI)',
    description: 'Menjalankan AI lokal di komputer sendiri tanpa koneksi cloud',
  },
]

function parseKeysCount(raw: string): number {
  if (!raw) return 0
  const matches = raw.match(/gsk_[A-Za-z0-9_]+/g)
  if (matches) return new Set(matches).size
  return raw.trim().split(/[\n,;]+/).filter(Boolean).length
}

interface MuteItem {
  raw: string
  phone: string
  expireIso: string | null
  isExpired: boolean
}

function parseMuteItem(rawStr: string): MuteItem {
  const parts = rawStr.split('|')
  const phone = parts[0].trim()
  const expireIso = parts[1] ? parts[1].trim() : null
  let isExpired = false
  if (expireIso) {
    isExpired = new Date().toISOString() > expireIso
  }
  return { raw: rawStr, phone, expireIso, isExpired }
}

export default function AIAssistantPage() {
  const { aiConfig, updateAIConfig, logs, contacts } = useBotStore()

  const [testing, setTesting] = useState(false)
  const [testInput, setTestInput] = useState('Halo, jam berapa toko buka dan berapa harga produk A?')
  const [testResult, setTestResult] = useState<string | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [showApiKey, setShowApiKey] = useState(false)

  // Dialog States
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [promptModalOpen, setPromptModalOpen] = useState(false)
  const [muteModalOpen, setMuteModalOpen] = useState(false)
  const [customPromptsModalOpen, setCustomPromptsModalOpen] = useState(false)
  const [adminModalOpen, setAdminModalOpen] = useState(false)

  const [newAdminPhone, setNewAdminPhone] = useState('')

  function handleAddAdmin() {
    const target = newAdminPhone.trim()
    if (!target) {
      toast.error('Masukkan nomor HP Admin terlebih dahulu')
      return
    }
    const current = aiConfig.adminNumbers ?? ['6282392115909']
    if (current.includes(target)) {
      toast.error('Nomor tersebut sudah terdaftar sebagai Admin')
      return
    }
    const updated = { adminNumbers: [...current, target] }
    updateAIConfig(updated)
    void saveAIConfig({ ...aiConfig, ...updated })
    setNewAdminPhone('')
    toast.success(`Nomor Admin ${target} berhasil ditambahkan!`)
  }

  function handleRemoveAdmin(target: string) {
    const current = aiConfig.adminNumbers ?? ['6282392115909']
    if (current.length <= 1) {
      toast.error('Minimal harus ada 1 Master Admin yang terdaftar!')
      return
    }
    const updated = { adminNumbers: current.filter((a) => a !== target) }
    updateAIConfig(updated)
    void saveAIConfig({ ...aiConfig, ...updated })
    toast.success(`Nomor Admin ${target} telah dihapus`)
  }

  // Mute Form States
  const [selectedContactPhone, setSelectedContactPhone] = useState('')
  const [customMutePhone, setCustomMutePhone] = useState('')
  const [muteDuration, setMuteDuration] = useState<'permanent' | '1h' | '24h' | '7d'>('permanent')

  // Custom Prompt Per-Number States
  const [selectedPromptPhone, setSelectedPromptPhone] = useState('')
  const [customPromptPhone, setCustomPromptPhone] = useState('')
  const [newCustomPromptText, setNewCustomPromptText] = useState('')

  function handleAddCustomPrompt() {
    const targetPhone = (selectedPromptPhone || customPromptPhone).trim()
    if (!targetPhone) {
      toast.error('Pilih kontak atau masukkan nomor HP terlebih dahulu')
      return
    }
    if (!newCustomPromptText.trim()) {
      toast.error('Isi prompt khusus untuk nomor ini terlebih dahulu')
      return
    }
    const current = { ...(aiConfig.customNumberPrompts ?? {}) }
    current[targetPhone] = newCustomPromptText.trim()

    const updated = { customNumberPrompts: current }
    updateAIConfig(updated)
    void saveAIConfig({ ...aiConfig, ...updated })

    setSelectedPromptPhone('')
    setCustomPromptPhone('')
    setNewCustomPromptText('')
    toast.success(`Prompt khusus untuk nomor ${targetPhone} berhasil disimpan!`)
  }

  function handleRemoveCustomPrompt(targetPhone: string) {
    const current = { ...(aiConfig.customNumberPrompts ?? {}) }
    delete current[targetPhone]
    const updated = { customNumberPrompts: current }
    updateAIConfig(updated)
    void saveAIConfig({ ...aiConfig, ...updated })
    toast.success(`Prompt khusus nomor ${targetPhone} telah dihapus`)
  }

  useEffect(() => {
    if (!aiConfig.provider || (aiConfig.provider as string) === 'gemini') {
      updateAIConfig({
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
      })
    }
  }, [aiConfig.provider, updateAIConfig])

  const selectedProvider = PROVIDERS.find((p) => p.value === aiConfig.provider) ?? PROVIDERS[0]
  const aiLogs = logs.filter((l) => l.type === 'ai_reply')
  const mutedItems = (aiConfig.blockedNumbers ?? []).map(parseMuteItem)

  function handleAddMute() {
    const targetPhone = (selectedContactPhone || customMutePhone).trim()
    if (!targetPhone) {
      toast.error('Pilih kontak atau masukkan nomor HP terlebih dahulu')
      return
    }

    let expireIso: string | null = null
    const now = Date.now()
    if (muteDuration === '1h') {
      expireIso = new Date(now + 3600_000).toISOString()
    } else if (muteDuration === '24h') {
      expireIso = new Date(now + 86400_000).toISOString()
    } else if (muteDuration === '7d') {
      expireIso = new Date(now + 7 * 86400_000).toISOString()
    }

    const rawEntry = expireIso ? `${targetPhone}|${expireIso}` : targetPhone
    const current = aiConfig.blockedNumbers ?? []
    const updatedNumbers = [...current.filter((b) => !b.startsWith(targetPhone)), rawEntry]

    const updated = { blockedNumbers: updatedNumbers }
    updateAIConfig(updated)
    void saveAIConfig({ ...aiConfig, ...updated })

    setSelectedContactPhone('')
    setCustomMutePhone('')
    toast.success(`AI berhasil dinonaktifkan untuk ${targetPhone}!`)
  }

  function handleUnmute(targetRaw: string) {
    const current = aiConfig.blockedNumbers ?? []
    const updatedNumbers = current.filter((b) => b !== targetRaw)
    const updated = { blockedNumbers: updatedNumbers }
    updateAIConfig(updated)
    void saveAIConfig({ ...aiConfig, ...updated })
    toast.success('AI diaktifkan kembali untuk kontak tersebut!')
  }

  async function handleSaveGlobal() {
    try {
      await saveAIConfig(aiConfig)
      toast.success('Konfigurasi AI & API Key berhasil disimpan ke database SQLite!')
    } catch {
      toast.error('Gagal menyimpan konfigurasi ke server')
    }
  }

  async function handleTest() {
    if (!aiConfig.apiKey && aiConfig.provider !== 'ollama' && aiConfig.provider !== 'custom') {
      toast.error('Masukkan API Key terlebih dahulu')
      return
    }
    void saveAIConfig(aiConfig)
    setTesting(true)
    setTestResult(null)
    setTestError(null)
    try {
      let result: string | null = null

      const locTime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
      const promptText = `[WAKTU REAL-TIME]: ${locTime} WIB\n\n${
        aiConfig.knowledgeBase
          ? `${aiConfig.systemPrompt}\n\n[KNOWLEDGE BASE & REFERENSI DATA TOKO]:\n${aiConfig.knowledgeBase}`
          : aiConfig.systemPrompt
      }`

      if (aiConfig.provider === 'groq') {
        const modelName = aiConfig.model || 'llama-3.3-70b-versatile'
        let cleanKey = (aiConfig.apiKey || '').trim()
        if (cleanKey.includes('gsk_')) {
          const match = cleanKey.match(/gsk_[A-Za-z0-9_]+/)
          if (match) cleanKey = match[0]
        }
        if (!cleanKey) {
          throw new Error('Groq API Key belum diisi. Masukkan Groq API Key yang diawali gsk_...')
        }
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cleanKey}`,
          },
          body: JSON.stringify({
            model: modelName,
            messages: [
              { role: 'system', content: promptText },
              { role: 'user', content: testInput },
            ],
            max_tokens: aiConfig.maxTokens,
            temperature: aiConfig.temperature,
          }),
        })
        const data = await res.json()
        if (data.error) {
          throw new Error(`Groq API Error (${data.error.code || res.status}): ${data.error.message || JSON.stringify(data.error)}`)
        }
        if (!res.ok) {
          throw new Error(`HTTP Error ${res.status}: ${res.statusText}`)
        }
        result = data.choices?.[0]?.message?.content ?? null
      } else if (aiConfig.provider === 'custom') {
        const endpoint = aiConfig.customUrl || 'https://api.openai.com/v1/chat/completions'
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (aiConfig.apiKey) {
          headers['Authorization'] = `Bearer ${aiConfig.apiKey}`
        }
        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: aiConfig.model || 'default',
            messages: [
              { role: 'system', content: promptText },
              { role: 'user', content: testInput },
            ],
            max_tokens: aiConfig.maxTokens,
            temperature: aiConfig.temperature,
          }),
        })
        const data = await res.json()
        if (data.error) {
          throw new Error(`API Error (${data.error.code || res.status}): ${data.error.message || JSON.stringify(data.error)}`)
        }
        result = data.choices?.[0]?.message?.content ?? null
      }

      setTestResult(result || 'Tidak ada balasan dari AI.')
    } catch (err: any) {
      setTestError(err.message || 'Gagal terhubung ke AI Provider.')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="container max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-in fade-in duration-300">
      {/* ── 1. PAGE HEADER & EXECUTIVE STATS BAR ───────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="size-10 rounded-2xl bg-gradient-to-tr from-primary/30 to-purple-500/20 flex items-center justify-center border border-primary/30 shadow-inner">
              <BrainCircuit className="size-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
                AI Assistant Studio
                <Badge variant="outline" className="text-xs font-mono bg-primary/10 text-primary border-primary/30">
                  Hermes Agent v4
                </Badge>
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Kelola Groq LPU Engine, rotasi API key, persona bisnis, serta kontrol non-aktif AI per kontak.
              </p>
            </div>
          </div>
        </div>

        {/* Global Master Power Switch */}
        <div className="flex items-center gap-3 bg-card border border-border/60 rounded-2xl p-3 shadow-md shrink-0">
          <div className="flex flex-col text-right">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5 justify-end">
              <Sparkles className="size-3.5 text-amber-500" />
              Status Utama AI Bot
            </span>
            <span className="text-[11px] text-muted-foreground font-mono">
              {aiConfig.enabled ? '🟢 AKTIF MELAYANI CHAT' : '🔴 NON-AKTIF'}
            </span>
          </div>
          <Switch
            checked={aiConfig.enabled}
            onCheckedChange={(val) => {
              updateAIConfig({ enabled: val })
              void saveAIConfig({ ...aiConfig, enabled: val })
              toast(val ? 'AI Assistant Diaktifkan!' : 'AI Assistant Dinonaktifkan')
            }}
          />
        </div>
      </div>

      {/* ── 2. EXECUTIVE QUICK STATS CARDS ──────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlowCard glowColor="rgba(168,85,247,0.2)">
          <div className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
              <Zap className="size-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Engine Provider</span>
              <span className="text-sm font-extrabold text-foreground truncate block">{selectedProvider.label.split(' ')[0]}</span>
            </div>
          </div>
        </GlowCard>

        <GlowCard glowColor="rgba(59,130,246,0.2)">
          <div className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <Key className="size-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Key Rotasi Aktif</span>
              <span className="text-sm font-extrabold text-foreground block font-mono">{parseKeysCount(aiConfig.apiKey)} Key Groq</span>
            </div>
          </div>
        </GlowCard>

        <GlowCard glowColor="rgba(239,68,68,0.2)">
          <div className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
              <UserX className="size-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Mute Kontak AI</span>
              <span className="text-sm font-extrabold text-rose-500 block font-mono">{mutedItems.length} Kontak</span>
            </div>
          </div>
        </GlowCard>

        <GlowCard glowColor="rgba(16,185,129,0.2)">
          <div className="p-4 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <Bot className="size-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Total Respon AI</span>
              <span className="text-sm font-extrabold text-emerald-500 block font-mono">{aiLogs.length} Balasan</span>
            </div>
          </div>
        </GlowCard>
      </div>

      {/* ── 3. CLEAN DASHBOARD CONTROL GRID (MODAL BUTTONS) ────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Groq Engine & Rotasi Key */}
        <GlowCard glowColor="rgba(168,85,247,0.25)">
          <div className="p-6 flex flex-col justify-between h-full space-y-4">
            <div className="space-y-3">
              <div className="size-12 rounded-2xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                <Key className="size-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Groq LPU Engine & Key Rotasi</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Konfigurasi Groq API key, rotasi multi-key otomatis jika kuota habis, serta pengaturan model & temperature.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge variant="outline" className="text-[11px] font-mono">
                  {aiConfig.model || 'llama-3.3-70b-versatile'}
                </Badge>
                <Badge variant="outline" className="text-[11px] font-mono bg-purple-500/10 text-purple-400">
                  {parseKeysCount(aiConfig.apiKey)} Key Terpasang
                </Badge>
              </div>
            </div>

            <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full h-11 rounded-xl font-bold gap-2 hover:bg-purple-500/10 border-purple-500/30">
                  <Settings2 className="size-4 text-purple-500" /> Atur Key & Model Groq
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl lg:max-w-5xl max-h-[88vh] overflow-y-auto p-6 sm:p-8 rounded-3xl border-border/80 shadow-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl sm:text-2xl font-black">
                    <Key className="size-6 text-purple-500" /> Konfigurasi Groq Engine & Multi-Key Auto Rotasi
                  </DialogTitle>
                  <DialogDescription className="text-sm">
                    Masukkan 1 atau banyak Groq API Key sekaligus untuk rotasi otomatis tanpa jeda saat kuota habis.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-3">
                  <div className="grid gap-2">
                    <Label className="text-xs font-bold uppercase tracking-wider">Provider AI</Label>
                    <Select
                      value={aiConfig.provider}
                      onValueChange={(v: AIProvider) => {
                        updateAIConfig({
                          provider: v,
                          model: v === 'groq' ? 'llama-3.3-70b-versatile' : v === 'ollama' ? 'llama3.2' : 'llama-3.1-8b-instant',
                        })
                      }}
                    >
                      <SelectTrigger className="rounded-xl h-11 font-medium">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {PROVIDERS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            <span className="font-medium">{p.label}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                        API Key (Multi-Key Rotasi)
                        <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-400 font-mono">
                          {parseKeysCount(aiConfig.apiKey)} Key Aktif
                        </Badge>
                      </Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => setShowApiKey(!showApiKey)}
                      >
                        {showApiKey ? <EyeOff className="size-3.5 mr-1" /> : <Eye className="size-3.5 mr-1" />}
                        {showApiKey ? 'Sembunyikan' : 'Lihat Key'}
                      </Button>
                    </div>
                    <Textarea
                      spellCheck={false}
                      rows={8}
                      className="rounded-xl font-mono text-sm border-border/80 bg-muted/20 min-h-[180px] p-3 leading-relaxed"
                      value={aiConfig.apiKey}
                      onChange={(e) => {
                        const val = e.target.value
                        updateAIConfig({ apiKey: val })
                        void saveAIConfig({ ...aiConfig, apiKey: val })
                      }}
                      placeholder="gsk_key1...\ngsk_key2...\ngsk_key3...\n(Pisahkan per baris atau koma untuk rotasi otomatis tanpa batas)"
                    />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      💡 <b>Area Sangat Luas!</b> Masukkan puluhan Groq API Key sekaligus (pisahkan per baris). Jika key #1 habis kuota, Go backend akan otomatis memakai key #2, key #3, dst!
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-xs font-bold uppercase tracking-wider">Model Name</Label>
                    <Input
                      className="rounded-xl h-11 font-mono text-sm"
                      value={aiConfig.model}
                      onChange={(e) => updateAIConfig({ model: e.target.value })}
                      placeholder="Contoh: llama-3.3-70b-versatile"
                    />
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {SUGGESTED_MODELS.map((m) => (
                        <Badge
                          key={m}
                          variant={aiConfig.model === m ? 'default' : 'outline'}
                          className="cursor-pointer font-mono text-[11px] px-2 py-0.5 rounded-lg hover:bg-primary/20"
                          onClick={() => updateAIConfig({ model: m })}
                        >
                          {m}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 pt-2">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs font-bold uppercase tracking-wider">Temperature ({aiConfig.temperature})</Label>
                      <span className="font-mono text-sm font-extrabold text-primary">{aiConfig.temperature}</span>
                    </div>
                    <Slider
                      min={0}
                      max={1}
                      step={0.05}
                      value={[aiConfig.temperature]}
                      onValueChange={([v]: number[]) => updateAIConfig({ temperature: v })}
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-3">
                  <Button onClick={handleSaveGlobal} className="rounded-xl font-bold gap-2">
                    <Save className="size-4" /> Simpan Konfigurasi
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </GlowCard>

        {/* Card 2: Persona & Business Knowledge */}
        <GlowCard glowColor="rgba(99,102,241,0.25)">
          <div className="p-6 flex flex-col justify-between h-full space-y-4">
            <div className="space-y-3">
              <div className="size-12 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                <Wand2 className="size-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Persona & Data Toko (FAQ)</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Atur gaya bahasa CS/Sales AI, preset persona 1-klik, serta basis pengetahuan produk dan toko Anda.
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge variant="outline" className="text-[11px] font-mono bg-indigo-500/10 text-indigo-400">
                  {aiConfig.knowledgeBase ? '📚 Data Toko Terisi' : '📝 Prompt Standar'}
                </Badge>
              </div>
            </div>

            <Dialog open={promptModalOpen} onOpenChange={setPromptModalOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full h-11 rounded-xl font-bold gap-2 hover:bg-indigo-500/10 border-indigo-500/30">
                  <Sliders className="size-4 text-indigo-500" /> Edit Persona & Data Toko
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl lg:max-w-5xl max-h-[88vh] overflow-y-auto p-6 sm:p-8 rounded-3xl border-border/80 shadow-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl sm:text-2xl font-black">
                    <Wand2 className="size-6 text-indigo-500" /> Prompting & Business Knowledge Base
                  </DialogTitle>
                  <DialogDescription className="text-sm">
                    Berikan petunjuk persona AI dan daftar produk/FAQ agar AI menjawab pertanyaan pelanggan dengan tepat.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-3">
                  <div className="grid gap-2">
                    <Label className="text-xs font-bold uppercase tracking-wider">Preset Persona 1-Klik</Label>
                    <div className="flex flex-wrap gap-2">
                      {PROMPT_PRESETS.map((p) => (
                        <Button
                          key={p.name}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl text-xs font-semibold"
                          onClick={() => {
                            updateAIConfig({ systemPrompt: p.prompt })
                            toast.success(`Preset "${p.name}" diterapkan!`)
                          }}
                        >
                          {p.name}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-xs font-bold uppercase tracking-wider">System Prompt Persona AI</Label>
                    <Textarea
                      rows={5}
                      className="rounded-xl text-xs font-mono p-3 leading-relaxed"
                      value={aiConfig.systemPrompt}
                      onChange={(e) => updateAIConfig({ systemPrompt: e.target.value })}
                      placeholder="Petunjuk gaya bahasa CS..."
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-xs font-bold uppercase tracking-wider">Basis Pengetahuan / Data Toko & FAQ</Label>
                    <Textarea
                      rows={6}
                      className="rounded-xl text-xs font-mono p-3 leading-relaxed"
                      value={aiConfig.knowledgeBase}
                      onChange={(e) => updateAIConfig({ knowledgeBase: e.target.value })}
                      placeholder="Masukkan daftar harga, stok, alamat toko, cara pembayaran..."
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-3">
                  <Button onClick={handleSaveGlobal} className="rounded-xl font-bold gap-2">
                    <Save className="size-4" /> Simpan Prompt & Data Toko
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </GlowCard>

        {/* Card 3: Mute AI per Kontak & Timed Expiration */}
        <GlowCard glowColor="rgba(239,68,68,0.25)">
          <div className="p-6 flex flex-col justify-between h-full space-y-4">
            <div className="space-y-3">
              <div className="size-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                <UserX className="size-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Kontrol Mute AI per Kontak</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Pilih kontak dari daftar HP Anda dan atur berapa lama AI dinonaktifkan (1 Jam, 24 Jam, 7 Hari, Selamanya).
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge variant="outline" className="text-[11px] font-mono bg-rose-500/10 text-rose-400">
                  {mutedItems.length} Kontak Dinonaktifkan
                </Badge>
              </div>
            </div>

            <Dialog open={muteModalOpen} onOpenChange={setMuteModalOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full h-11 rounded-xl font-bold gap-2 hover:bg-rose-500/10 border-rose-500/30">
                  <UserX className="size-4 text-rose-500" /> Kelola Mute Kontak & Durasi
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl lg:max-w-5xl max-h-[88vh] overflow-y-auto p-6 sm:p-8 rounded-3xl border-border/80 shadow-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl sm:text-2xl font-black">
                    <UserX className="size-6 text-rose-500" /> Pengaturan Nonaktifkan AI per Kontak
                  </DialogTitle>
                  <DialogDescription className="text-sm">
                    Pilih kontak dan atur durasi berapa lama AI tidak membalas chat kontak tersebut.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-3">
                  {/* Add Mute Form */}
                  <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-3">
                    <span className="text-xs font-bold text-foreground uppercase tracking-wider block">Tambah Kontak Ke Daftar Mute AI</span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Pick from contacts */}
                      <div>
                        <Label className="text-[11px] text-muted-foreground mb-1 block">Pilih Dari Kontak Tersimpan</Label>
                        <Select value={selectedContactPhone} onValueChange={(v) => { setSelectedContactPhone(v); setCustomMutePhone(''); }}>
                          <SelectTrigger className="rounded-xl h-10 text-xs">
                            <SelectValue placeholder="-- Pilih Kontak --" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {contacts.map((c) => (
                              <SelectItem key={c.id} value={c.phone}>
                                {c.name} ({c.phone})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Manual input */}
                      <div>
                        <Label className="text-[11px] text-muted-foreground mb-1 block">Atau Ketik Nomor Manual</Label>
                        <Input
                          className="rounded-xl h-10 text-xs font-mono"
                          value={customMutePhone}
                          onChange={(e) => { setCustomMutePhone(e.target.value); setSelectedContactPhone(''); }}
                          placeholder="Contoh: 6281234567890"
                        />
                      </div>
                    </div>

                    {/* Mute Duration */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                      <div className="flex items-center gap-2">
                        <Clock className="size-4 text-primary" />
                        <span className="text-xs font-bold text-foreground">Pilih Durasi Nonaktif AI:</span>
                      </div>
                      <Select value={muteDuration} onValueChange={(v: any) => setMuteDuration(v)}>
                        <SelectTrigger className="rounded-xl h-9 text-xs w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl">
                          <SelectItem value="permanent">⏸️ Selamanya (Permanen)</SelectItem>
                          <SelectItem value="1h">⏱️ 1 Jam (Temporer)</SelectItem>
                          <SelectItem value="24h">⏱️ 24 Jam (1 Hari)</SelectItem>
                          <SelectItem value="7d">⏱️ 7 Hari (1 Minggu)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button onClick={handleAddMute} className="w-full h-10 rounded-xl font-bold gap-2 bg-rose-600 hover:bg-rose-700 text-white">
                      <Plus className="size-4" /> Matikan AI Untuk Kontak Ini
                    </Button>
                  </div>

                  {/* Active Muted Contacts Table */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-wider block">Daftar Kontak Yang Sedang Dinonaktifkan:</span>
                    {mutedItems.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed text-center text-xs text-muted-foreground">
                        Belum ada kontak yang dinonaktifkan. Semua kontak saat ini bisa mengakses AI.
                      </div>
                    ) : (
                      <div className="max-h-48 overflow-y-auto space-y-2">
                        {mutedItems.map((item) => (
                          <div key={item.raw} className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/10">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-foreground">{item.phone}</span>
                              {item.expireIso ? (
                                item.isExpired ? (
                                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                    Kadaluarsa (Aktif Kembali)
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">
                                    Mute s/d {new Date(item.expireIso).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                                  </Badge>
                                )
                              ) : (
                                <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-400 border-rose-500/20">
                                  Mute Permanen
                                </Badge>
                              )}
                            </div>

                            <Button variant="ghost" size="sm" onClick={() => handleUnmute(item.raw)} className="h-8 px-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10">
                              <Trash2 className="size-3.5 mr-1" /> Aktifkan AI Kembali
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </GlowCard>

        {/* Card 4: Custom Prompt Per-Nomor (Pacar, VIP, Bos) */}
        <GlowCard glowColor="rgba(236,72,153,0.25)">
          <div className="p-6 flex flex-col justify-between h-full space-y-4">
            <div className="space-y-3">
              <div className="size-12 rounded-2xl bg-pink-500/10 text-pink-500 flex items-center justify-center">
                <Heart className="size-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Prompting Beda-Beda Per Nomor</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Atur gaya bahasa khusus per kontak (misal: Pacar, Pasangan, Client VIP). AI akan meniru bahasa dan karakter yang Anda inginkan!
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge variant="outline" className="text-[11px] font-mono bg-pink-500/10 text-pink-400 border-pink-500/20">
                  {Object.keys(aiConfig.customNumberPrompts ?? {}).length} Kontak Khusus
                </Badge>
              </div>
            </div>

            <Dialog open={customPromptsModalOpen} onOpenChange={setCustomPromptsModalOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full h-11 rounded-xl font-bold gap-2 hover:bg-pink-500/10 border-pink-500/30">
                  <Heart className="size-4 text-pink-500" /> Kelola Prompting Per-Nomor
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl lg:max-w-5xl max-h-[88vh] overflow-y-auto p-6 sm:p-8 rounded-3xl border-border/80 shadow-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl sm:text-2xl font-black">
                    <Heart className="size-6 text-pink-500" /> Custom Prompt Persona Per-Nomor Kontak
                  </DialogTitle>
                  <DialogDescription className="text-sm">
                    Berikan prompt instruksi khusus untuk nomor tertentu (misal: pacar, pasangan, atau bos). AI akan otomatis membaca prompt khusus ini saat nomor tersebut chat!
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-3">
                  <div className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-3">
                    <span className="text-xs font-bold text-foreground uppercase tracking-wider block">Tambah Prompt Khusus Nomor</span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label className="text-[11px] text-muted-foreground mb-1 block">Pilih Kontak</Label>
                        <Select value={selectedPromptPhone} onValueChange={(v) => { setSelectedPromptPhone(v); setCustomPromptPhone(''); }}>
                          <SelectTrigger className="rounded-xl h-10 text-xs">
                            <SelectValue placeholder="-- Pilih Kontak --" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {contacts.map((c) => (
                              <SelectItem key={c.id} value={c.phone}>
                                {c.name} ({c.phone})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-[11px] text-muted-foreground mb-1 block">Atau Ketik Nomor Manual</Label>
                        <Input
                          className="rounded-xl h-10 text-xs font-mono"
                          value={customPromptPhone}
                          onChange={(e) => { setCustomPromptPhone(e.target.value); setSelectedPromptPhone(''); }}
                          placeholder="Contoh: 62834938290"
                        />
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label className="text-xs font-bold uppercase tracking-wider">Isi Prompt Khusus Kontak Ini</Label>
                      <Textarea
                        rows={4}
                        className="rounded-xl text-xs font-mono p-3 leading-relaxed"
                        value={newCustomPromptText}
                        onChange={(e) => setNewCustomPromptText(e.target.value)}
                        placeholder="Contoh: Ini pacarku tersayang. Balas dengan bahasa yang manis, perhatian, santai, panggil aku dengan sebutan manis, hindari bahasa kaku!"
                      />
                    </div>

                    <Button onClick={handleAddCustomPrompt} className="w-full h-10 rounded-xl font-bold gap-2 bg-pink-600 hover:bg-pink-700 text-white">
                      <Plus className="size-4" /> Simpan Prompt Khusus Kontak Ini
                    </Button>
                  </div>

                  {/* Active Custom Prompts List */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold uppercase tracking-wider block">Daftar Prompting Khusus Aktif:</span>
                    {Object.keys(aiConfig.customNumberPrompts ?? {}).length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed text-center text-xs text-muted-foreground">
                        Belum ada prompt khusus per-nomor. Semua kontak masih menggunakan prompt standar global.
                      </div>
                    ) : (
                      <div className="max-h-52 overflow-y-auto space-y-2">
                        {Object.entries(aiConfig.customNumberPrompts ?? {}).map(([phone, prompt]) => (
                          <div key={phone} className="p-3 rounded-xl border border-border/60 bg-muted/10 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs font-bold text-foreground flex items-center gap-1.5">
                                <Heart className="size-3.5 text-pink-500 fill-pink-500" /> {phone}
                              </span>
                              <Button variant="ghost" size="sm" onClick={() => handleRemoveCustomPrompt(phone)} className="h-7 px-2 text-xs text-rose-400 hover:text-rose-300">
                                <Trash2 className="size-3.5 mr-1" /> Hapus
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono bg-muted/30 p-2 rounded-lg leading-relaxed whitespace-pre-wrap">
                              {prompt}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </GlowCard>

        {/* Card 5: Master Admin & Telegram Bot Control */}
        <GlowCard glowColor="rgba(245,158,11,0.25)">
          <div className="p-6 flex flex-col justify-between h-full space-y-4">
            <div className="space-y-3">
              <div className="size-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <ShieldCheck className="size-6" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Menu Control Master Admin & Telegram Bot</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Kendalikan penuh seluruh sistem AI Bot dari <b>Telegram Admin Bot</b> tanpa batasan atau dari chat WA!
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge variant="outline" className="text-[11px] font-mono bg-sky-500/10 text-sky-400 border-sky-500/20">
                  <Send className="size-3 mr-1" /> {aiConfig.telegramBotToken ? 'Telegram Admin Aktif' : 'Telegram Off'}
                </Badge>
                <Badge variant="outline" className="text-[11px] font-mono bg-amber-500/10 text-amber-400 border-amber-500/20">
                  👑 WA Admin
                </Badge>
              </div>
            </div>

            <Dialog open={adminModalOpen} onOpenChange={setAdminModalOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full h-11 rounded-xl font-bold gap-2 hover:bg-amber-500/10 border-amber-500/30">
                  <ShieldCheck className="size-4 text-amber-500" /> Buka Akses Telegram & WA Admin
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl lg:max-w-5xl max-h-[88vh] overflow-y-auto p-6 sm:p-8 rounded-3xl border-border/80 shadow-2xl">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-xl sm:text-2xl font-black">
                    <ShieldCheck className="size-6 text-amber-500" /> Hak Akses Master Admin Control (Telegram & WA)
                  </DialogTitle>
                  <DialogDescription className="text-sm">
                    Gunakan <b>Telegram Bot</b> atau WhatsApp Admin untuk mengendalikan bot secara langsung tanpa perlu membuka dashboard web!
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-3">
                  {/* Telegram Admin Bot Configuration Form */}
                  <div className="p-5 rounded-2xl border border-sky-500/30 bg-sky-500/10 space-y-3">
                    <span className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-2">
                      <Send className="size-4 text-sky-400" /> Telegram Admin Bot Configuration (Rekomendasi Utama)
                    </span>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Dapatkan Telegram Bot Token dari <b>@BotFather</b> di Telegram. Anda bisa mengendalikan seluruh sistem bot, menambah key, mematikan AI kontak, dan mengobrol tanpa batasan!
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <Label className="text-xs font-bold uppercase tracking-wider block mb-1.5">Telegram Bot Token</Label>
                        <Input
                          className="rounded-xl h-11 font-mono text-xs border-border/80 bg-muted/20"
                          value={aiConfig.telegramBotToken || ''}
                          onChange={(e) => {
                            const val = e.target.value.trim()
                            updateAIConfig({ telegramBotToken: val })
                            void saveAIConfig({ ...aiConfig, telegramBotToken: val })
                          }}
                          placeholder="Contoh: 123456789:ABCdefGhIJKlmNoPQ..."
                        />
                      </div>

                      <div>
                        <Label className="text-xs font-bold uppercase tracking-wider block mb-1.5">Telegram Admin Chat ID (Opsional)</Label>
                        <Input
                          className="rounded-xl h-11 font-mono text-xs border-border/80 bg-muted/20"
                          value={aiConfig.telegramAdminChatId || ''}
                          onChange={(e) => {
                            const val = e.target.value.trim()
                            updateAIConfig({ telegramAdminChatId: val })
                            void saveAIConfig({ ...aiConfig, telegramAdminChatId: val })
                          }}
                          placeholder="Kosongkan untuk Auto-Bind chat pertama"
                        />
                      </div>
                    </div>
                  </div>

                  {/* WhatsApp & Telegram Command Cheatsheet */}
                  <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-2">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">📜 Cheatsheet Perintah Chat Admin (Telegram & WA):</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                      <div className="bg-card/80 p-2.5 rounded-lg border border-border/50">
                        <span className="text-amber-400 font-bold block">/status</span>
                        <span className="text-muted-foreground">Cek status bot & total key aktif</span>
                      </div>
                      <div className="bg-card/80 p-2.5 rounded-lg border border-border/50">
                        <span className="text-amber-400 font-bold block">/addkey [gsk_key]</span>
                        <span className="text-muted-foreground">Tambah Groq Key baru dari chat</span>
                      </div>
                      <div className="bg-card/80 p-2.5 rounded-lg border border-border/50">
                        <span className="text-amber-400 font-bold block">/mute [nomor] [durasi]</span>
                        <span className="text-muted-foreground">Matikan AI untuk nomor tersebut</span>
                      </div>
                      <div className="bg-card/80 p-2.5 rounded-lg border border-border/50">
                        <span className="text-amber-400 font-bold block">/unmute [nomor]</span>
                        <span className="text-muted-foreground">Aktifkan kembali AI kontak</span>
                      </div>
                      <div className="bg-card/80 p-2.5 rounded-lg border border-border/50">
                        <span className="text-amber-400 font-bold block">/setprompt [nomor] [prompt]</span>
                        <span className="text-muted-foreground">Set prompt persona khusus per nomor</span>
                      </div>
                      <div className="bg-card/80 p-2.5 rounded-lg border border-border/50">
                        <span className="text-amber-400 font-bold block">/helpadmin</span>
                        <span className="text-muted-foreground">Tampilkan daftar menu lengkap</span>
                      </div>
                    </div>
                  </div>

                  {/* Registered Admin Numbers */}
                  <div className="space-y-3">
                    <span className="text-xs font-bold uppercase tracking-wider block">Daftar Nomor Master Admin Terdaftar:</span>
                    <div className="flex gap-2">
                      <Input
                        className="rounded-xl h-10 text-xs font-mono"
                        value={newAdminPhone}
                        onChange={(e) => setNewAdminPhone(e.target.value)}
                        placeholder="Masukkan nomor admin baru (misal: 6281234567890)"
                      />
                      <Button onClick={handleAddAdmin} className="h-10 rounded-xl font-bold px-4 gap-1.5 shrink-0 bg-amber-600 hover:bg-amber-700 text-white">
                        <Plus className="size-4" /> Tambah Admin
                      </Button>
                    </div>

                    <div className="space-y-2 pt-1">
                      {(aiConfig.adminNumbers ?? ['6282392115909']).map((adminPhone) => (
                        <div key={adminPhone} className="flex items-center justify-between p-3 rounded-xl border border-border/60 bg-muted/10">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="size-4 text-amber-500" />
                            <span className="font-mono text-xs font-bold text-foreground">{adminPhone}</span>
                            {adminPhone === '6282392115909' && (
                              <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px]">
                                Master Owner
                              </Badge>
                            )}
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveAdmin(adminPhone)}
                            disabled={adminPhone === '6282392115909'}
                            className="h-8 px-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                          >
                            <Trash2 className="size-3.5 mr-1" /> Hapus
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </GlowCard>
      </div>

      {/* ── 4. HERMES AGENTIC SKILLS STUDIO ─────────────────────────────────── */}
      <GlowCard glowColor="rgba(16,185,129,0.25)">
        <div className="p-6 border-b border-border/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <Sparkles className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Hermes Agentic Skills Engine</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Kemampuan pintar otomatis yang tertanam di dalam AI Bot Anda</p>
            </div>
          </div>
          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs font-mono">4 Skills Active</Badge>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl border border-border/60 bg-muted/10 space-y-2">
            <div className="size-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Clock className="size-4" />
            </div>
            <h4 className="text-xs font-bold text-foreground">Real-time Clock Skill</h4>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              AI mengetahui jam, hari, dan tanggal WIB secara real-time untuk menjawab pertanyaan jadwal toko.
            </p>
          </div>

          <div className="p-4 rounded-2xl border border-border/60 bg-muted/10 space-y-2">
            <div className="size-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Calculator className="size-4" />
            </div>
            <h4 className="text-xs font-bold text-foreground">Auto-Calculator Skill</h4>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              AI menghitung jumlah harga barang, diskon, dan total biaya pembeli secara presisi tanpa salah hitung.
            </p>
          </div>

          <div className="p-4 rounded-2xl border border-border/60 bg-muted/10 space-y-2">
            <div className="size-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <ShoppingBag className="size-4" />
            </div>
            <h4 className="text-xs font-bold text-foreground">Fast Checkout Formatter</h4>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Otomatis merangkum detail order pembeli dalam format invoice rapi [NAMA, ALAMAT, ITEM PESANAN].
            </p>
          </div>

          <div className="p-4 rounded-2xl border border-border/60 bg-muted/10 space-y-2">
            <div className="size-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <BookOpen className="size-4" />
            </div>
            <h4 className="text-xs font-bold text-foreground">Knowledge Base FAQ Matcher</h4>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Mencocokkan pertanyaan pembeli dengan basis pengetahuan bisnis yang Anda masukkan di prompt.
            </p>
          </div>
        </div>
      </GlowCard>

      {/* ── 5. LIVE TEST AI PLAYGROUND CARD ──────────────────────────────────── */}
      <GlowCard glowColor="rgba(59,130,246,0.25)">
        <div className="p-6 border-b border-border/40 flex items-center gap-3">
          <div className="size-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
            <TestTube className="size-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">Uji Coba AI Live Playground</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Uji coba respons AI Groq secara live sebelum menerima chat dari pembeli</p>
          </div>
        </div>

        <div className="p-6 flex flex-col gap-5">
          <div className="flex gap-3">
            <Input
              className="rounded-xl h-11 text-sm border-border/80 bg-muted/20"
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              placeholder="Tulis pesan uji coba..."
              onKeyDown={(e) => e.key === 'Enter' && handleTest()}
            />
            <Button onClick={handleTest} disabled={testing} className="shrink-0 h-11 rounded-xl px-6 gap-2 font-semibold">
              {testing ? <Loader2 className="size-4 animate-spin" /> : <TestTube className="size-4" />}
              {testing ? 'Menguji...' : 'Uji AI'}
            </Button>
          </div>

          {testResult && (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                <CheckCircle2 className="size-4" /> Balasan AI Groq (Respon Berhasil):
              </div>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-medium">{testResult}</p>
            </div>
          )}

          {testError && (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 space-y-2 text-rose-400">
              <div className="flex items-center gap-2 font-bold text-xs">
                <XCircle className="size-4" /> Detail Error / Diagnosa API:
              </div>
              <p className="text-xs font-mono whitespace-pre-wrap">{testError}</p>
            </div>
          )}
        </div>
      </GlowCard>
    </div>
  )
}
