package botrepo

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/aldinokemal/go-whatsapp-web-multidevice/config"
	domainBot "github.com/aldinokemal/go-whatsapp-web-multidevice/domains/bot"
	"github.com/aldinokemal/go-whatsapp-web-multidevice/pkg/sqlite"
	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"github.com/sirupsen/logrus"
)

type SQLiteRepository struct {
	db *sql.DB
}

func NewSQLite(dbPath string) (domainBot.IBotRepository, error) {
	db, err := sql.Open(sqlite.DriverName, dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite bot db (%s): %w", dbPath, err)
	}
	db.SetMaxOpenConns(1)
	return &SQLiteRepository{db: db}, nil
}


func (r *SQLiteRepository) EnsureSchema(ctx context.Context) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS bot_auto_reply_rules (
			id TEXT PRIMARY KEY,
			device_id TEXT NOT NULL DEFAULT '',
			name TEXT NOT NULL,
			enabled INTEGER NOT NULL DEFAULT 1,
			priority INTEGER NOT NULL DEFAULT 0,
			trigger_type TEXT NOT NULL DEFAULT 'contains',
			trigger_value TEXT NOT NULL,
			case_sensitive INTEGER NOT NULL DEFAULT 0,
			only_private INTEGER NOT NULL DEFAULT 0,
			only_groups INTEGER NOT NULL DEFAULT 0,
			allowed_numbers TEXT NOT NULL DEFAULT '[]',
			blocked_numbers TEXT NOT NULL DEFAULT '[]',
			response_type TEXT NOT NULL DEFAULT 'text',
			response_text TEXT NOT NULL DEFAULT '',
			additional_texts TEXT NOT NULL DEFAULT '[]',
			response_delay_ms INTEGER NOT NULL DEFAULT 800,
			triggered_count INTEGER NOT NULL DEFAULT 0,
			last_triggered DATETIME,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS bot_ai_config (
			id TEXT PRIMARY KEY,
			device_id TEXT NOT NULL UNIQUE,
			enabled INTEGER NOT NULL DEFAULT 1,
			provider TEXT NOT NULL DEFAULT 'groq',
			api_key TEXT NOT NULL DEFAULT '',
			model TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile',
			custom_url TEXT NOT NULL DEFAULT '',
			ollama_url TEXT NOT NULL DEFAULT 'http://localhost:11434',
			system_prompt TEXT NOT NULL DEFAULT '',
			knowledge_base TEXT NOT NULL DEFAULT '',
			max_tokens INTEGER NOT NULL DEFAULT 500,
			temperature REAL NOT NULL DEFAULT 0.7,
			cooldown_ms INTEGER NOT NULL DEFAULT 3000,
			reply_to_groups INTEGER NOT NULL DEFAULT 0,
			reply_to_private INTEGER NOT NULL DEFAULT 1,
			trigger_keyword TEXT NOT NULL DEFAULT '',
			allowed_numbers TEXT NOT NULL DEFAULT '[]',
			blocked_numbers TEXT NOT NULL DEFAULT '[]',
			custom_number_prompts TEXT NOT NULL DEFAULT '{}',
			custom_skills TEXT NOT NULL DEFAULT '[]',
			admin_numbers TEXT NOT NULL DEFAULT '["6282392115909"]',
			telegram_bot_token TEXT NOT NULL DEFAULT '',
			telegram_admin_chat_id TEXT NOT NULL DEFAULT '',
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS bot_activity_logs (
			id TEXT PRIMARY KEY,
			device_id TEXT NOT NULL DEFAULT '',
			timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			type TEXT NOT NULL,
			phone TEXT NOT NULL,
			message TEXT NOT NULL,
			status TEXT NOT NULL,
			rule_id TEXT NOT NULL DEFAULT '',
			error TEXT NOT NULL DEFAULT ''
		);`,
		`CREATE TABLE IF NOT EXISTS bot_scheduled_messages (
			id TEXT PRIMARY KEY,
			device_id TEXT NOT NULL DEFAULT '',
			phone TEXT NOT NULL,
			message TEXT NOT NULL,
			send_at DATETIME NOT NULL,
			status TEXT NOT NULL DEFAULT 'pending',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);`,
	}

	for _, stmt := range stmts {
		if _, err := r.db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("EnsureSchema sqlite: %w", err)
		}
	}

	// Safe alter columns if upgraded from older schema
	_, _ = r.db.ExecContext(ctx, `ALTER TABLE bot_ai_config ADD COLUMN custom_number_prompts TEXT NOT NULL DEFAULT '{}'`)
	_, _ = r.db.ExecContext(ctx, `ALTER TABLE bot_ai_config ADD COLUMN custom_skills TEXT NOT NULL DEFAULT '[]'`)
	_, _ = r.db.ExecContext(ctx, `ALTER TABLE bot_ai_config ADD COLUMN admin_numbers TEXT NOT NULL DEFAULT '["6282392115909"]'`)
	_, _ = r.db.ExecContext(ctx, `ALTER TABLE bot_ai_config ADD COLUMN telegram_bot_token TEXT NOT NULL DEFAULT ''`)
	_, _ = r.db.ExecContext(ctx, `ALTER TABLE bot_ai_config ADD COLUMN telegram_admin_chat_id TEXT NOT NULL DEFAULT ''`)

	// Seed default rules & config if empty
	r.seedDefaultRulesIfEmpty(ctx)
	r.seedDefaultAIConfigIfEmpty(ctx)

	logrus.Info("[BOT_REPO] Storage schema ensured & seed check completed")
	return nil
}

func (r *SQLiteRepository) seedDefaultRulesIfEmpty(ctx context.Context) {
	var count int
	_ = r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM bot_auto_reply_rules`).Scan(&count)
	if count > 0 {
		return
	}

	defaults := []domainBot.AutoReplyRule{
		// ─── Sapaan ───
		{Name: "Salam - Halo/Hi", Enabled: true, Priority: 1, TriggerType: domainBot.TriggerContains, TriggerValue: "halo", ResponseText: "Halo kak! Selamat datang di layanan kami 😊 Ada yang bisa kami bantu?"},
		{Name: "Salam - Assalamualaikum", Enabled: true, Priority: 1, TriggerType: domainBot.TriggerContains, TriggerValue: "assalam", ResponseText: "Waalaikumsalam kak! Selamat datang 🙏 Ada yang bisa kami bantu hari ini?"},
		{Name: "Salam - Selamat Pagi", Enabled: true, Priority: 1, TriggerType: domainBot.TriggerContains, TriggerValue: "selamat pagi", ResponseText: "Selamat pagi kak! 🌅 Semoga hari Anda menyenangkan. Ada yang bisa kami bantu?"},
		{Name: "Salam - Selamat Siang", Enabled: true, Priority: 1, TriggerType: domainBot.TriggerContains, TriggerValue: "selamat siang", ResponseText: "Selamat siang kak! ☀️ Ada yang bisa kami bantu?"},
		{Name: "Salam - Selamat Malam", Enabled: true, Priority: 1, TriggerType: domainBot.TriggerContains, TriggerValue: "selamat malam", ResponseText: "Selamat malam kak! 🌙 Ada yang bisa kami bantu malam ini?"},
		{Name: "Panggilan P", Enabled: true, Priority: 1, TriggerType: domainBot.TriggerExact, TriggerValue: "p", ResponseText: "Iya kak, ada yang bisa kami bantu? 😊 Silakan tuliskan pertanyaan Anda."},
		{Name: "Panggilan Permisi", Enabled: true, Priority: 1, TriggerType: domainBot.TriggerContains, TriggerValue: "permisi", ResponseText: "Iya kak, kami di sini 😊 Silakan sampaikan keperluannya."},
		// ─── Harga & Produk ───
		{Name: "Tanya Harga", Enabled: true, Priority: 2, TriggerType: domainBot.TriggerContains, TriggerValue: "harga", ResponseText: "Untuk info harga terbaru dan promo spesial, silakan lihat katalog kami kak 📋 Atau sebutkan produk yang diminati, kami bantu cek harganya!"},
		{Name: "Tanya Harga - Berapa", Enabled: true, Priority: 2, TriggerType: domainBot.TriggerContains, TriggerValue: "berapa harga", ResponseText: "Harga produk kami bervariasi kak. Sebutkan produk yang diinginkan ya, kami segera infokan harganya 😊"},
		{Name: "Tanya Produk", Enabled: true, Priority: 2, TriggerType: domainBot.TriggerContains, TriggerValue: "produk", ResponseText: "Kami memiliki berbagai produk pilihan kak 🛍️ Silakan sebutkan kebutuhan Anda dan kami akan rekomendasikan yang terbaik!"},
		{Name: "Tanya Stok", Enabled: true, Priority: 2, TriggerType: domainBot.TriggerContains, TriggerValue: "stok", ResponseText: "Untuk cek ketersediaan stok, silakan sebutkan nama produknya kak 📦 Kami segera cek untuk Anda!"},
		{Name: "Tanya Katalog", Enabled: true, Priority: 2, TriggerType: domainBot.TriggerContains, TriggerValue: "katalog", ResponseText: "Berikut katalog produk terbaru kami kak 📋 [Link katalog akan segera dikirim]. Silakan pilih yang sesuai!"},
		// ─── Pemesanan ───
		{Name: "Cara Order", Enabled: true, Priority: 3, TriggerType: domainBot.TriggerContains, TriggerValue: "cara order", ResponseText: "Cara pemesanan sangat mudah kak! 🛒\n1. Pilih produk\n2. Konfirmasi ke kami\n3. Lakukan pembayaran\n4. Pesanan diproses & dikirim\nAda yang ingin dipesan sekarang?"},
		{Name: "Cara Pesan", Enabled: true, Priority: 3, TriggerType: domainBot.TriggerContains, TriggerValue: "cara pesan", ResponseText: "Cara pesan mudah kak 😊 Cukup kirimkan nama produk & alamat pengiriman ke kami, lalu kami akan proses pesanan Anda!"},
		{Name: "Mau Order", Enabled: true, Priority: 3, TriggerType: domainBot.TriggerContains, TriggerValue: "mau order", ResponseText: "Siap kak! 🛒 Silakan sebutkan produk yang ingin dipesan beserta jumlahnya ya."},
		{Name: "Mau Beli", Enabled: true, Priority: 3, TriggerType: domainBot.TriggerContains, TriggerValue: "mau beli", ResponseText: "Tentu kak, kami siap membantu! 🎉 Produk apa yang ingin dibeli?"},
		// ─── Pengiriman ───
		{Name: "Tanya Ongkir", Enabled: true, Priority: 4, TriggerType: domainBot.TriggerContains, TriggerValue: "ongkir", ResponseText: "Ongkos kirim tergantung lokasi tujuan kak 🚚 Untuk cek ongkir, sebutkan kota tujuan Anda ya!"},
		{Name: "Tanya Pengiriman", Enabled: true, Priority: 4, TriggerType: domainBot.TriggerContains, TriggerValue: "pengiriman", ResponseText: "Kami melayani pengiriman ke seluruh Indonesia kak 🇮🇩 Estimasi 1-3 hari kerja tergantung lokasi."},
		{Name: "Kapan Sampai", Enabled: true, Priority: 4, TriggerType: domainBot.TriggerContains, TriggerValue: "kapan sampai", ResponseText: "Estimasi pengiriman 1-3 hari kerja kak ⏱️ Untuk tracking, kami akan kirimkan nomor resi setelah paket dikirim ya!"},
		{Name: "Gratis Ongkir", Enabled: true, Priority: 4, TriggerType: domainBot.TriggerContains, TriggerValue: "gratis ongkir", ResponseText: "Ada promo gratis ongkir untuk pembelian minimum tertentu kak! 🎁 Tanyakan admin kami untuk info promo terbaru."},
		// ─── Pembayaran ───
		{Name: "Cara Bayar", Enabled: true, Priority: 5, TriggerType: domainBot.TriggerContains, TriggerValue: "cara bayar", ResponseText: "Kami menerima berbagai metode pembayaran kak 💳\n- Transfer Bank (BCA/BNI/Mandiri)\n- GoPay / OVO / DANA / ShopeePay\n- COD (area tertentu)\nPilih yang paling mudah ya!"},
		{Name: "Tanya Rekening", Enabled: true, Priority: 5, TriggerType: domainBot.TriggerContains, TriggerValue: "rekening", ResponseText: "Untuk info rekening tujuan transfer, admin kami akan segera menginformasikan ya kak 🏦"},
		{Name: "Sudah Transfer", Enabled: true, Priority: 5, TriggerType: domainBot.TriggerContains, TriggerValue: "sudah transfer", ResponseText: "Terima kasih kak! 🙏 Mohon kirimkan bukti transfer ke admin kami untuk segera kami proses ya."},
		// ─── Promo & Diskon ───
		{Name: "Tanya Promo", Enabled: true, Priority: 6, TriggerType: domainBot.TriggerContains, TriggerValue: "promo", ResponseText: "Kami punya berbagai promo menarik kak! 🎉 Tanya admin kami untuk info promo terbaru yang sedang berlangsung ya."},
		{Name: "Tanya Diskon", Enabled: true, Priority: 6, TriggerType: domainBot.TriggerContains, TriggerValue: "diskon", ResponseText: "Ada diskon spesial untuk pelanggan setia kami kak! 💝 Hubungi admin untuk mendapatkan penawaran terbaik."},
		// ─── Komplain & Layanan ───
		{Name: "Komplain Produk", Enabled: true, Priority: 7, TriggerType: domainBot.TriggerContains, TriggerValue: "komplain", ResponseText: "Kami mohon maaf atas ketidaknyamanannya kak 🙏 Tim kami akan segera menangani permasalahan Anda. Mohon ceritakan masalahnya ya."},
		{Name: "Produk Rusak", Enabled: true, Priority: 7, TriggerType: domainBot.TriggerContains, TriggerValue: "rusak", ResponseText: "Kami sangat minta maaf kak 😔 Produk rusak dapat diklaim dengan mengirimkan foto bukti ke kami. Tim kami akan segera membantu!"},
		{Name: "Tanya Garansi", Enabled: true, Priority: 7, TriggerType: domainBot.TriggerContains, TriggerValue: "garansi", ResponseText: "Produk kami bergaransi kak! 🛡️ Untuk info detail garansi, admin kami akan menjelaskan sesuai produk yang dibeli."},
		// ─── Umum ───
		{Name: "Terima Kasih", Enabled: true, Priority: 8, TriggerType: domainBot.TriggerContains, TriggerValue: "terima kasih", ResponseText: "Sama-sama kak! 😊 Kami senang bisa membantu. Jangan ragu hubungi kami kapan saja ya!"},
		{Name: "Lokasi / Alamat", Enabled: true, Priority: 8, TriggerType: domainBot.TriggerContains, TriggerValue: "lokasi", ResponseText: "Untuk alamat toko/kantor kami, silakan tanya admin ya kak 📍 Kami juga melayani pembelian online ke seluruh Indonesia!"},
		{Name: "Jam Operasional", Enabled: true, Priority: 8, TriggerType: domainBot.TriggerContains, TriggerValue: "jam buka", ResponseText: "Jam operasional kami Senin-Sabtu pukul 08.00-17.00 WIB kak ⏰ Di luar jam tersebut, pesan Anda akan kami balas segera setelah jam kerja."},
		{Name: "Minta Nomor Admin", Enabled: true, Priority: 8, TriggerType: domainBot.TriggerContains, TriggerValue: "hubungi admin", ResponseText: "Admin kami siap membantu kak 📞 Anda bisa langsung chat di sini atau menghubungi nomor yang tertera ya!"},
	}

	for _, rule := range defaults {
		rule.ResponseType = "text"
		_, _ = r.CreateRule(ctx, rule)
	}
}


