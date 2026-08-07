package botrepo

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	domainBot "github.com/aldinokemal/go-whatsapp-web-multidevice/domains/bot"
	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"github.com/sirupsen/logrus"
)

type PostgresRepository struct {
	db *sql.DB
}

func NewPostgres(dsn string) (domainBot.IBotRepository, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open postgres bot db: %w", err)
	}
	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(10 * time.Minute)
	return &PostgresRepository{db: db}, nil
}

func (r *PostgresRepository) EnsureSchema(ctx context.Context) error {
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
			last_triggered TIMESTAMP,
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
			temperature DOUBLE PRECISION NOT NULL DEFAULT 0.7,
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
			updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS bot_activity_logs (
			id TEXT PRIMARY KEY,
			device_id TEXT NOT NULL DEFAULT '',
			timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
			send_at TIMESTAMP NOT NULL,
			status TEXT NOT NULL DEFAULT 'pending',
			created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
		);`,
	}

	for _, stmt := range stmts {
		if _, err := r.db.ExecContext(ctx, stmt); err != nil {
			return fmt.Errorf("EnsureSchema postgres: %w", err)
		}
	}

	r.seedDefaultRulesIfEmpty(ctx)
	r.seedDefaultAIConfigIfEmpty(ctx)

	logrus.Info("[BOT_REPO] Neon Postgres Storage schema ensured & seed check completed")
	return nil
}

func (r *PostgresRepository) seedDefaultRulesIfEmpty(ctx context.Context) {
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
			ResponseText: "Halo kak! Ada yang bisa kami bantu hari ini? 😊",
		},
		{
			Name:         "Harga / Price / Biaya",
			Enabled:      true,
			Priority:     1,
			TriggerType:  domainBot.TriggerContains,
			TriggerValue: "harga",
			ResponseText: "Untuk daftar harga lengkap dan promo terbaru, silakan cek katalog kami ya kak. 🙏",
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

func (r *PostgresRepository) seedDefaultAIConfigIfEmpty(ctx context.Context) {
	var count int
	_ = r.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM bot_ai_config`).Scan(&count)
	if count > 0 {
		return
	}
	def := defaultAIConfig("")
	_, _ = r.UpsertAIConfig(ctx, def)
}

func (r *PostgresRepository) ListRules(ctx context.Context, deviceID string) ([]domainBot.AutoReplyRule, error) {
	q := `SELECT id, device_id, name, enabled, priority, trigger_type, trigger_value, case_sensitive,
		only_private, only_groups, allowed_numbers, blocked_numbers,
		response_type, response_text, additional_texts, response_delay_ms,
		triggered_count, last_triggered, created_at, updated_at
		FROM bot_auto_reply_rules WHERE device_id = $1 OR device_id = ''
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

func (r *PostgresRepository) GetRule(ctx context.Context, id string) (*domainBot.AutoReplyRule, error) {
	q := `SELECT id, device_id, name, enabled, priority, trigger_type, trigger_value, case_sensitive,
		only_private, only_groups, allowed_numbers, blocked_numbers,
		response_type, response_text, additional_texts, response_delay_ms,
		triggered_count, last_triggered, created_at, updated_at
		FROM bot_auto_reply_rules WHERE id = $1`
	row := r.db.QueryRowContext(ctx, q, id)
	rule, err := scanSQLiteRule(row)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &rule, err
}

func (r *PostgresRepository) CreateRule(ctx context.Context, rule domainBot.AutoReplyRule) (domainBot.AutoReplyRule, error) {
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
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`
	_, err := r.db.ExecContext(ctx, q,
		rule.ID, rule.DeviceID, rule.Name, boolToInt(rule.Enabled), rule.Priority,
		string(rule.TriggerType), rule.TriggerValue, boolToInt(rule.CaseSensitive),
		boolToInt(rule.OnlyPrivate), boolToInt(rule.OnlyGroups), string(allowedJSON), string(blockedJSON),
		rule.ResponseType, rule.ResponseText, string(addlJSON), rule.ResponseDelayMs,
		rule.TriggeredCount, rule.CreatedAt, rule.UpdatedAt,
	)
	return rule, err
}

func (r *PostgresRepository) UpdateRule(ctx context.Context, rule domainBot.AutoReplyRule) (domainBot.AutoReplyRule, error) {
	rule.UpdatedAt = time.Now().UTC()

	allowedJSON, _ := json.Marshal(rule.AllowedNumbers)
	blockedJSON, _ := json.Marshal(rule.BlockedNumbers)
	addlJSON, _ := json.Marshal(rule.AdditionalTexts)

	q := `UPDATE bot_auto_reply_rules SET
		name=$1, enabled=$2, priority=$3, trigger_type=$4, trigger_value=$5, case_sensitive=$6,
		only_private=$7, only_groups=$8, allowed_numbers=$9, blocked_numbers=$10,
		response_type=$11, response_text=$12, additional_texts=$13, response_delay_ms=$14,
		updated_at=$15
		WHERE id=$16`
	_, err := r.db.ExecContext(ctx, q,
		rule.Name, boolToInt(rule.Enabled), rule.Priority, string(rule.TriggerType), rule.TriggerValue, boolToInt(rule.CaseSensitive),
		boolToInt(rule.OnlyPrivate), boolToInt(rule.OnlyGroups), string(allowedJSON), string(blockedJSON),
		rule.ResponseType, rule.ResponseText, string(addlJSON), rule.ResponseDelayMs,
		rule.UpdatedAt, rule.ID,
	)
	return rule, err
}

