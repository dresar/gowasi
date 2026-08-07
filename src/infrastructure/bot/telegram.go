package botrepo

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	domainBot "github.com/aldinokemal/go-whatsapp-web-multidevice/domains/bot"
	"github.com/sirupsen/logrus"
)

type InlineKeyboardButton struct {
	Text         string `json:"text"`
	CallbackData string `json:"callback_data"`
}

type InlineKeyboardMarkup struct {
	InlineKeyboard [][]InlineKeyboardButton `json:"inline_keyboard"`
}

type tgUpdate struct {
	UpdateID int `json:"update_id"`
	Message  *struct {
		MessageID int `json:"message_id"`
		From      struct {
			ID       int64  `json:"id"`
			Username string `json:"username"`
		} `json:"from"`
		Chat struct {
			ID int64 `json:"id"`
		} `json:"chat"`
		Text string `json:"text"`
	} `json:"message"`
	CallbackQuery *struct {
		ID   string `json:"id"`
		From struct {
			ID       int64  `json:"id"`
			Username string `json:"username"`
		} `json:"from"`
		Message *struct {
			MessageID int `json:"message_id"`
			Chat      struct {
				ID int64 `json:"id"`
			} `json:"chat"`
		} `json:"message"`
		Data string `json:"data"`
	} `json:"callback_query"`
}

// StartTelegramWorker launches a long-polling background worker for Telegram Admin Bot with Inline Keyboards
func StartTelegramWorker(ctx context.Context, repo domainBot.IBotRepository) {
	go func() {
		offset := 0
		logrus.Info("[TELEGRAM_ADMIN] Telegram Admin Bot Worker started (Inline Keyboard Grid Mode)")

		for {
			select {
			case <-ctx.Done():
				logrus.Info("[TELEGRAM_ADMIN] Worker stopped")
				return
			default:
				cfg, _ := repo.GetAIConfig(ctx, "")
				botToken := ""
				if cfg != nil {
					botToken = strings.TrimSpace(cfg.TelegramBotToken)
				}
				if botToken == "" {
					botToken = strings.TrimSpace(os.Getenv("TELEGRAM_BOT_TOKEN"))
				}
				if botToken == "" {
					botToken = "7969028715:AAENtmQ3tpwlY0QrJpdRlRLIEaB2_UMmFzo"
				}

				adminChatID := ""
				if cfg != nil {
					adminChatID = strings.TrimSpace(cfg.TelegramAdminChatID)
				}

				updates, nextOffset, err := getTelegramUpdates(ctx, botToken, offset)
				if err != nil {
					logrus.Debugf("[TELEGRAM_ADMIN] getTelegramUpdates error: %v", err)
					time.Sleep(3 * time.Second)
					continue
				}
				offset = nextOffset

				for _, u := range updates {
					// 1. Handle Inline Button Callback Queries (Clicks)
					if u.CallbackQuery != nil {
						cb := u.CallbackQuery
						chatID := cb.Message.Chat.ID
						chatIDStr := fmt.Sprintf("%d", chatID)
						logrus.Infof("[TELEGRAM_ADMIN] CallbackQuery click from %s (ChatID: %s): %s", cb.From.Username, chatIDStr, cb.Data)

						_ = answerCallbackQuery(botToken, cb.ID, "Menu Diproses...")

						if adminChatID != "" && chatIDStr != adminChatID {
							_ = sendTelegramHTML(botToken, chatID, "⚠️ <b>Akses Ditolak</b>: Anda bukan Master Admin terdaftar.", nil)
							continue
						}

						replyText := processTelegramAdminCommand(ctx, repo, cfg, cb.Data)
						kb := getAdminInlineKeyboard()
						_ = sendTelegramHTML(botToken, chatID, replyText, &kb)
						continue
					}

					// 2. Handle Direct Text Messages
					if u.Message == nil || u.Message.Text == "" {
						continue
					}

					chatIDStr := fmt.Sprintf("%d", u.Message.Chat.ID)
					logrus.Infof("[TELEGRAM_ADMIN] Received Telegram message from %s (ChatID: %s): %s", u.Message.From.Username, chatIDStr, u.Message.Text)

					// Auto-bind chat ID on first setup
					if adminChatID != "" && chatIDStr != adminChatID {
						_ = sendTelegramHTML(botToken, u.Message.Chat.ID, "⚠️ <b>Akses Ditolak</b>: Anda bukan Master Admin terdaftar.", nil)
						continue
					} else if adminChatID == "" && cfg != nil {
						cfg.TelegramAdminChatID = chatIDStr
						_, _ = repo.UpsertAIConfig(ctx, *cfg)
						adminChatID = chatIDStr
						_ = sendTelegramHTML(botToken, u.Message.Chat.ID, "👑 <b>Auto-Bound Success!</b>\nChat Telegram ini sekarang terdaftar sebagai Master Admin ID: <code>"+chatIDStr+"</code>", nil)
					}

					text := u.Message.Text
					replyText := processTelegramAdminCommand(ctx, repo, cfg, text)
					kb := getAdminInlineKeyboard()

					if strings.HasPrefix(text, "/") || text == "/start" || text == "/help" {
						_ = sendTelegramHTML(botToken, u.Message.Chat.ID, replyText, &kb)
					} else {
						_ = sendTelegramHTML(botToken, u.Message.Chat.ID, replyText, nil)
					}
				}
			}
		}
	}()
}