func (r *SQLiteRepository) seedDefaultAIConfigIfEmpty(ctx context.Context) {
	var count int
	_ = r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM bot_ai_config`).Scan(&count)
	if count > 0 {
		return
	}
	def := defaultAIConfig("")
	_, _ = r.UpsertAIConfig(ctx, def)
}

func (r *SQLiteRepository) ListRules(ctx context.Context, deviceID string) ([]domainBot.AutoReplyRule, error) {
	q := `SELECT id, device_id, name, enabled, priority, trigger_type, trigger_value, case_sensitive,
		only_private, only_groups, allowed_numbers, blocked_numbers,
		response_type, response_text, additional_texts, response_delay_ms,
		triggered_count, last_triggered, created_at, updated_at
		FROM bot_auto_reply_rules WHERE device_id = ? OR device_id = ''
		ORDER BY priority ASC, created_at ASC`
	rows, err := r.db.QueryContext(ctx, q, deviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rules []domainBot.AutoReplyRule
	for rows.Next() {
		rule, err := scanSQLiteRule(rows)
		if err != nil {
			return nil, err
		}
		rules = append(rules, rule)
	}
	return rules, rows.Err()
}

func (r *SQLiteRepository) GetRule(ctx context.Context, id string) (*domainBot.AutoReplyRule, error) {
	q := `SELECT id, device_id, name, enabled, priority, trigger_type, trigger_value, case_sensitive,
		only_private, only_groups, allowed_numbers, blocked_numbers,
		response_type, response_text, additional_texts, response_delay_ms,
		triggered_count, last_triggered, created_at, updated_at
		FROM bot_auto_reply_rules WHERE id = ?`
	row := r.db.QueryRowContext(ctx, q, id)
	rule, err := scanSQLiteRule(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &rule, err
}

func (r *SQLiteRepository) CreateRule(ctx context.Context, rule domainBot.AutoReplyRule) (domainBot.AutoReplyRule, error) {
	rule.ID = uuid.New().String()
	rule.CreatedAt = time.Now().UTC()
	rule.UpdatedAt = rule.CreatedAt

	allowedJSON, _ := json.Marshal(rule.AllowedNumbers)
	blockedJSON, _ := json.Marshal(rule.BlockedNumbers)
	addlJSON, _ := json.Marshal(rule.AdditionalTexts)

	q := `INSERT INTO bot_auto_reply_rules
		(id, device_id, name, enabled, priority, trigger_type, trigger_value, case_sensitive,
		only_private, only_groups, allowed_numbers, blocked_numbers,
		response_type, response_text, additional_texts, response_delay_ms,
		triggered_count, created_at, updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
	_, err := r.db.ExecContext(ctx, q,
		rule.ID, rule.DeviceID, rule.Name, boolToInt(rule.Enabled), rule.Priority,
		string(rule.TriggerType), rule.TriggerValue, boolToInt(rule.CaseSensitive),
		boolToInt(rule.OnlyPrivate), boolToInt(rule.OnlyGroups), string(allowedJSON), string(blockedJSON),
		rule.ResponseType, rule.ResponseText, string(addlJSON), rule.ResponseDelayMs,
		rule.TriggeredCount, rule.CreatedAt, rule.UpdatedAt,
	)
	return rule, err
}

func (r *SQLiteRepository) UpdateRule(ctx context.Context, rule domainBot.AutoReplyRule) (domainBot.AutoReplyRule, error) {
	rule.UpdatedAt = time.Now().UTC()

	allowedJSON, _ := json.Marshal(rule.AllowedNumbers)
	blockedJSON, _ := json.Marshal(rule.BlockedNumbers)
	addlJSON, _ := json.Marshal(rule.AdditionalTexts)

	q := `UPDATE bot_auto_reply_rules SET
		name=?, enabled=?, priority=?, trigger_type=?, trigger_value=?, case_sensitive=?,
		only_private=?, only_groups=?, allowed_numbers=?, blocked_numbers=?,
		response_type=?, response_text=?, additional_texts=?, response_delay_ms=?,
		updated_at=?
		WHERE id=?`
	_, err := r.db.ExecContext(ctx, q,
		rule.Name, boolToInt(rule.Enabled), rule.Priority, string(rule.TriggerType), rule.TriggerValue, boolToInt(rule.CaseSensitive),
		boolToInt(rule.OnlyPrivate), boolToInt(rule.OnlyGroups), string(allowedJSON), string(blockedJSON),
		rule.ResponseType, rule.ResponseText, string(addlJSON), rule.ResponseDelayMs,
		rule.UpdatedAt, rule.ID,
	)
	return rule, err
}

func (r *SQLiteRepository) DeleteRule(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM bot_auto_reply_rules WHERE id=?`, id)
	return err
}

func (r *SQLiteRepository) IncrementRuleStat(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE bot_auto_reply_rules SET triggered_count = triggered_count + 1, last_triggered = ? WHERE id = ?`,
		time.Now().UTC(), id)
	return err
}