func (r *PostgresRepository) DeleteRule(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM bot_auto_reply_rules WHERE id=$1`, id)
	return err
}

func (r *PostgresRepository) IncrementRuleStat(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx,
		`UPDATE bot_auto_reply_rules SET triggered_count = triggered_count + 1, last_triggered = $1 WHERE id = $2`,
		time.Now().UTC(), id)
	return err
}

func (r *PostgresRepository) GetAIConfig(ctx context.Context, deviceID string) (*domainBot.AIConfig, error) {
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
		logrus.Errorf("[BOT_REPO_PG] GetAIConfig (%s) scan error: %v", deviceID, err)
		defaults := defaultAIConfig(deviceID)
		return &defaults, nil
	}
	return &cfg, nil
}

func (r *PostgresRepository) UpsertAIConfig(ctx context.Context, cfg domainBot.AIConfig) (domainBot.AIConfig, error) {
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
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
		ON CONFLICT (device_id) DO UPDATE SET
		enabled=EXCLUDED.enabled, provider=EXCLUDED.provider, api_key=EXCLUDED.api_key, model=EXCLUDED.model,
		custom_url=EXCLUDED.custom_url, ollama_url=EXCLUDED.ollama_url, system_prompt=EXCLUDED.system_prompt,
		knowledge_base=EXCLUDED.knowledge_base, max_tokens=EXCLUDED.max_tokens, temperature=EXCLUDED.temperature,
		cooldown_ms=EXCLUDED.cooldown_ms, reply_to_groups=EXCLUDED.reply_to_groups,
		reply_to_private=EXCLUDED.reply_to_private, trigger_keyword=EXCLUDED.trigger_keyword,
		allowed_numbers=EXCLUDED.allowed_numbers, blocked_numbers=EXCLUDED.blocked_numbers,
		custom_number_prompts=EXCLUDED.custom_number_prompts, custom_skills=EXCLUDED.custom_skills,
		admin_numbers=EXCLUDED.admin_numbers, telegram_bot_token=EXCLUDED.telegram_bot_token,
		telegram_admin_chat_id=EXCLUDED.telegram_admin_chat_id, updated_at=EXCLUDED.updated_at`
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

func (r *PostgresRepository) AddLog(ctx context.Context, log domainBot.ActivityLog) error {
	log.ID = uuid.New().String()
	log.Timestamp = time.Now().UTC()
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO bot_activity_logs (id, device_id, timestamp, type, phone, message, status, rule_id, error)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		log.ID, log.DeviceID, log.Timestamp, log.Type, log.Phone, log.Message, log.Status, log.RuleID, log.Error,
	)
	return err
}

func (r *PostgresRepository) ListLogs(ctx context.Context, deviceID string, limit int) ([]domainBot.ActivityLog, error) {
	if limit <= 0 {
		limit = 100
	}
	q := `SELECT id, device_id, timestamp, type, phone, message, status, rule_id, error
		FROM bot_activity_logs WHERE device_id = $1 OR device_id = ''
		ORDER BY timestamp DESC LIMIT $2`
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

func (r *PostgresRepository) CreateScheduledMessage(ctx context.Context, msg domainBot.ScheduledMessage) (domainBot.ScheduledMessage, error) {
	if msg.ID == "" {
		msg.ID = uuid.New().String()
	}
	msg.CreatedAt = time.Now().UTC()
	if msg.Status == "" {
		msg.Status = "pending"
	}
	q := `INSERT INTO bot_scheduled_messages (id, device_id, phone, message, send_at, status, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`
	_, err := r.db.ExecContext(ctx, q, msg.ID, msg.DeviceID, msg.Phone, msg.Message, msg.SendAt, msg.Status, msg.CreatedAt)
	return msg, err
}

func (r *PostgresRepository) ListScheduledMessages(ctx context.Context, deviceID string) ([]domainBot.ScheduledMessage, error) {
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

func (r *PostgresRepository) DeleteScheduledMessage(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM bot_scheduled_messages WHERE id = $1`, id)
	return err
}

func (r *PostgresRepository) MarkScheduledMessageSent(ctx context.Context, id string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE bot_scheduled_messages SET status = 'sent' WHERE id = $1`, id)
	return err
}
