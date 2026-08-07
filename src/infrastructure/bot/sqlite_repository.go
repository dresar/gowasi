package botrepo

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	domainBot "github.com/aldinokemal/go-whatsapp-web-multidevice/domains/bot"
	"github.com/aldinokemal/go-whatsapp-web-multidevice/pkg/sqlite"
	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"github.com/sirupsen/logrus"
)

type SQLiteRepository struct {
	db *sql.DB
}

func NewSQLite(dsn string) (*SQLiteRepository, error) {
	driver := sqlite.DriverName
	db, err := sql.Open(driver, dsn)
	if err != nil {
		return nil, fmt.Errorf("botrepo sqlite open: %w", err)
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	return &SQLiteRepository{db: db}, nil
}

func NewPostgres(dsn string) (*SQLiteRepository, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("botrepo postgres open: %w", err)
	}
	db.SetMaxOpenConns(5)
	return &SQLiteRepository{db: db}, nil
}

func (r *SQLiteRepository) Close() error { return r.db.Close() }

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
			enabled INTEGER NOT NULL DEFAULT 0,
			provider TEXT NOT NULL DEFAULT 'groq',
			api_key TEXT NOT NULL DEFAULT '',
			model TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile',
			custom_url TEXT NOT NULL DEFAULT '',
			ollama_url TEXT NOT NULL DEFAULT 'http://localhost:11434',
			system_prompt TEXT NOT NULL DEFAULT '',
			knowledge_base TEXT NOT NULL DEFAULT '',
			max_tokens INTEGER NOT NULL DEFAULT 500,
			temperature REAL NOT NULL DEFAULT 0.7,
			cooldown_ms INTEGER NOT NULL DEFAULT 30000,
			reply_to_groups INTEGER NOT NULL DEFAULT 0,
			reply_to_private INTEGER NOT NULL DEFAULT 1,
			trigger_keyword TEXT NOT NULL DEFAULT '',
			allowed_numbers TEXT NOT NULL DEFAULT '[]',
			blocked_numbers TEXT NOT NULL DEFAULT '[]',
			custom_number_prompts TEXT NOT NULL DEFAULT '{}',
			custom_skills TEXT NOT NULL DEFAULT '[]',
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

	// Seed default rules if empty
	r.seedDefaultRulesIfEmpty(ctx)

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
		{
			Name:         "Salam Halo / Hi",
			Enabled:      true,
			Priority:     1,
			TriggerType:  domainBot.TriggerContains,
			TriggerValue: "halo",
			ResponseText: "Halo! Selamat datang di Customer Service kami. Ada yang bisa kami bantu hari ini? 😊",
		},
		{
			Name:         "Assalamualaikum / Salam",
			Enabled:      true,
			Priority:     1,
			TriggerType:  domainBot.TriggerContains,
			TriggerValue: "assalam",
			ResponseText: "Waalaikumsalam kak! Selamat datang di layanan pelanggan kami. Ada yang bisa kami bantu?",
		},
		{
			Name:         "Panggilan P",
			Enabled:      true,
			Priority:     1,
			TriggerType:  domainBot.TriggerExact,
			TriggerValue: "p",
			ResponseText: "Iya kak, ada yang bisa kami bantu? Silakan tuliskan pertanyaanmu dengan lengkap ya. 🙏",
		},
	}

	for _, rule := range defaults {
		_, _ = r.CreateRule(ctx, rule)
	}
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
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?)`
	_, err := r.db.ExecContext(ctx, q,
		rule.ID, rule.DeviceID, boolToInt(rule.Enabled), rule.Priority,
		string(rule.TriggerType), rule.TriggerValue, boolToInt(rule.CaseSensitive),
		boolToInt(rule.OnlyPrivate), boolToInt(rule.OnlyGroups), string(allowedJSON), string(blockedJSON),
		rule.ResponseType, rule.ResponseText, string(addlJSON), rule.ResponseDelayMs,
		rule.CreatedAt, rule.UpdatedAt,
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
		rule.Name, boolToInt(rule.Enabled), rule.Priority,
		string(rule.TriggerType), rule.TriggerValue, boolToInt(rule.CaseSensitive),
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
	adminNum := os.Getenv("BOT_ADMIN_NUMBERS")
	var adminNums []string
	if adminNum != "" {
		adminNums = strings.Split(adminNum, ",")
	} else {
		adminNums = []string{}
	}

	return domainBot.AIConfig{
		DeviceID:            deviceID,
		Enabled:             true,
		Provider:            domainBot.AIProviderGroq,
		APIKey:              os.Getenv("GROQ_API_KEY"),
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
		AdminNumbers:        adminNums,
		TelegramBotToken:    os.Getenv("TELEGRAM_BOT_TOKEN"),
		TelegramAdminChatID: os.Getenv("TELEGRAM_ADMIN_CHAT_ID"),
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
