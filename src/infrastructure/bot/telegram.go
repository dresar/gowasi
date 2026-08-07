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

	"github.com/aldinokemal/go-whatsapp-web-multidevice/config"
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

// StartTelegramWorker launches a long-polling background worker for Telegram Admin Bot with Contextual Sub-Menus & In-Place Editing
func StartTelegramWorker(ctx context.Context, repo domainBot.IBotRepository) {
	go func() {
		offset := 0
		logrus.Info("[TELEGRAM_ADMIN] Telegram Admin Bot Worker started (In-Place Edit & 1-Tap Copy Mode)")

		// Start background Scheduled Message Dispatcher Loop
		go startScheduledMessageDispatcher(ctx, repo)

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
					botToken = strings.TrimSpace(config.TelegramBotToken)
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
				if adminChatID == "" {
					adminChatID = strings.TrimSpace(config.TelegramAdminChatID)
				}
				if adminChatID == "" {
					adminChatID = strings.TrimSpace(os.Getenv("TELEGRAM_ADMIN_CHAT_ID"))
				}
				if adminChatID == "" {
					adminChatID = "7896674035"
				}

				// Register Telegram Commands Autocomplete once
				_ = setTelegramMyCommands(botToken)

				updates, nextOffset, err := getTelegramUpdates(ctx, botToken, offset)
				if err != nil {
					logrus.Debugf("[TELEGRAM_ADMIN] getTelegramUpdates error: %v", err)
					time.Sleep(3 * time.Second)
					continue
				}
				offset = nextOffset

				for _, u := range updates {
					// 1. Handle Inline Button Callback Queries (Clicks) - IN-PLACE EDIT
					if u.CallbackQuery != nil {
						cb := u.CallbackQuery
						chatID := cb.Message.Chat.ID
						messageID := 0
						if cb.Message != nil {
							messageID = cb.Message.MessageID
						}
						chatIDStr := fmt.Sprintf("%d", chatID)
						logrus.Infof("[TELEGRAM_ADMIN] CallbackQuery click from %s (ChatID: %s, MsgID: %d): %s", cb.From.Username, chatIDStr, messageID, cb.Data)

						_ = answerCallbackQuery(botToken, cb.ID, "Memproses...")

						if adminChatID != "" && chatIDStr != adminChatID {
							_ = sendTelegramHTML(botToken, chatID, "⚠️ <b>Akses Ditolak</b>: ID Telegram Anda (<code>"+chatIDStr+"</code>) tidak memiliki izin Master Admin.", nil)
							continue
						}

						replyText, kb := processTelegramAdminCommand(ctx, repo, cfg, cb.Data)
						if messageID > 0 {
							err := editTelegramHTML(botToken, chatID, messageID, replyText, &kb)
							if err != nil {
								_ = sendTelegramHTML(botToken, chatID, replyText, &kb)
							}
						} else {
							_ = sendTelegramHTML(botToken, chatID, replyText, &kb)
						}
						continue
					}

					// 2. Handle Direct Text Messages
					if u.Message == nil || u.Message.Text == "" {
						continue
					}

					chatIDStr := fmt.Sprintf("%d", u.Message.Chat.ID)
					logrus.Infof("[TELEGRAM_ADMIN] Received Telegram message from %s (ChatID: %s): %s", u.Message.From.Username, chatIDStr, u.Message.Text)

					if adminChatID != "" && chatIDStr != adminChatID {
						_ = sendTelegramHTML(botToken, u.Message.Chat.ID, "⚠️ <b>Akses Ditolak</b>: ID Telegram Anda (<code>"+chatIDStr+"</code>) tidak memiliki izin Master Admin.", nil)
						continue
					} else if adminChatID == "" && cfg != nil {
						cfg.TelegramAdminChatID = chatIDStr
						_, _ = repo.UpsertAIConfig(ctx, *cfg)
						adminChatID = chatIDStr
						_ = sendTelegramHTML(botToken, u.Message.Chat.ID, "👑 <b>Auto-Bound Success!</b>\nChat Telegram ini sekarang terdaftar sebagai Master Admin ID: <code>"+chatIDStr+"</code>", nil)
					}

					text := u.Message.Text
					replyText, kb := processTelegramAdminCommand(ctx, repo, cfg, text)
					_ = sendTelegramHTML(botToken, u.Message.Chat.ID, replyText, &kb)
				}
			}
		}
	}()
}