func getTelegramUpdates(ctx context.Context, botToken string, offset int) ([]tgUpdate, int, error) {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/getUpdates?offset=%d&timeout=10", botToken, offset)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, offset, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var res struct {
		Ok          bool       `json:"ok"`
		Result      []tgUpdate `json:"result"`
		Description string     `json:"description"`
	}
	if err := json.Unmarshal(body, &res); err != nil || !res.Ok {
		return nil, offset, fmt.Errorf("telegram api error: %s", res.Description)
	}

	nextOffset := offset
	for _, u := range res.Result {
		if u.UpdateID >= nextOffset {
			nextOffset = u.UpdateID + 1
		}
	}
	return res.Result, nextOffset, nil
}

func answerCallbackQuery(botToken string, callbackID string, text string) error {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/answerCallbackQuery", botToken)
	payload := map[string]any{
		"callback_query_id": callbackID,
		"text":              text,
	}
	b, _ := json.Marshal(payload)
	resp, err := http.Post(url, "application/json", bytes.NewReader(b))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

func sendTelegramHTML(botToken string, chatID int64, htmlText string, keyboard *InlineKeyboardMarkup) error {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", botToken)
	payload := map[string]any{
		"chat_id":    chatID,
		"text":       htmlText,
		"parse_mode": "HTML",
	}
	if keyboard != nil {
		payload["reply_markup"] = keyboard
	}

	b, _ := json.Marshal(payload)
	resp, err := http.Post(url, "application/json", bytes.NewReader(b))
	if err != nil {
		logrus.Errorf("[TELEGRAM_ADMIN] sendTelegramHTML HTTP error: %v", err)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		logrus.Warnf("[TELEGRAM_ADMIN] sendTelegramHTML status %d: %s. Retrying plain text...", resp.StatusCode, string(respBody))
		payload["parse_mode"] = ""
		b2, _ := json.Marshal(payload)
		resp2, err2 := http.Post(url, "application/json", bytes.NewReader(b2))
		if err2 == nil {
			resp2.Body.Close()
		}
	}
	return nil
}

func getAdminInlineKeyboard() InlineKeyboardMarkup {
	return InlineKeyboardMarkup{
		InlineKeyboard: [][]InlineKeyboardButton{
			{
				{Text: "📊 Status Bot", CallbackData: "/status"},
				{Text: "🔑 List Keys", CallbackData: "/listkeys"},
			},
			{
				{Text: "🟢 Enable AI", CallbackData: "/enableai"},
				{Text: "🔴 Disable AI", CallbackData: "/disableai"},
			},
			{
				{Text: "🚫 Muted Kontak", CallbackData: "/listmuted"},
				{Text: "💖 Custom Prompts", CallbackData: "/helpadmin"},
			},
			{
				{Text: "🧠 AI Model Info", CallbackData: "/status"},
				{Text: "📚 Knowledge Base", CallbackData: "/helpadmin"},
			},
			{
				{Text: "⚙️ Pengaturan", CallbackData: "/helpadmin"},
				{Text: "🔄 Refresh Menu", CallbackData: "/start"},
			},
		},
	}
}

func processTelegramAdminCommand(ctx context.Context, repo domainBot.IBotRepository, cfg *domainBot.AIConfig, text string) string {
	cmd := strings.TrimSpace(text)
	lower := strings.ToLower(cmd)

	if cfg == nil {
		defaultCfg := defaultAIConfig("")
		cfg = &defaultCfg
	}

	if lower == "/start" || lower == "/help" || lower == "/helpadmin" {
		return "🤖 <b>gowasi</b>"
	}

	if lower == "/status" {
		keys := parseGroqKeys(cfg.APIKey)
		mutedCount := len(cfg.BlockedNumbers)
		statusBadge := "🔴 <b>OFFLINE</b>"
		if cfg.Enabled {
			statusBadge = "🟢 <b>ONLINE &amp; SERVING</b>"
		}
		return "📊 <b>STATUS EXECUTIVE MASTER ADMIN WA BOT</b>\n\n" +
			fmt.Sprintf("• Status AI: %s\n", statusBadge) +
			fmt.Sprintf("• Provider: <code>%s</code>\n", cfg.Provider) +
			fmt.Sprintf("• Active Model: <code>%s</code>\n", cfg.Model) +
			fmt.Sprintf("• Groq Keys Count: <b>%d Keys</b>\n", len(keys)) +
			fmt.Sprintf("• Muted Contacts: <b>%d Contacts</b>\n", mutedCount) +
			fmt.Sprintf("• Custom Prompts: <b>%d Custom Prompts</b>\n", len(cfg.CustomNumberPrompts)) +
			fmt.Sprintf("• Response Cooldown: <code>%d ms</code>", cfg.CooldownMs)
	}

	if lower == "/enableai" {
		cfg.Enabled = true
		_, _ = repo.UpsertAIConfig(ctx, *cfg)
		return "🟢 <b>AI ASSISTANT BERHASIL DIAKTIFKAN KEMBALI!</b>"
	}

	if lower == "/disableai" {
		cfg.Enabled = false
		_, _ = repo.UpsertAIConfig(ctx, *cfg)
		return "🔴 <b>AI ASSISTANT BERHASIL DINONAKTIFKAN!</b>"
	}

	if lower == "/listkeys" {
		keys := parseGroqKeys(cfg.APIKey)
		if len(keys) == 0 {
			return "⚠️ <b>Belum ada Groq API Key yang tersimpan.</b> Gunakan <code>/addkey [gsk_key]</code> untuk menambahkan key."
		}
		out := fmt.Sprintf("🔑 <b>DAFTAR GROQ API KEYS (%d KEYS AKTIF):</b>\n\n", len(keys))
		for i, k := range keys {
			masked := k
			if len(k) > 12 {
				masked = k[:8] + "..." + k[len(k)-4:]
			}
			out += fmt.Sprintf("%d. <code>%s</code>\n", i+1, masked)
		}
		out += "\n💡 <i>Jika Key #1 kuota habis, system otomatis merotasi ke Key #2, #3, dst.</i>"
		return out
	}

	if strings.HasPrefix(lower, "/addkey ") {
		newKey := strings.TrimSpace(cmd[8:])
		if newKey != "" {
			if cfg.APIKey != "" {
				cfg.APIKey = cfg.APIKey + "\n" + newKey
			} else {
				cfg.APIKey = newKey
			}
			_, _ = repo.UpsertAIConfig(ctx, *cfg)
			keys := parseGroqKeys(cfg.APIKey)
			return fmt.Sprintf("✅ <b>KEY GROQ BARU BERHASIL DITAMBAHKAN!</b>\n\nKey: <code>%s</code>\nTotal Key Aktif Saat Ini: <b>%d Keys</b>.", newKey, len(keys))
		}
	}

	if strings.HasPrefix(lower, "/mute ") {
		parts := strings.Fields(cmd[6:])
		if len(parts) >= 1 {
			targetPhone := parts[0]
			dur := "permanent"
			if len(parts) >= 2 {
				dur = parts[1]
			}
			var expireIso string
			now := time.Now().UTC()
			if dur == "1h" {
				expireIso = now.Add(1 * time.Hour).Format(time.RFC3339)
			} else if dur == "24h" || dur == "1d" {
				expireIso = now.Add(24 * time.Hour).Format(time.RFC3339)
			} else if dur == "7d" {
				expireIso = now.Add(7 * 24 * time.Hour).Format(time.RFC3339)
			}
			entry := targetPhone
			if expireIso != "" {
				entry = targetPhone + "|" + expireIso
			}
			cfg.BlockedNumbers = append(cfg.BlockedNumbers, entry)
			_, _ = repo.UpsertAIConfig(ctx, *cfg)
			return fmt.Sprintf("🚫 <b>AI BERHASIL DINONAKTIFKAN UNTUK %s</b>\nDurasi: <code>%s</code>", targetPhone, dur)
		}
	}

	if strings.HasPrefix(lower, "/unmute ") {
		targetPhone := strings.TrimSpace(cmd[8:])
		var newBlocked []string
		for _, b := range cfg.BlockedNumbers {
			if !strings.HasPrefix(b, targetPhone) {
				newBlocked = append(newBlocked, b)
			}
		}
		cfg.BlockedNumbers = newBlocked
		_, _ = repo.UpsertAIConfig(ctx, *cfg)
		return fmt.Sprintf("✅ <b>AI DIAKTIFKAN KEMBALI UNTUK KONTAK:</b> <code>%s</code>", targetPhone)
	}

	if lower == "/listmuted" {
		if len(cfg.BlockedNumbers) == 0 {
			return "🟢 <b>Tidak ada kontak yang sedang di-mute.</b> Semua kontak WA dapat mengakses AI Assistant."
		}
		out := fmt.Sprintf("🚫 <b>DAFTAR KONTAK WA YANG DI-MUTE (%d KONTAK):</b>\n\n", len(cfg.BlockedNumbers))
		for i, b := range cfg.BlockedNumbers {
			parts := strings.SplitN(b, "|", 2)
			phone := parts[0]
			durInfo := "Selamanya (Permanen)"
			if len(parts) == 2 {
				durInfo = "s/d " + parts[1]
			}
			out += fmt.Sprintf("%d. <code>%s</code> — %s\n", i+1, phone, durInfo)
		}
		return out
	}

	if strings.HasPrefix(lower, "/setprompt ") {
		parts := strings.SplitN(cmd[11:], " ", 2)
		if len(parts) == 2 {
			targetPhone := strings.TrimSpace(parts[0])
			customPrompt := strings.TrimSpace(parts[1])
			if cfg.CustomNumberPrompts == nil {
				cfg.CustomNumberPrompts = make(map[string]string)
			}
			cfg.CustomNumberPrompts[targetPhone] = customPrompt
			_, _ = repo.UpsertAIConfig(ctx, *cfg)
			return fmt.Sprintf("💖 <b>PROMPT KHUSUS BERHASIL DISIMPAN UNTUK %s!</b>\n\n<b>Prompt:</b> <i>%s</i>", targetPhone, customPrompt)
		}
	}

	if strings.HasPrefix(lower, "/delprompt ") {
		targetPhone := strings.TrimSpace(cmd[11:])
		if cfg.CustomNumberPrompts != nil {
			delete(cfg.CustomNumberPrompts, targetPhone)
			_, _ = repo.UpsertAIConfig(ctx, *cfg)
		}
		return fmt.Sprintf("🗑️ <b>PROMPT KHUSUS UNTUK %s BERHASIL DIHAPUS.</b> Kembali memakai prompt global.", targetPhone)
	}

	if strings.HasPrefix(lower, "/setknowledge ") {
		newKnowledge := strings.TrimSpace(cmd[14:])
		cfg.KnowledgeBase = newKnowledge
		_, _ = repo.UpsertAIConfig(ctx, *cfg)
		return "📚 <b>BASIS PENGETAHUAN / DATA TOKO BERHASIL DIPERBARUI!</b>"
	}

	if strings.HasPrefix(lower, "/setcooldown ") {
		msStr := strings.TrimSpace(cmd[13:])
		if ms, err := strconv.Atoi(msStr); err == nil && ms >= 1000 {
			cfg.CooldownMs = ms
			_, _ = repo.UpsertAIConfig(ctx, *cfg)
			return fmt.Sprintf("⏱️ <b>COOLDOWN RESPONSE DIUBAH KE:</b> <code>%d ms</code>", ms)
		}
		return "⚠️ Format cooldown salah. Contoh: <code>/setcooldown 3000</code>"
	}

	if strings.HasPrefix(lower, "/setmodel ") {
		modelName := strings.TrimSpace(cmd[10:])
		if modelName != "" {
			cfg.Model = modelName
			_, _ = repo.UpsertAIConfig(ctx, *cfg)
			return fmt.Sprintf("🧠 <b>MODEL GROQ BERHASIL DIUBAH KE:</b> <code>%s</code>", modelName)
		}
	}

	// AI Natural Reply for Super Admin on Telegram
	res, err := callAI(ctx, cfg, text, "telegram_admin")
	if err != nil || res == "" {
		return "🤖 <b>Telegram Admin AI:</b> Perintah tidak dikenali. Ketik /help untuk melihat menu perintah lengkap."
	}
	return res
}
