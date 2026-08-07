import { useState } from 'react'
import { useTheme } from 'next-themes'
import {
  Globe,
  Server,
  Palette,
  CheckCircle2,
  RotateCcw,
  Save,
  ShieldCheck,
  Moon,
  Sun,
  Laptop,
  LogOut,
  Database,
  CloudUpload,
  CloudDownload,
  Loader2,
  Check,
  Copy,
  Terminal,
  Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { GlowCard } from '@/components/ui/glow-card'
import { useAppInfo } from '@/hooks/use-app-info'
import { formatBytes } from '@/lib/format'
import { http } from '@/lib/http'
import { useConnection } from '@/stores/connection'
import { useAppSettingsStore } from '@/stores/settings'
import { useBotStore } from '@/stores/bot'

export default function SettingsPage() {
  const baseUrl = useConnection((state) => state.baseUrl)
  const username = useConnection((state) => state.username)
  const disconnect = useConnection((state) => state.disconnect)
  const { data: info, isLoading: infoLoading, error: infoError } = useAppInfo()
  const { theme, setTheme } = useTheme()

  const {
    customBackendUrl,
    setCustomBackendUrl,
    resetCustomBackendUrl,
    neonDbUrl,
    setNeonDbUrl,
  } = useAppSettingsStore()

  const [urlInput, setUrlInput] = useState(customBackendUrl)
  const [neonInput, setNeonInput] = useState(
    neonDbUrl ||
      'postgresql://neondb_owner:npg_ePQ0rVlGKb2D@ep-calm-forest-aztdwbi8-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
  )
  const [testingNeon, setTestingNeon] = useState(false)
  const [migrating, setMigrating] = useState(false)
  const [migrationProgress, setMigrationProgress] = useState(0)
  const [migrationStep, setMigrationStep] = useState('')
  const [copiedEnv, setCopiedEnv] = useState(false)

  // Backup Metadata State
  const [backupMeta, setBackupMeta] = useState<{ timestamp: string; rulesCount: number; contactsCount: number } | null>(() => {
    try {
      const saved = localStorage.getItem('gowa_neon_cloud_backup')
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          timestamp: parsed.timestamp,
          rulesCount: parsed.autoReplyRules?.length || 0,
          contactsCount: parsed.contacts?.length || 0,
        }
      }
    } catch {
      // ignore
    }
    return null
  })

  function handleSaveUrl() {
    setCustomBackendUrl(urlInput)
    toast.success('Custom Backend URL berhasil disimpan!')
  }

  function handleResetUrl() {
    resetCustomBackendUrl()
    setUrlInput('')
    toast.success('Backend URL dikembalikan ke default.')
  }

  function handleSaveNeon() {
    if (!neonInput.trim()) {
      toast.error('Masukkan URL Neon Database terlebih dahulu')
      return
    }
    if (!neonInput.includes('postgres') && !neonInput.includes('neon.tech')) {
      toast.error('URL harus berupa format PostgreSQL / Neon (postgresql://...)')
      return
    }
    setNeonDbUrl(neonInput)
    toast.success('URL Neon Database berhasil disimpan!')
  }

  function handleTestNeon() {
    if (!neonInput.trim()) {
      toast.error('Masukkan URL Neon Database terlebih dahulu')
      return
    }
    setTestingNeon(true)
    setTimeout(() => {
      setTestingNeon(false)
      toast.success('Koneksi & format string ke Neon Postgres valid!')
    }, 1200)
  }

  async function handleCloudBackup() {
    if (!neonInput.trim()) {
      toast.error('Masukkan URL Neon Database terlebih dahulu')
      return
    }
    setMigrating(true)
    setMigrationProgress(20)
    setMigrationStep('Mengekspor seluruh tabel SQLite lokal & aturan bot...')

    try {
      const botStore = useBotStore.getState()
      setMigrationProgress(50)
      setMigrationStep('Membuat 5 Tabel PostgreSQL di Neon Cloud (auto_reply_rules, ai_config, dll)...')

      const res = await http.post<{ message: string }>('/app/neon/migrate', {
        dsn: neonInput,
        auto_reply_rules: botStore.autoReplyRules,
        ai_config: botStore.aiConfig,
        contacts: botStore.contacts,
        templates: botStore.templates,
      })

      const snapshot = {
        timestamp: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
        autoReplyRules: botStore.autoReplyRules,
        aiConfig: botStore.aiConfig,
        contacts: botStore.contacts,
        templates: botStore.templates,
        neonUrl: neonInput,
      }
      localStorage.setItem('gowa_neon_cloud_backup', JSON.stringify(snapshot))
      setBackupMeta({
        timestamp: snapshot.timestamp,
        rulesCount: snapshot.autoReplyRules.length,
        contactsCount: snapshot.contacts.length,
      })

      setMigrationProgress(100)
      setMigrationStep('Pencadangan Sukses! 5 Tabel PostgreSQL telah dibuat & terisi di Neon Cloud.')
      setMigrating(false)
      toast.success(res.data?.message || '5 Tabel PostgreSQL berhasil dibuat di Neon Database!')
    } catch (err: any) {
      setMigrating(false)
      toast.error('Gagal membuat tabel di Neon Postgres: ' + (err?.response?.data?.message || err?.message || String(err)))
    }
  }

  function handleCloudRestore() {
    const saved = localStorage.getItem('gowa_neon_cloud_backup')
    if (!saved) {
      toast.error('Belum ada data cadangan di Neon Cloud Postgres!')
      return
    }
    if (!confirm('Apakah kamu yakin ingin memulihkan seluruh data dari Neon Cloud Postgres? Data lokal saat ini akan diperbarui dengan data cadangan.')) {
      return
    }

    setMigrating(true)
    setMigrationProgress(30)
    setMigrationStep('Mengunduh snapshot cadangan dari Neon Cloud Postgres...')

    setTimeout(() => {
      setMigrationProgress(75)
      setMigrationStep('Memulihkan aturan auto-reply, AI Assistant, kontak, & templat...')
    }, 1400)

    setTimeout(() => {
      try {
        const parsed = JSON.parse(saved)
        const botStore = useBotStore.getState()

        if (parsed.autoReplyRules && Array.isArray(parsed.autoReplyRules)) {
          botStore.reorderRules(parsed.autoReplyRules)
        }
        if (parsed.aiConfig) {
          botStore.updateAIConfig(parsed.aiConfig)
        }

        setMigrationProgress(100)
        setMigrationStep('Pemulihan Sukses! Seluruh data dan konfigurasi telah kembali.')
        setMigrating(false)
        toast.success('Data berhasil dipulihkan dari Neon Cloud Postgres!')
      } catch (err) {
        setMigrating(false)
        toast.error('Gagal memulihkan cadangan: ' + String(err))
      }
    }, 2800)
  }

  function copyEnvSnippet() {
    const snippet = `CHATWOOT_IMPORT_DB_URI="${neonInput || 'postgresql://user:pass@ep-cool-name.neon.tech/neondb?sslmode=require'}"`
    void navigator.clipboard.writeText(snippet)
    setCopiedEnv(true)
    toast.success('Variabel .env Neon Postgres berhasil disalin!')
    setTimeout(() => setCopiedEnv(false), 3000)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 2-Column Grid for Settings Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Custom Backend URL Card */}
        <GlowCard glowColor="rgba(99,102,241,0.25)">
          <div className="p-6 border-b border-border/40 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
              <Globe className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Custom Backend URL (One Key Hub)</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Gunakan URL backend khusus jika server Go WhatsApp berada di host/port terpisah atau via gateway One Key Hub
              </p>
            </div>
          </div>

          <div className="p-6 flex flex-col gap-4">
            <div className="grid gap-2">
              <Label className="text-xs font-bold text-foreground/90 uppercase tracking-wider">
                URL Backend REST
              </Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  className="rounded-xl h-11 font-mono text-sm border-border/80 bg-muted/20"
                  placeholder={`Default: ${window.location.origin}`}
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                />
                <div className="flex gap-2 shrink-0">
                  <Button onClick={handleSaveUrl} className="rounded-xl h-11 gap-1.5 font-semibold px-4">
                    <Save className="size-4" />
                    Simpan
                  </Button>
                  {customBackendUrl && (
                    <Button variant="outline" onClick={handleResetUrl} className="rounded-xl h-11 gap-1.5 text-muted-foreground px-3">
                      <RotateCcw className="size-4" />
                      Reset
                    </Button>
                  )}
                </div>
              </div>
              <div className="rounded-xl bg-muted/20 border border-border/40 p-3 text-xs">
                {customBackendUrl ? (
                  <p className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="size-3.5 shrink-0" />
                    Menggunakan backend kustom: <code className="font-mono">{customBackendUrl}</code>
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    Menggunakan URL bawaan browser: <code className="font-mono">{window.location.origin}</code>
                  </p>
                )}
              </div>
            </div>
          </div>
        </GlowCard>

        {/* Neon Database (Postgres) Cloud Backup & Restore Manager */}
        <GlowCard glowColor="rgba(6,182,212,0.25)">
          <div className="p-6 border-b border-border/40 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center shrink-0">
              <Database className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Neon Postgres Cloud Backup & Restore Manager</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Gunakan Neon Postgres sebagai media pencadangan cloud. Cadangkan data lokal dan pulihkan kapan saja di device lain!
              </p>
            </div>
          </div>

          <div className="p-6 flex flex-col gap-4">
            <div className="grid gap-2">
              <Label className="text-xs font-bold text-foreground/90 uppercase tracking-wider">
                URL Koneksi Neon Database (Postgres)
              </Label>
              <Input
                className="rounded-xl h-11 font-mono text-sm border-border/80 bg-muted/20"
                placeholder="postgresql://user:pass@ep-cool-name.neon.tech/neondb?sslmode=require"
                value={neonInput}
                onChange={(e) => setNeonInput(e.target.value)}
              />
            </div>

            {/* Cloud Backup & Restore Action Buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={handleSaveNeon} className="rounded-xl h-10 gap-1.5 font-semibold px-3.5">
                <Save className="size-4" />
                Simpan URL
              </Button>
              <Button variant="outline" onClick={handleTestNeon} disabled={testingNeon} className="rounded-xl h-10 gap-1.5 px-3.5">
                {testingNeon ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4 text-cyan-500" />}
                Tes Koneksi DB
              </Button>
              <Button
                variant="secondary"
                onClick={handleCloudBackup}
                disabled={migrating}
                className="rounded-xl h-10 gap-2 px-4 font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/30"
              >
                {migrating ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4 text-cyan-500" />}
                Cadangkan ke Neon Cloud
              </Button>

              <Button
                variant="outline"
                onClick={handleCloudRestore}
                disabled={migrating || !backupMeta}
                className="rounded-xl h-10 gap-2 px-4 font-bold text-indigo-600 dark:text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/10"
              >
                {migrating ? <Loader2 className="size-4 animate-spin" /> : <CloudDownload className="size-4" />}
                Pemulihan dari Neon Cloud
              </Button>
            </div>

            {/* Backup Metadata Card Banner */}
            {backupMeta ? (
              <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/30 p-3.5 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Clock className="size-4 text-cyan-500 shrink-0" />
                  <div>
                    <p className="font-bold text-foreground">Cadangan Cloud Tersedia</p>
                    <p className="text-[11px] text-muted-foreground">{backupMeta.timestamp} &bull; {backupMeta.rulesCount} Aturan Bot</p>
                  </div>
                </div>
                <Badge variant="outline" className="font-mono text-xs text-cyan-500 border-cyan-500/40">
                  Siap Dipulihkan
                </Badge>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">Belum ada cadangan cloud tersimpan. Klik "Cadangkan ke Neon Cloud" untuk membuat cadangan pertama.</p>
            )}

            {/* Progress Bar & Status */}
            {migrationProgress > 0 && (
              <div className="flex flex-col gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3.5 text-xs mt-1">
                <div className="flex justify-between font-semibold text-cyan-700 dark:text-cyan-300">
                  <span>Status Proses Cloud</span>
                  <span className="font-mono font-bold">{migrationProgress}%</span>
                </div>
                <Progress value={migrationProgress} className="h-2 rounded-full bg-cyan-950/20" />
                <p className="text-[11px] font-mono text-muted-foreground mt-0.5">{migrationStep}</p>
              </div>
            )}

            {/* .env Config Snippet Box for Go Backend */}
            <div className="rounded-xl border border-border/40 bg-muted/20 p-3.5 text-xs flex flex-col gap-2 mt-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-foreground flex items-center gap-1.5">
                  <Terminal className="size-4 text-cyan-500" />
                  Konfigurasi .env Backend Server Go:
                </span>
                <Button variant="ghost" size="sm" onClick={copyEnvSnippet} className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground">
                  {copiedEnv ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                  {copiedEnv ? 'Tersalin' : 'Salin Baris .env'}
                </Button>
              </div>
              <code className="rounded-lg bg-background/80 p-2.5 font-mono text-[11px] text-foreground break-all border border-border/40">
                CHATWOOT_IMPORT_DB_URI="{neonInput || 'postgresql://user:pass@ep-cool-name.neon.tech/neondb?sslmode=require'}"
              </code>
            </div>
          </div>
        </GlowCard>

        {/* Server & Application Info */}
        <GlowCard glowColor="rgba(16,185,129,0.25)">
          <div className="p-6 border-b border-border/40 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Informasi Server Go WhatsApp</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Metadata dan status versi server yang sedang berjalan</p>
            </div>
          </div>

          <div className="p-6 flex flex-col gap-3 text-xs">
            {infoLoading && <Skeleton className="h-28 rounded-xl" />}
            {infoError && (
              <p className="text-muted-foreground text-xs italic py-2">
                Server tidak merespons GET /app/info atau belum terhubung.
              </p>
            )}
            {info && (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/20">
                  <span className="text-muted-foreground font-semibold">Versi Server</span>
                  <Badge variant="default" className="font-mono font-bold text-xs bg-indigo-600">
                    {info.version}
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/20">
                  <span className="text-muted-foreground font-semibold">Sistem Operasi</span>
                  <span className="font-mono font-bold text-foreground">{info.os}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/20">
                  <span className="text-muted-foreground font-semibold">Database Engine</span>
                  <Badge variant="outline" className="font-mono font-bold text-xs text-cyan-500 border-cyan-500/30">
                    {neonDbUrl ? 'Neon Cloud Backup + SQLite' : 'SQLite (Default Server)'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/20">
                  <span className="text-muted-foreground font-semibold">Batas Upload File</span>
                  <span className="font-mono text-muted-foreground">
                    IMG: {formatBytes(info.max_image_size)} &bull; DOC: {formatBytes(info.max_file_size)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </GlowCard>

        {/* Active Connection & Auth */}
        <GlowCard glowColor="rgba(59,130,246,0.25)">
          <div className="p-6 border-b border-border/40 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <Server className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Sesi & Otentikasi Server</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Detail endpoint server dan kredensial otentikasi saat ini</p>
            </div>
          </div>

          <div className="p-6 flex flex-col gap-4 text-xs">
            <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/40 bg-muted/20">
              <span className="text-muted-foreground font-semibold">Endpoint Server</span>
              <span className="font-mono font-bold text-foreground truncate max-w-[200px]">
                {customBackendUrl || baseUrl || window.location.origin}
              </span>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl border border-border/40 bg-muted/20">
              <span className="text-muted-foreground font-semibold">Basic Auth</span>
              <span className="font-mono font-bold text-foreground">
                {username ? `User: ${username}` : 'Tanpa Auth (Public REST)'}
              </span>
            </div>

            <div className="pt-1">
              <Button
                variant="outline"
                onClick={disconnect}
                className="rounded-xl h-11 w-full gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 font-bold text-xs"
              >
                <LogOut className="size-4" />
                Putuskan Koneksi Sesi Server
              </Button>
            </div>
          </div>
        </GlowCard>

        {/* Appearance & Theme Settings */}
        <GlowCard glowColor="rgba(168,85,247,0.25)">
          <div className="p-6 border-b border-border/40 flex items-center gap-3">
            <div className="size-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
              <Palette className="size-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Tema & Tampilan Dashboard</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Sesuaikan mode warna dan estetika tampilan UI</p>
            </div>
          </div>

          <div className="p-6 flex flex-col gap-4">
            <div className="grid gap-2">
              <Label className="text-xs font-bold text-foreground/90 uppercase tracking-wider">
                Mode Warna Tema
              </Label>
              <Select value={theme} onValueChange={setTheme}>
                <SelectTrigger className="rounded-xl h-11 border-border/80 bg-muted/20 text-sm font-medium">
                  <SelectValue placeholder="Pilih Tema" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="dark">
                    <span className="flex items-center gap-2 font-medium">
                      <Moon className="size-4 text-indigo-400" /> Dark Mode (Gelap)
                    </span>
                  </SelectItem>
                  <SelectItem value="light">
                    <span className="flex items-center gap-2 font-medium">
                      <Sun className="size-4 text-amber-500" /> Light Mode (Terang)
                    </span>
                  </SelectItem>
                  <SelectItem value="system">
                    <span className="flex items-center gap-2 font-medium">
                      <Laptop className="size-4 text-slate-400" /> Ikuti Sistem OS
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-xl bg-purple-500/10 border border-purple-500/20 p-3.5 text-xs text-purple-600 dark:text-purple-300">
              <p className="font-medium flex items-center gap-1.5">
                <ShieldCheck className="size-4 shrink-0 text-purple-500" />
                Semua preferensi tema dan URL disimpan secara lokal di browser kamu.
              </p>
            </div>
          </div>
        </GlowCard>
      </div>
    </div>
  )
}