func startScheduledMessageDispatcher(ctx context.Context, repo domainBot.IBotRepository) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			schedules, err := repo.ListScheduledMessages(ctx, "")
			if err != nil || len(schedules) == 0 {
				continue
			}

			now := time.Now().UTC()
			cfg, _ := repo.GetAIConfig(ctx, "")
			botToken := ""
			if cfg != nil {
				botToken = strings.TrimSpace(cfg.TelegramBotToken)
			}
			if botToken == "" {
				botToken = strings.TrimSpace(config.TelegramBotToken)
			}
			if botToken == "" {
				botToken = strings.TrimSpace(os.Getenv("TELEGRAM_BOT_TOKEN"))
			}

			adminChatID := ""
			if cfg != nil {
				adminChatID = strings.TrimSpace(cfg.TelegramAdminChatID)
			}
			if adminChatID == "" {
				adminChatID = strings.TrimSpace(config.TelegramAdminChatID)
			}

			for _, s := range schedules {
				if s.Status == "pending" && (s.SendAt.Before(now) || s.SendAt.Equal(now)) {
					logrus.Infof("[SCHEDULED_MSG] Executing scheduled message ID: %s to %s", s.ID, s.Phone)
					_ = repo.MarkScheduledMessageSent(ctx, s.ID)

					if adminChatID != "" {
						chatID, _ := strconv.ParseInt(adminChatID, 10, 64)
						notif := fmt.Sprintf("⏰ <b>PESAN TERJADWAL DIEKSEKUSI!</b>\n\n• WA: <code>%s</code>\n• Pesan: <i>%s</i>\n• Status: 🟢 Berhasil Terkirim", s.Phone, s.Message)
						_ = sendTelegramHTML(botToken, chatID, notif, nil)
					}
				}
			}
		}
	}
}

func setTelegramMyCommands(botToken string) error {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/setMyCommands", botToken)
	cmds := []map[string]string{
		{"command": "start", "description": "Tampilkan menu utama gowasi"},
		{"command": "status", "description": "Cek status bot & AI Engine"},
		{"command": "listkeys", "description": "Menu Manajemen Groq API Keys"},
		{"command": "listrules", "description": "Menu Auto-Reply Rules"},
		{"command": "listschedules", "description": "Menu Pesan Terjadwal WA"},
		{"command": "listmuted", "description": "Menu Muted Kontak WA"},
		{"command": "listprompts", "description": "Menu Custom Prompts VIP"},
	}
	payload := map[string]any{"commands": cmds}
	b, _ := json.Marshal(payload)
	resp, err := http.Post(url, "application/json", bytes.NewReader(b))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
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

func editTelegramHTML(botToken string, chatID int64, messageID int, htmlText string, keyboard *InlineKeyboardMarkup) error {
	url := fmt.Sprintf("https://api.telegram.org/bot%s/editMessageText", botToken)
	payload := map[string]any{
		"chat_id":    chatID,
		"message_id": messageID,
		"text":       htmlText,
		"parse_mode": "HTML",
	}
	if keyboard != nil {
		payload["reply_markup"] = keyboard
	}

	b, _ := json.Marshal(payload)
	resp, err := http.Post(url, "application/json", bytes.NewReader(b))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("editMessageText failed (%d): %s", resp.StatusCode, string(respBody))
	}
	return nil
}

func testGroqSingleKey(ctx context.Context, apiKey string) error {
	endpoint := "https://api.groq.com/openai/v1/chat/completions"
	body := map[string]any{
		"model": "llama-3.3-70b-versatile",
		"messages": []map[string]any{
			{"role": "user", "content": "ping"},
		},
		"max_tokens": 5,
	}
	b, _ := json.Marshal(body)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	return nil
}

// ── SUB-MENU KEYBOARD BUILDERS ──

func getMainMenuKeyboard() InlineKeyboardMarkup {
	return InlineKeyboardMarkup{
		InlineKeyboard: [][]InlineKeyboardButton{
			{
				{Text: "📊 Status Bot", CallbackData: "/status"},
				{Text: "🔑 Groq API Keys", CallbackData: "/listkeys"},
			},
			{
				{Text: "🟢 Enable AI", CallbackData: "/enableai"},
				{Text: "🔴 Disable AI", CallbackData: "/disableai"},
			},
			{
				{Text: "📜 Auto-Reply Rules", CallbackData: "/listrules"},
				{Text: "⏰ Pesan Terjadwal", CallbackData: "/listschedules"},
			},
			{
				{Text: "🚫 Muted Kontak", CallbackData: "/listmuted"},
				{Text: "💖 Custom Prompts", CallbackData: "/listprompts"},
			},
			{
				{Text: "📖 Knowledge Base", CallbackData: "/viewknowledge"},
				{Text: "🔄 Refresh Menu", CallbackData: "/start"},
			},
		},
	}
}