func (r *SQLiteRepository) GetAIConfig(ctx context.Context, deviceID string) (*domainBot.AIConfig, error) {
	q := `SELECT id, device_id, enabled, provider, api_key, model, custom_url, ollama_url,
		system_prompt, knowledge_base, max_tokens, temperature, cooldown_ms,
		reply_to_groups, reply_to_private, trigger_keyword,
		allowed_numbers, blocked_numbers, custom_number_prompts, custom_skills, admin_numbers,
		telegram_bot_token, telegram_admin_chat_id, updated_at
		FROM bot_ai_config
		ORDER BY updated_at DESC LIMIT 1`
	row := r.db.QueryRowContext(ctx, q)
	cfg, err := scanSQLiteAIConfig(row)
	if err != nil {
		logrus.Errorf("[BOT_REPO] GetAIConfig (%s) scan error: %v", deviceID, err)
		defaults := defaultAIConfig(deviceID)
		return &defaults, nil
	}
	return &cfg, nil
}

func (r *SQLiteRepository) UpsertAIConfig(ctx context.Context, cfg domainBot.AIConfig) (domainBot.AIConfig, error) {
	if cfg.ID == "" {
		cfg.ID = uuid.New().String()
	}
	cfg.UpdatedAt = time.Now().UTC()

	allowedJSON, _ := json.Marshal(cfg.AllowedNumbers)
	blockedJSON, _ := json.Marshal(cfg.BlockedNumbers)
	if cfg.CustomNumberPrompts == nil {
		cfg.CustomNumberPrompts = make(map[string]string)
	}
	if cfg.CustomSkills == nil {
		cfg.CustomSkills = []string{}
	}
	if cfg.AdminNumbers == nil || len(cfg.AdminNumbers) == 0 {
		cfg.AdminNumbers = []string{"6282392115909"}
	}
	customPromptsJSON, _ := json.Marshal(cfg.CustomNumberPrompts)
	customSkillsJSON, _ := json.Marshal(cfg.CustomSkills)
	adminNumbersJSON, _ := json.Marshal(cfg.AdminNumbers)

	q := `INSERT INTO bot_ai_config
		(id, device_id, enabled, provider, api_key, model, custom_url, ollama_url,
		system_prompt, knowledge_base, max_tokens, temperature, cooldown_ms,
		reply_to_groups, reply_to_private, trigger_keyword, allowed_numbers, blocked_numbers,
		custom_number_prompts, custom_skills, admin_numbers, telegram_bot_token, telegram_admin_chat_id, updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT (device_id) DO UPDATE SET
		enabled=excluded.enabled, provider=excluded.provider, api_key=excluded.api_key, model=excluded.model,
		custom_url=excluded.custom_url, ollama_url=excluded.ollama_url, system_prompt=excluded.system_prompt,
		knowledge_base=excluded.knowledge_base, max_tokens=excluded.max_tokens, temperature=excluded.temperature,
		cooldown_ms=excluded.cooldown_ms, reply_to_groups=excluded.reply_to_groups,
		reply_to_private=excluded.reply_to_private, trigger_keyword=excluded.trigger_keyword,
		allowed_numbers=excluded.allowed_numbers, blocked_numbers=excluded.blocked_numbers,
		custom_number_prompts=excluded.custom_number_prompts, custom_skills=excluded.custom_skills,
		admin_numbers=excluded.admin_numbers, telegram_bot_token=excluded.telegram_bot_token,
		telegram_admin_chat_id=excluded.telegram_admin_chat_id, updated_at=excluded.updated_at`
	_, err := r.db.ExecContext(ctx, q,
		cfg.ID, cfg.DeviceID, boolToInt(cfg.Enabled), string(cfg.Provider),
		cfg.APIKey, cfg.Model, cfg.CustomURL, cfg.OllamaURL,
		cfg.SystemPrompt, cfg.KnowledgeBase, cfg.MaxTokens, cfg.Temperature, cfg.CooldownMs,
		boolToInt(cfg.ReplyToGroups), boolToInt(cfg.ReplyToPrivate), cfg.TriggerKeyword,
		string(allowedJSON), string(blockedJSON), string(customPromptsJSON), string(customSkillsJSON), string(adminNumbersJSON),
		cfg.TelegramBotToken, cfg.TelegramAdminChatID, cfg.UpdatedAt,
	)
	return cfg, err
}

