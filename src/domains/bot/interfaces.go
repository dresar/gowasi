package domainBot

import (
	"context"
	"time"
)

// ChatMessage represents a single turn in a conversation history
type ChatMessage struct {
	Role    string    // "user" | "assistant"
	Content string
	Created time.Time
}


type TriggerType string

const (
	TriggerExact      TriggerType = "exact"
	TriggerContains   TriggerType = "contains"
	TriggerStartsWith TriggerType = "starts_with"
	TriggerEndsWith   TriggerType = "ends_with"
	TriggerRegex      TriggerType = "regex"
)

type AutoReplyRule struct {
	ID              string      `json:"id" db:"id"`
	DeviceID        string      `json:"device_id" db:"device_id"`
	Name            string      `json:"name" db:"name"`
	Enabled         bool        `json:"enabled" db:"enabled"`
	Priority        int         `json:"priority" db:"priority"`
	TriggerType     TriggerType `json:"trigger_type" db:"trigger_type"`
	TriggerValue    string      `json:"trigger_value" db:"trigger_value"`
	CaseSensitive   bool        `json:"case_sensitive" db:"case_sensitive"`
	OnlyPrivate     bool        `json:"only_private" db:"only_private"`
	OnlyGroups      bool        `json:"only_groups" db:"only_groups"`
	AllowedNumbers  []string    `json:"allowed_numbers" db:"allowed_numbers"`
	BlockedNumbers  []string    `json:"blocked_numbers" db:"blocked_numbers"`
	ResponseType    string      `json:"response_type" db:"response_type"`
	ResponseText    string      `json:"response_text" db:"response_text"`
	AdditionalTexts []string    `json:"additional_texts" db:"additional_texts"`
	ResponseDelayMs int         `json:"response_delay_ms" db:"response_delay_ms"`
	TriggeredCount  int         `json:"triggered_count" db:"triggered_count"`
	LastTriggered   *time.Time  `json:"last_triggered" db:"last_triggered"`
	CreatedAt       time.Time   `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time   `json:"updated_at" db:"updated_at"`
}

type AIProvider string

const (
	AIProviderGroq   AIProvider = "groq"
	AIProviderCustom AIProvider = "custom"
	AIProviderOllama AIProvider = "ollama"
)

type AIConfig struct {
	ID                  string            `json:"id" db:"id"`
	DeviceID            string            `json:"device_id" db:"device_id"`
	Enabled             bool              `json:"enabled" db:"enabled"`
	Provider            AIProvider        `json:"provider" db:"provider"`
	APIKey              string            `json:"api_key" db:"api_key"`
	Model               string            `json:"model" db:"model"`
	CustomURL           string            `json:"custom_url" db:"custom_url"`
	OllamaURL           string            `json:"ollama_url" db:"ollama_url"`
	SystemPrompt        string            `json:"system_prompt" db:"system_prompt"`
	KnowledgeBase       string            `json:"knowledge_base" db:"knowledge_base"`
	MaxTokens           int               `json:"max_tokens" db:"max_tokens"`
	Temperature         float64           `json:"temperature" db:"temperature"`
	CooldownMs          int               `json:"cooldown_ms" db:"cooldown_ms"`
	ReplyToGroups       bool              `json:"reply_to_groups" db:"reply_to_groups"`
	ReplyToPrivate      bool              `json:"reply_to_private" db:"reply_to_private"`
	TriggerKeyword      string            `json:"trigger_keyword" db:"trigger_keyword"`
	AllowedNumbers          []string          `json:"allowed_numbers" db:"allowed_numbers"`
	BlockedNumbers          []string          `json:"blocked_numbers" db:"blocked_numbers"`
	AutoReplyAllowedNumbers []string          `json:"autoreply_allowed_numbers" db:"autoreply_allowed_numbers"`
	AutoReplyBlockedNumbers []string          `json:"autoreply_blocked_numbers" db:"autoreply_blocked_numbers"`
	CustomNumberPrompts map[string]string `json:"custom_number_prompts" db:"custom_number_prompts"`
	CustomSkills        []string          `json:"custom_skills" db:"custom_skills"`
	AdminNumbers        []string          `json:"admin_numbers" db:"admin_numbers"`
	TelegramBotToken    string            `json:"telegram_bot_token" db:"telegram_bot_token"`
	TelegramAdminChatID string            `json:"telegram_admin_chat_id" db:"telegram_admin_chat_id"`
	UpdatedAt           time.Time         `json:"updated_at" db:"updated_at"`
}

type ActivityLog struct {
	ID        string    `json:"id" db:"id"`
	DeviceID  string    `json:"device_id" db:"device_id"`
	Timestamp time.Time `json:"timestamp" db:"timestamp"`
	Type      string    `json:"type" db:"type"` // auto_reply | ai_reply | error
	Phone     string    `json:"phone" db:"phone"`
	Message   string    `json:"message" db:"message"`
	Status    string    `json:"status" db:"status"` // success | failed
	RuleID    string    `json:"rule_id" db:"rule_id"`
	Error     string    `json:"error" db:"error"`
}

type IBotRepository interface {
	EnsureSchema(ctx context.Context) error

	ListRules(ctx context.Context, deviceID string) ([]AutoReplyRule, error)
	GetRule(ctx context.Context, id string) (*AutoReplyRule, error)
	CreateRule(ctx context.Context, rule AutoReplyRule) (AutoReplyRule, error)
	UpdateRule(ctx context.Context, rule AutoReplyRule) (AutoReplyRule, error)
	DeleteRule(ctx context.Context, id string) error
	IncrementRuleStat(ctx context.Context, id string) error

	GetAIConfig(ctx context.Context, deviceID string) (*AIConfig, error)
	UpsertAIConfig(ctx context.Context, cfg AIConfig) (AIConfig, error)
	// Atomic single-key operations for custom prompts (avoids race condition with full UpsertAIConfig)
	SetCustomPrompt(ctx context.Context, phone, prompt string) error
	DeleteCustomPrompt(ctx context.Context, phone string) error

	AddLog(ctx context.Context, log ActivityLog) error
	ListLogs(ctx context.Context, deviceID string, limit int) ([]ActivityLog, error)

	CreateScheduledMessage(ctx context.Context, msg ScheduledMessage) (ScheduledMessage, error)
	ListScheduledMessages(ctx context.Context, deviceID string) ([]ScheduledMessage, error)
	DeleteScheduledMessage(ctx context.Context, id string) error
	MarkScheduledMessageSent(ctx context.Context, id string) error

	// Long-term memory: per-contact conversation history for AI context
	GetChatHistory(ctx context.Context, phone string, limit int) ([]ChatMessage, error)
	AppendChatHistory(ctx context.Context, phone, role, content string) error
	ClearChatHistory(ctx context.Context, phone string) error
}

type ScheduledMessage struct {
	ID        string    `json:"id" db:"id"`
	DeviceID  string    `json:"device_id" db:"device_id"`
	Phone     string    `json:"phone" db:"phone"`
	Message   string    `json:"message" db:"message"`
	SendAt    time.Time `json:"send_at" db:"send_at"`
	Status    string    `json:"status" db:"status"` // pending | sent | failed
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}