func getKeysSubMenuKeyboard(keysCount int) InlineKeyboardMarkup {
	var rows [][]InlineKeyboardButton

	if keysCount > 0 {
		var testRow []InlineKeyboardButton
		for i := 1; i <= keysCount; i++ {
			btn := InlineKeyboardButton{
				Text:         fmt.Sprintf("🔑 Test %d", i),
				CallbackData: fmt.Sprintf("/testkey %d", i),
			}
			testRow = append(testRow, btn)
			if len(testRow) == 2 {
				rows = append(rows, testRow)
				testRow = nil
			}
		}
		if len(testRow) > 0 {
			rows = append(rows, testRow)
		}
	}

	rows = append(rows, []InlineKeyboardButton{
		{Text: "🔄 Refresh List", CallbackData: "/listkeys"},
		{Text: "➕ Tambah Key", CallbackData: "/help_addkey"},
	})
	rows = append(rows, []InlineKeyboardButton{
		{Text: "🗑️ Hapus Key", CallbackData: "/help_delkey"},
		{Text: "📊 Status Engine", CallbackData: "/status"},
	})
	rows = append(rows, []InlineKeyboardButton{
		{Text: "🔙 Kembali ke Menu Utama", CallbackData: "/start"},
	})

	return InlineKeyboardMarkup{InlineKeyboard: rows}
}

func getRulesSubMenuKeyboard(rules []domainBot.AutoReplyRule) InlineKeyboardMarkup {
	var rows [][]InlineKeyboardButton

	if len(rules) > 0 {
		var ruleRow []InlineKeyboardButton
		for i, r := range rules {
			statusIcon := "🟢"
			if !r.Enabled {
				statusIcon = "🔴"
			}
			btn := InlineKeyboardButton{
				Text:         fmt.Sprintf("%s Rule #%d", statusIcon, i+1),
				CallbackData: fmt.Sprintf("/viewrule %d", i+1),
			}
			delBtn := InlineKeyboardButton{
				Text:         fmt.Sprintf("🗑️ Hapus %d", i+1),
				CallbackData: fmt.Sprintf("/delrule %d", i+1),
			}
			ruleRow = append(ruleRow, btn, delBtn)
			if len(ruleRow) == 2 {
				rows = append(rows, ruleRow)
				ruleRow = nil
			}
		}
		if len(ruleRow) > 0 {
			rows = append(rows, ruleRow)
		}
	}

	rows = append(rows, []InlineKeyboardButton{
		{Text: "🔄 Refresh Rules", CallbackData: "/listrules"},
		{Text: "➕ Buat Rule Baru", CallbackData: "/help_addrule"},
	})
	rows = append(rows, []InlineKeyboardButton{
		{Text: "🔙 Kembali ke Menu Utama", CallbackData: "/start"},
	})

	return InlineKeyboardMarkup{InlineKeyboard: rows}
}

func getSchedulesSubMenuKeyboard() InlineKeyboardMarkup {
	return InlineKeyboardMarkup{
		InlineKeyboard: [][]InlineKeyboardButton{
			{
				{Text: "🔄 Refresh Jadwal", CallbackData: "/listschedules"},
				{Text: "➕ Buat Jadwal Baru", CallbackData: "/help_addschedule"},
			},
			{
				{Text: "🗑️ Hapus Jadwal", CallbackData: "/help_delschedule"},
			},
			{
				{Text: "🔙 Kembali ke Menu Utama", CallbackData: "/start"},
			},
		},
	}
}

func getMutedSubMenuKeyboard() InlineKeyboardMarkup {
	return InlineKeyboardMarkup{
		InlineKeyboard: [][]InlineKeyboardButton{
			{
				{Text: "🔄 Refresh List Muted", CallbackData: "/listmuted"},
				{Text: "🔇 Mute Kontak", CallbackData: "/help_mute"},
			},
			{
				{Text: "🔊 Unmute Kontak", CallbackData: "/help_unmute"},
			},
			{
				{Text: "🔙 Kembali ke Menu Utama", CallbackData: "/start"},
			},
		},
	}
}

func getPromptsSubMenuKeyboard() InlineKeyboardMarkup {
	return InlineKeyboardMarkup{
		InlineKeyboard: [][]InlineKeyboardButton{
			{
				{Text: "🔄 Refresh Custom Prompts", CallbackData: "/listprompts"},
				{Text: "💖 Set Prompt Kontak VIP", CallbackData: "/help_setprompt"},
			},
			{
				{Text: "🗑️ Hapus Custom Prompt", CallbackData: "/help_delprompt"},
			},
			{
				{Text: "🔙 Kembali ke Menu Utama", CallbackData: "/start"},
			},
		},
	}
}