// SetCustomPrompt atomically sets a single phone→prompt entry in the
// custom_number_prompts JSON column without touching other config fields.
// This prevents race conditions where a concurrent UpsertAIConfig call
// (with a stale cfg snapshot) would overwrite the whole map with {}.
func (r *SQLiteRepository) SetCustomPrompt(ctx context.Context, phone, prompt string) error {
	// Read current map, merge, write back only that column
	row := r.db.QueryRowContext(ctx, `SELECT custom_number_prompts FROM bot_ai_config ORDER BY updated_at DESC LIMIT 1`)
	var rawJSON string
	_ = row.Scan(&rawJSON)

	m := make(map[string]string)
	_ = json.Unmarshal([]byte(rawJSON), &m)
	m[phone] = prompt

	newJSON, _ := json.Marshal(m)
	_, err := r.db.ExecContext(ctx,
		`UPDATE bot_ai_config SET custom_number_prompts=?, updated_at=? WHERE id=(SELECT id FROM bot_ai_config ORDER BY updated_at DESC LIMIT 1)`,
		string(newJSON), time.Now().UTC(),
	)
	logrus.Infof("[BOT_REPO] SetCustomPrompt for %s: stored %d prompts", phone, len(m))
	return err
}

// DeleteCustomPrompt atomically removes a phone entry from custom_number_prompts.
func (r *SQLiteRepository) DeleteCustomPrompt(ctx context.Context, phone string) error {
	row := r.db.QueryRowContext(ctx, `SELECT custom_number_prompts FROM bot_ai_config ORDER BY updated_at DESC LIMIT 1`)
	var rawJSON string
	_ = row.Scan(&rawJSON)

	m := make(map[string]string)
	_ = json.Unmarshal([]byte(rawJSON), &m)
	delete(m, phone)

	newJSON, _ := json.Marshal(m)
	_, err := r.db.ExecContext(ctx,
		`UPDATE bot_ai_config SET custom_number_prompts=?, updated_at=? WHERE id=(SELECT id FROM bot_ai_config ORDER BY updated_at DESC LIMIT 1)`,
		string(newJSON), time.Now().UTC(),
	)
	logrus.Infof("[BOT_REPO] DeleteCustomPrompt for %s", phone)
	return err
}



func (r *SQLiteRepository) AddLog(ctx context.Context, log domainBot.ActivityLog) error {
	log.ID = uuid.New().String()
	log.Timestamp = time.Now().UTC()
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO bot_activity_logs (id, device_id, timestamp, type, phone, message, status, rule_id, error)
		VALUES (?,?,?,?,?,?,?,?,?)`,
		log.ID, log.DeviceID, log.Timestamp, log.Type, log.Phone, log.Message, log.Status, log.RuleID, log.Error,
	)
	return err
}

func (r *SQLiteRepository) ListLogs(ctx context.Context, deviceID string, limit int) ([]domainBot.ActivityLog, error) {
	if limit <= 0 {
		limit = 100
	}
	q := `SELECT id, device_id, timestamp, type, phone, message, status, rule_id, error
		FROM bot_activity_logs WHERE device_id = ? OR device_id = ''
		ORDER BY timestamp DESC LIMIT ?`
	rows, err := r.db.QueryContext(ctx, q, deviceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var logs []domainBot.ActivityLog
	for rows.Next() {
		var l domainBot.ActivityLog
		if err := rows.Scan(&l.ID, &l.DeviceID, &l.Timestamp, &l.Type, &l.Phone, &l.Message, &l.Status, &l.RuleID, &l.Error); err != nil {
			return nil, err
		}
		logs = append(logs, l)
	}
	return logs, rows.Err()
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

type scanner interface {
	Scan(dest ...any) error
}

func scanSQLiteRule(s scanner) (domainBot.AutoReplyRule, error) {
	var r domainBot.AutoReplyRule
	var enabled, caseSensitive, onlyPrivate, onlyGroups int
	var allowedJSON, blockedJSON, addlJSON string
	var triggerType string
	err := s.Scan(
		&r.ID, &r.DeviceID, &r.Name, &enabled, &r.Priority,
		&triggerType, &r.TriggerValue, &caseSensitive,
		&onlyPrivate, &onlyGroups, &allowedJSON, &blockedJSON,
		&r.ResponseType, &r.ResponseText, &addlJSON, &r.ResponseDelayMs,
		&r.TriggeredCount, &r.LastTriggered, &r.CreatedAt, &r.UpdatedAt,
	)
	if err != nil {
		return r, err
	}
	r.Enabled = enabled == 1
	r.CaseSensitive = caseSensitive == 1
	r.OnlyPrivate = onlyPrivate == 1
	r.OnlyGroups = onlyGroups == 1
	r.TriggerType = domainBot.TriggerType(triggerType)
	_ = json.Unmarshal([]byte(allowedJSON), &r.AllowedNumbers)
	_ = json.Unmarshal([]byte(blockedJSON), &r.BlockedNumbers)
	_ = json.Unmarshal([]byte(addlJSON), &r.AdditionalTexts)
	if r.AllowedNumbers == nil {
		r.AllowedNumbers = []string{}
	}
	if r.BlockedNumbers == nil {
		r.BlockedNumbers = []string{}
	}
	if r.AdditionalTexts == nil {
		r.AdditionalTexts = []string{}
	}
	return r, nil
}

func scanSQLiteAIConfig(s scanner) (domainBot.AIConfig, error) {
	var cfg domainBot.AIConfig
	var enabled, replyToGroups, replyToPrivate int
	var provider, allowedJSON, blockedJSON, customPromptsJSON, customSkillsJSON, adminNumbersJSON string
	err := s.Scan(
		&cfg.ID, &cfg.DeviceID, &enabled, &provider,
		&cfg.APIKey, &cfg.Model, &cfg.CustomURL, &cfg.OllamaURL,
		&cfg.SystemPrompt, &cfg.KnowledgeBase, &cfg.MaxTokens, &cfg.Temperature, &cfg.CooldownMs,
		&replyToGroups, &replyToPrivate, &cfg.TriggerKeyword,
		&allowedJSON, &blockedJSON, &customPromptsJSON, &customSkillsJSON, &adminNumbersJSON,
		&cfg.TelegramBotToken, &cfg.TelegramAdminChatID, &cfg.UpdatedAt,
	)
	if err != nil {
		return cfg, err
	}
	cfg.Enabled = enabled == 1
	cfg.ReplyToGroups = replyToGroups == 1
	cfg.ReplyToPrivate = replyToPrivate == 1
	cfg.Provider = domainBot.AIProvider(provider)
	_ = json.Unmarshal([]byte(allowedJSON), &cfg.AllowedNumbers)
	_ = json.Unmarshal([]byte(blockedJSON), &cfg.BlockedNumbers)
	_ = json.Unmarshal([]byte(customPromptsJSON), &cfg.CustomNumberPrompts)
	_ = json.Unmarshal([]byte(customSkillsJSON), &cfg.CustomSkills)
	_ = json.Unmarshal([]byte(adminNumbersJSON), &cfg.AdminNumbers)

	if cfg.AllowedNumbers == nil {
		cfg.AllowedNumbers = []string{}
	}
	if cfg.BlockedNumbers == nil {
		cfg.BlockedNumbers = []string{}
	}
	if cfg.CustomNumberPrompts == nil {
		cfg.CustomNumberPrompts = make(map[string]string)
	}
	if cfg.CustomSkills == nil {
		cfg.CustomSkills = []string{}
	}
	if cfg.AdminNumbers == nil {
		cfg.AdminNumbers = []string{}
	}
	return cfg, nil
}

func defaultAIConfig(deviceID string) domainBot.AIConfig {
	tgToken := config.TelegramBotToken
	if tgToken == "" {
		tgToken = os.Getenv("TELEGRAM_BOT_TOKEN")
	}
	if tgToken == "" {
		tgToken = "7969028715:AAENtmQ3tpwlY0QrJpdRlRLIEaB2_UMmFzo"
	}

	adminChatID := config.TelegramAdminChatID
	if adminChatID == "" {
		adminChatID = os.Getenv("TELEGRAM_ADMIN_CHAT_ID")
	}
	if adminChatID == "" {
		adminChatID = "7896674035"
	}

	groqKey := config.GroqAPIKey
	if groqKey == "" {
		groqKey = os.Getenv("GROQ_API_KEY")
	}

	return domainBot.AIConfig{
		DeviceID:            deviceID,
		Enabled:             true,
		Provider:            domainBot.AIProviderGroq,
		APIKey:              groqKey,
		Model:               "llama-3.3-70b-versatile",
		OllamaURL:           "http://localhost:11434",
		SystemPrompt:        "Kamu adalah asisten WhatsApp resmi yang ramah, profesional, dan solutif. Jawab pertanyaan pengguna secara akurat, singkat, dan mudah dipahami dalam Bahasa Indonesia.",
		MaxTokens:           500,
		Temperature:         0.7,
		CooldownMs:          3000,
		ReplyToPrivate:      true,
		ReplyToGroups:       false,
		AllowedNumbers:      []string{},
		BlockedNumbers:      []string{},
		CustomNumberPrompts: make(map[string]string),
		CustomSkills:        []string{"non_formal_tone", "deep_context_memory", "auto_schedule"},
		AdminNumbers:        []string{"6282392115909"},
		TelegramBotToken:    tgToken,
		TelegramAdminChatID: adminChatID,
	}
}

func stripJID(jid string) string {
	if idx := strings.Index(jid, "@"); idx != -1 {
		return jid[:idx]
	}
	return jid
}

func (r *SQLiteRepository) CreateScheduledMessage(ctx context.Context, msg domainBot.ScheduledMessage) (domainBot.ScheduledMessage, error) {
	if msg.ID == "" {
		msg.ID = uuid.New().String()
	}
	msg.CreatedAt = time.Now().UTC()
	if msg.Status == "" {
		msg.Status = "pending"
	}
	q := `INSERT INTO bot_scheduled_messages (id, device_id, phone, message, send_at, status, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)`
	_, err := r.db.ExecContext(ctx, q, msg.ID, msg.DeviceID, msg.Phone, msg.Message, msg.SendAt, msg.Status, msg.CreatedAt)
	return msg, err
}

func (r *SQLiteRepository) ListScheduledMessages(ctx context.Context, deviceID string) ([]domainBot.ScheduledMessage, error) {
	q := `SELECT id, device_id, phone, message, send_at, status, created_at
		FROM bot_scheduled_messages
		ORDER BY send_at ASC`
	rows, err := r.db.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []domainBot.ScheduledMessage
	for rows.Next() {
		var m domainBot.ScheduledMessage
		if err := rows.Scan(&m.ID, &m.DeviceID, &m.Phone, &m.Message, &m.SendAt, &m.Status, &m.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, m)
	}
	return list, nil
}

func (r *SQLiteRepository) DeleteScheduledMessage(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM bot_scheduled_messages WHERE id = ?`, id)
	return err
}

func (r *SQLiteRepository) MarkScheduledMessageSent(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE bot_scheduled_messages SET status = 'sent' WHERE id = ?`, id)
	return err
}