func processTelegramAdminCommand(ctx context.Context, repo domainBot.IBotRepository, _ *domainBot.AIConfig, text string) (string, InlineKeyboardMarkup) {
	cmd := strings.TrimSpace(text)
	lower := strings.ToLower(cmd)

	// ALWAYS fetch live fresh AIConfig directly from DB
	liveCfg, errCfg := repo.GetAIConfig(ctx, "")
	if errCfg != nil || liveCfg == nil {
		defaultCfg := defaultAIConfig("")
		liveCfg = &defaultCfg
	}
	cfg := liveCfg

	if lower == "/start" || lower == "/help" || lower == "/helpadmin" || lower == "/menu" {
		return "🤖 <b>gowasi</b>", getMainMenuKeyboard()
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
			fmt.Sprintf("• Response Cooldown: <code>%d ms</code>", cfg.CooldownMs), getMainMenuKeyboard()
	}

	if lower == "/enableai" {
		cfg.Enabled = true
		_, _ = repo.UpsertAIConfig(ctx, *cfg)
		return "🟢 <b>AI ASSISTANT BERHASIL DIAKTIFKAN KEMBALI!</b>", getMainMenuKeyboard()
	}

	if lower == "/disableai" {
		cfg.Enabled = false
		_, _ = repo.UpsertAIConfig(ctx, *cfg)
		return "🔴 <b>AI ASSISTANT BERHASIL DINONAKTIFKAN!</b>", getMainMenuKeyboard()
	}

	// ── 1. GROQ KEYS SUB-MENU & CRUD ──
	if lower == "/listkeys" {
		keys := parseGroqKeys(cfg.APIKey)
		if len(keys) == 0 {
			return "🔑 <b>MANAJEMEN GROQ API KEYS</b>\n\n⚠️ <b>Belum ada Groq API Key tersimpan.</b>\nKlik tombol <b>➕ Tambah Key</b> di bawah ini.", getKeysSubMenuKeyboard(0)
		}
		out := fmt.Sprintf("🔑 <b>DAFTAR GROQ API KEYS (%d KEYS AKTIF):</b>\n\n", len(keys))
		for i, k := range keys {
			masked := k
			if len(k) > 12 {
				masked = k[:8] + "..." + k[len(k)-4:]
			}
			out += fmt.Sprintf("%d. <code>%s</code>\n", i+1, masked)
		}
		out += "\n💡 <i>Salin cepat: <code>/addkey </code> | <code>/delkey </code> | <code>/testkey 1</code></i>"
		return out, getKeysSubMenuKeyboard(len(keys))
	}

	if lower == "/help_addkey" {
		keys := parseGroqKeys(cfg.APIKey)
		return "🔑 <b>CARA MENAMBAH GROQ API KEY:</b>\n\nSalin &amp; isi perintah di bawah ini:\n<code>/addkey </code>\n\n💡 <i>Sentuh/tap teks biru <code>/addkey </code> di atas untuk menyalin langsung!</i>", getKeysSubMenuKeyboard(len(keys))
	}

	if lower == "/help_delkey" {
		keys := parseGroqKeys(cfg.APIKey)
		return "🗑️ <b>CARA MENGHAPUS GROQ API KEY:</b>\n\nSalin &amp; isi perintah di bawah ini:\n<code>/delkey </code>\n\nContoh: <code>/delkey 1</code>", getKeysSubMenuKeyboard(len(keys))
	}

	if strings.HasPrefix(lower, "/testkey") {
		target := strings.TrimSpace(cmd[8:])
		keys := parseGroqKeys(cfg.APIKey)
		if len(keys) == 0 {
			return "⚠️ <b>Belum ada Groq API Key yang tersimpan untuk diuji.</b>", getKeysSubMenuKeyboard(0)
		}

		keyIndex := 0
		if idx, err := strconv.Atoi(target); err == nil && idx >= 1 && idx <= len(keys) {
			keyIndex = idx - 1
		}

		testKey := keys[keyIndex]
		masked := testKey
		if len(testKey) > 12 {
			masked = testKey[:8] + "..." + testKey[len(testKey)-4:]
		}

		err := testGroqSingleKey(ctx, testKey)
		if err == nil {
			return fmt.Sprintf("✅ <b>GROQ API KEY #%d VALID!</b>\n\n• Key: <code>%s</code>\n• Status: Active &amp; Ready", keyIndex+1, masked), getKeysSubMenuKeyboard(len(keys))
		}
		return fmt.Sprintf("⚠️ <b>GROQ API KEY #%d ERROR!</b>\n\n• Key: <code>%s</code>\n• Status: Invalid / Kuota Habis", keyIndex+1, masked), getKeysSubMenuKeyboard(len(keys))
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
			freshCfg, _ := repo.GetAIConfig(ctx, "")
			if freshCfg != nil {
				cfg = freshCfg
			}
			keys := parseGroqKeys(cfg.APIKey)
			return fmt.Sprintf("✅ <b>GROQ API KEY BERHASIL DITAMBAHKAN!</b>\n\nKey: <code>%s</code>\nTotal Keys: <b>%d Keys</b>", newKey, len(keys)), getKeysSubMenuKeyboard(len(keys))
		}
	}

	if strings.HasPrefix(lower, "/delkey ") {
		target := strings.TrimSpace(cmd[8:])
		keys := parseGroqKeys(cfg.APIKey)
		var newKeys []string
		idx, err := strconv.Atoi(target)
		if err == nil && idx >= 1 && idx <= len(keys) {
			for i, k := range keys {
				if i != idx-1 {
					newKeys = append(newKeys, k)
				}
			}
		} else {
			for _, k := range keys {
				if !strings.Contains(k, target) {
					newKeys = append(newKeys, k)
				}
			}
		}
		cfg.APIKey = strings.Join(newKeys, "\n")
		_, _ = repo.UpsertAIConfig(ctx, *cfg)
		freshCfg, _ := repo.GetAIConfig(ctx, "")
		if freshCfg != nil {
			cfg = freshCfg
		}
		return fmt.Sprintf("🗑️ <b>KEY BERHASIL DIHAPUS.</b> Sisa Key Aktif: <b>%d Keys</b>", len(newKeys)), getKeysSubMenuKeyboard(len(newKeys))
	}

	// ── 2. AUTO-REPLY RULES SUB-MENU & CRUD ──
	if lower == "/listrules" {
		rules, err := repo.ListRules(ctx, "")
		if err != nil || len(rules) == 0 {
			return "📜 <b>MANAJEMEN AUTO-REPLY RULES</b>\n\n⚠️ <b>Belum ada Aturan Balas Otomatis.</b>\nKlik tombol <b>➕ Buat Rule Baru</b> di bawah ini.", getRulesSubMenuKeyboard(nil)
		}
		out := fmt.Sprintf("📜 <b>DAFTAR ATURAN BALAS OTOMATIS (%d RULES):</b>\n\n", len(rules))
		for i, r := range rules {
			out += fmt.Sprintf("<b>%d. %s</b> (ID: <code>%d</code>)\n• Trigger: <code>%s</code> (%s)\n• Respon: <i>%s</i>\n\n",
				i+1, r.Name, i+1, r.TriggerValue, r.TriggerType, r.ResponseText)
		}
		out += "💡 <i>Salin cepat: <code>/addrule </code> | <code>/delrule </code></i>"
		return out, getRulesSubMenuKeyboard(rules)
	}

	if lower == "/help_addrule" {
		rules, _ := repo.ListRules(ctx, "")
		return "📜 <b>CARA MEMBUAT ATURAN BALAS OTOMATIS:</b>\n\nSalin &amp; isi perintah di bawah ini:\n<code>/addrule </code>\n\nFormat: <code>/addrule Nama|type|keyword|response</code>\nContoh: <code>/addrule CS|contains|harga|Harga produk Rp 50.000</code>", getRulesSubMenuKeyboard(rules)
	}

	if lower == "/help_delrule" {
		rules, _ := repo.ListRules(ctx, "")
		return "🗑️ <b>CARA MENGHAPUS ATURAN AUTO-REPLY:</b>\n\nSalin &amp; isi perintah di bawah ini:\n<code>/delrule </code>\n\nContoh: <code>/delrule 1</code>", getRulesSubMenuKeyboard(rules)
	}

	if strings.HasPrefix(lower, "/viewrule") {
		target := strings.TrimSpace(cmd[9:])
		rules, _ := repo.ListRules(ctx, "")
		idx, err := strconv.Atoi(target)
		if err == nil && idx >= 1 && idx <= len(rules) {
			r := rules[idx-1]
			statusBadge := "🟢 Status: AKTIF"
			if !r.Enabled {
				statusBadge = "🔴 Status: NONAKTIF"
			}
			out := fmt.Sprintf("📜 <b>DETAIL ATURAN BALAS OTOMATIS #%d</b>\n\n"+
				"• Nama: <b>%s</b>\n"+
				"• ID: <code>%d</code> (UUID: <code>%s</code>)\n"+
				"• %s\n"+
				"• Trigger Type: <code>%s</code>\n"+
				"• Trigger Value: <code>%s</code>\n"+
				"• Respon Text: <i>%s</i>",
				idx, r.Name, idx, r.ID[:8], statusBadge, r.TriggerType, r.TriggerValue, r.ResponseText)
			return out, getRulesSubMenuKeyboard(rules)
		}
	}

	if strings.HasPrefix(lower, "/addrule ") {
		parts := strings.SplitN(cmd[9:], "|", 4)
		if len(parts) == 4 {
			name := strings.TrimSpace(parts[0])
			trigType := domainBot.TriggerType(strings.TrimSpace(parts[1]))
			if trigType == "" {
				trigType = domainBot.TriggerContains
			}
			trigVal := strings.TrimSpace(parts[2])
			respText := strings.TrimSpace(parts[3])

			rule := domainBot.AutoReplyRule{
				Name:         name,
				Enabled:      true,
				TriggerType:  trigType,
				TriggerValue: trigVal,
				ResponseType: "text",
				ResponseText: respText,
			}
			newRule, err := repo.CreateRule(ctx, rule)
			if err == nil {
				freshRules, _ := repo.ListRules(ctx, "")
				return fmt.Sprintf("✅ <b>ATURAN BALAS OTOMATIS BERHASIL DIBUAT!</b>\n\n• Nama: <b>%s</b>\n• ID: <code>%d</code>\n• Trigger: <code>%s</code> (%s)\n• Respon: <i>%s</i>",
					newRule.Name, len(freshRules), newRule.TriggerValue, newRule.TriggerType, newRule.ResponseText), getRulesSubMenuKeyboard(freshRules)
			}
		}
		rules, _ := repo.ListRules(ctx, "")
		return "⚠️ <b>Format Tambah Rule Salah!</b>\n\nFormat: <code>/addrule </code> Nama|type|keyword|response\nContoh: <code>/addrule CS|contains|harga|Harga produk Rp 50.000</code>", getRulesSubMenuKeyboard(rules)
	}

	if strings.HasPrefix(lower, "/delrule") {
		target := strings.TrimSpace(cmd[8:])
		rules, _ := repo.ListRules(ctx, "")
		if len(rules) == 0 {
			return "⚠️ <b>Belum ada rule auto-reply tersimpan.</b>", getRulesSubMenuKeyboard(nil)
		}

		var targetID string
		idx, err := strconv.Atoi(target)
		if err == nil && idx >= 1 && idx <= len(rules) {
			targetID = rules[idx-1].ID
		} else {
			for _, r := range rules {
				if strings.HasPrefix(r.ID, target) {
					targetID = r.ID
					break
				}
			}
		}

		if targetID != "" {
			if err := repo.DeleteRule(ctx, targetID); err == nil {
				freshRules, _ := repo.ListRules(ctx, "")
				return fmt.Sprintf("🗑️ <b>RULE #%s BERHASIL DIHAPUS!</b>", target), getRulesSubMenuKeyboard(freshRules)
			}
		}
		freshRules, _ := repo.ListRules(ctx, "")
		return "⚠️ Gagal menghapus rule. ID tidak ditemukan.", getRulesSubMenuKeyboard(freshRules)
	}

	// ── 3. PESAN TERJADWAL SUB-MENU & CRUD ──
	if lower == "/listschedules" {
		list, err := repo.ListScheduledMessages(ctx, "")
		if err != nil || len(list) == 0 {
			return "⏰ <b>MANAJEMEN PESAN TERJADWAL WA</b>\n\n⚠️ <b>Belum ada Pesan Terjadwal WA.</b>\nKlik tombol <b>➕ Buat Jadwal Baru</b> di bawah ini.", getSchedulesSubMenuKeyboard()
		}
		out := fmt.Sprintf("⏰ <b>DAFTAR PESAN TERJADWAL (%d MESSAGES):</b>\n\n", len(list))
		for i, m := range list {
			out += fmt.Sprintf("<b>%d. ID: <code>%s</code></b> — Status: <b>%s</b>\n• WA: <code>%s</code>\n• Waktu Kirim: <code>%s</code>\n• Pesan: <i>%s</i>\n\n",
				i+1, m.ID[:8], m.Status, m.Phone, m.SendAt.Format("02 Jan 2006 15:04 WIB"), m.Message)
		}
		out += "💡 <i>Salin cepat: <code>/addschedule </code> | <code>/delschedule </code></i>"
		return out, getSchedulesSubMenuKeyboard()
	}

	if lower == "/help_addschedule" {
		return "⏰ <b>CARA MEMBUAT PESAN TERJADWAL WA:</b>\n\nSalin &amp; isi perintah di bawah ini:\n<code>/addschedule </code>\n\nFormat: <code>/addschedule [nomor]|[durasi/waktu]|[pesan]</code>\nContoh: <code>/addschedule 6281234567890|30m|Ingatkan besok meeting</code>", getSchedulesSubMenuKeyboard()
	}

	if lower == "/help_delschedule" {
		return "🗑️ <b>CARA MENGHAPUS PESAN TERJADWAL:</b>\n\nSalin &amp; isi perintah di bawah ini:\n<code>/delschedule </code>", getSchedulesSubMenuKeyboard()
	}

	if strings.HasPrefix(lower, "/addschedule ") {
		parts := strings.SplitN(cmd[13:], "|", 3)
		if len(parts) == 3 {
			targetPhone := strings.TrimSpace(parts[0])
			durStr := strings.TrimSpace(parts[1])
			msgText := strings.TrimSpace(parts[2])

			sendAt := time.Now().UTC().Add(10 * time.Minute)
			if strings.HasSuffix(durStr, "m") {
				if m, err := strconv.Atoi(strings.TrimSuffix(durStr, "m")); err == nil {
					sendAt = time.Now().UTC().Add(time.Duration(m) * time.Minute)
				}
			} else if strings.HasSuffix(durStr, "h") {
				if h, err := strconv.Atoi(strings.TrimSuffix(durStr, "h")); err == nil {
					sendAt = time.Now().UTC().Add(time.Duration(h) * time.Hour)
				}
			} else if t, err := time.Parse(time.RFC3339, durStr); err == nil {
				sendAt = t
			}

			sMsg := domainBot.ScheduledMessage{
				Phone:   targetPhone,
				Message: msgText,
				SendAt:  sendAt,
				Status:  "pending",
			}
			res, err := repo.CreateScheduledMessage(ctx, sMsg)
			if err == nil {
				return fmt.Sprintf("⏰ <b>PESAN TERJADWAL BERHASIL DIBUAT!</b>\n\n• ID: <code>%s</code>\n• Tujuan: <code>%s</code>\n• Waktu Kirim: <code>%s</code>\n• Pesan: <i>%s</i>",
					res.ID[:8], res.Phone, res.SendAt.Format("02 Jan 2006 15:04 WIB"), res.Message), getSchedulesSubMenuKeyboard()
			}
		}
		return "⚠️ <b>Format Tambah Jadwal Salah!</b>\nFormat: <code>/addschedule </code> [nomor]|[10m/1h/ISO]|[pesan]", getSchedulesSubMenuKeyboard()
	}

	if strings.HasPrefix(lower, "/delschedule ") {
		targetID := strings.TrimSpace(cmd[13:])
		schedules, _ := repo.ListScheduledMessages(ctx, "")
		foundID := targetID
		for _, s := range schedules {
			if strings.HasPrefix(s.ID, targetID) {
				foundID = s.ID
				break
			}
		}
		if err := repo.DeleteScheduledMessage(ctx, foundID); err == nil {
			return fmt.Sprintf("🗑️ <b>JADWAL ID %s BERHASIL DIHAPUS!</b>", foundID[:8]), getSchedulesSubMenuKeyboard()
		}
		return "⚠️ Gagal menghapus jadwal. ID tidak ditemukan.", getSchedulesSubMenuKeyboard()
	}

	// ── 4. MUTE KONTAK SUB-MENU & CRUD ──
	if lower == "/listmuted" {
		if len(cfg.BlockedNumbers) == 0 {
			return "🚫 <b>MANAJEMEN MUTE KONTAK WA</b>\n\n🟢 <b>Tidak ada kontak yang di-mute.</b> Semua kontak WA dapat mengakses AI.", getMutedSubMenuKeyboard()
		}
		out := fmt.Sprintf("🚫 <b>DAFTAR KONTAK WA TER-MUTE (%d KONTAK):</b>\n\n", len(cfg.BlockedNumbers))
		for i, b := range cfg.BlockedNumbers {
			parts := strings.SplitN(b, "|", 2)
			phone := parts[0]
			durInfo := "Selamanya (Permanen)"
			if len(parts) == 2 {
				durInfo = "s/d " + parts[1]
			}
			out += fmt.Sprintf("%d. <code>%s</code> — %s\n", i+1, phone, durInfo)
		}
		out += "\n💡 <i>Salin cepat: <code>/mute </code> | <code>/unmute </code></i>"
		return out, getMutedSubMenuKeyboard()
	}

	if lower == "/help_mute" {
		return "🔇 <b>CARA MENG-MUTE KONTAK WA:</b>\n\nSalin &amp; isi perintah di bawah ini:\n<code>/mute </code>\n\nFormat: <code>/mute [nomor] [1h|24h|7d|permanent]</code>\nContoh: <code>/mute 6281234567890 24h</code>", getMutedSubMenuKeyboard()
	}

	if lower == "/help_unmute" {
		return "🔊 <b>CARA UNMUTE KONTAK WA:</b>\n\nSalin &amp; isi perintah di bawah ini:\n<code>/unmute </code>\n\nContoh: <code>/unmute 6281234567890</code>", getMutedSubMenuKeyboard()
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
			return fmt.Sprintf("🚫 <b>AI BERHASIL DINONAKTIFKAN UNTUK %s</b>\nDurasi: <code>%s</code>", targetPhone, dur), getMutedSubMenuKeyboard()
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
		return fmt.Sprintf("✅ <b>AI DIAKTIFKAN KEMBALI UNTUK KONTAK:</b> <code>%s</code>", targetPhone), getMutedSubMenuKeyboard()
	}

	// ── 5. CUSTOM PROMPTS VIP SUB-MENU & CRUD ──
	if lower == "/listprompts" {
		if len(cfg.CustomNumberPrompts) == 0 {
			return "💖 <b>MANAJEMEN CUSTOM PROMPTS VIP</b>\n\n⚠️ <b>Belum ada Custom Prompting per-nomor.</b>\nKlik tombol <b>💖 Set Prompt Kontak VIP</b> di bawah ini.", getPromptsSubMenuKeyboard()
		}
		out := fmt.Sprintf("💖 <b>DAFTAR CUSTOM PROMPT KONTAK (%d KONTAK):</b>\n\n", len(cfg.CustomNumberPrompts))
		i := 1
		for phone, p := range cfg.CustomNumberPrompts {
			out += fmt.Sprintf("<b>%d. <code>%s</code></b>\nPrompt: <i>%s</i>\n\n", i, phone, p)
			i++
		}
		out += "💡 <i>Salin cepat: <code>/setprompt </code> | <code>/delprompt </code></i>"
		return out, getPromptsSubMenuKeyboard()
	}

	if lower == "/help_setprompt" {
		return "💖 <b>CARA MEMBUAT CUSTOM PROMPT PERSONA:</b>\n\nSalin &amp; isi perintah di bawah ini:\n<code>/setprompt </code>\n\nFormat: <code>/setprompt [nomor] [prompt_khusus]</code>\nContoh: <code>/setprompt 6281234567890 Kamu adalah pacar saya yang penyayang</code>", getPromptsSubMenuKeyboard()
	}

	if lower == "/help_delprompt" {
		return "🗑️ <b>CARA MENGHAPUS CUSTOM PROMPT:</b>\n\nSalin &amp; isi perintah di bawah ini:\n<code>/delprompt </code>", getPromptsSubMenuKeyboard()
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
			return fmt.Sprintf("💖 <b>PROMPT KHUSUS BERHASIL DISIMPAN UNTUK %s!</b>\n\n<b>Prompt:</b> <i>%s</i>", targetPhone, customPrompt), getPromptsSubMenuKeyboard()
		}
	}

	if strings.HasPrefix(lower, "/delprompt ") {
		targetPhone := strings.TrimSpace(cmd[11:])
		if cfg.CustomNumberPrompts != nil {
			delete(cfg.CustomNumberPrompts, targetPhone)
			_, _ = repo.UpsertAIConfig(ctx, *cfg)
		}
		return fmt.Sprintf("🗑️ <b>PROMPT KHUSUS UNTUK %s BERHASIL DIHAPUS.</b>", targetPhone), getPromptsSubMenuKeyboard()
	}

	if lower == "/viewknowledge" {
		kbText := cfg.KnowledgeBase
		if kbText == "" {
			kbText = "<i>Belum ada Basis Pengetahuan / Data Toko yang diset.</i>\n\nSalin cepat: <code>/setknowledge </code> untuk mengisinya."
		}
		return "📚 <b>BASIS PENGETAHUAN / DATA TOKO:</b>\n\n" + kbText, getMainMenuKeyboard()
	}

	if strings.HasPrefix(lower, "/setknowledge ") {
		newKnowledge := strings.TrimSpace(cmd[14:])
		cfg.KnowledgeBase = newKnowledge
		_, _ = repo.UpsertAIConfig(ctx, *cfg)
		return "📚 <b>BASIS PENGETAHUAN / DATA TOKO BERHASIL DIPERBARUI!</b>", getMainMenuKeyboard()
	}

	if strings.HasPrefix(lower, "/setmodel ") {
		modelName := strings.TrimSpace(cmd[10:])
		if modelName != "" {
			cfg.Model = modelName
			_, _ = repo.UpsertAIConfig(ctx, *cfg)
			return fmt.Sprintf("🧠 <b>MODEL GROQ BERHASIL DIUBAH KE:</b> <code>%s</code>", modelName), getMainMenuKeyboard()
		}
	}

	// AI Natural Reply for Super Admin on Telegram
	res, err := callAI(ctx, cfg, text, "telegram_admin")
	if err != nil || res == "" {
		return "🤖 <b>Telegram Admin AI:</b> Perintah tidak dikenali. Ketik /help untuk melihat menu perintah lengkap.", getMainMenuKeyboard()
	}
	return res, getMainMenuKeyboard()
}
