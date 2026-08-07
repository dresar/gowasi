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
	domainSend "github.com/aldinokemal/go-whatsapp-web-multidevice/domains/send"
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

func shortID(id string) string {
	if len(id) > 8 {
		return id[:8]
	}
	return id
}

// StartTelegramWorker launches a long-polling background worker for Telegram Admin Bot with Contextual Sub-Menus & In-Place Editing
func StartTelegramWorker(ctx context.Context, repo domainBot.IBotRepository, sendUc domainSend.ISendUsecase) {
	go func() {
		offset := 0
		logrus.Info("[TELEGRAM_ADMIN] Telegram Admin Bot Worker started (In-Place Edit & Scheduled WA Sender Active)")

		// Start background Scheduled Message Dispatcher Loop
		go startScheduledMessageDispatcher(ctx, repo, sendUc)

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

func startScheduledMessageDispatcher(ctx context.Context, repo domainBot.IBotRepository, sendUc domainSend.ISendUsecase) {
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
					logrus.Infof("[SCHEDULED_MSG] Executing scheduled message ID: %s to %s via WA", s.ID, s.Phone)

					var sendErr error
					if sendUc != nil {
						req := domainSend.MessageRequest{
							BaseRequest: domainSend.BaseRequest{
								Phone: s.Phone,
							},
							Message: s.Message,
						}
						_, sendErr = sendUc.SendText(ctx, req)
					}

					if sendErr == nil {
						_ = repo.MarkScheduledMessageSent(ctx, s.ID)
						logrus.Infof("[SCHEDULED_MSG] Scheduled message ID %s to %s sent successfully!", s.ID, s.Phone)

						if adminChatID != "" {
							chatID, _ := strconv.ParseInt(adminChatID, 10, 64)
							notif := fmt.Sprintf("⏰ <b>PESAN TERJADWAL TERKIRIM!</b>\n\n• WA Tujuan: <code>%s</code>\n• Pesan: <i>%s</i>\n• Status: 🟢 Berhasil Terkirim ke WhatsApp", s.Phone, s.Message)
							_ = sendTelegramHTML(botToken, chatID, notif, nil)
						}
					} else {
						logrus.Errorf("[SCHEDULED_MSG] Failed to send scheduled message ID %s to %s: %v", s.ID, s.Phone, sendErr)
						if adminChatID != "" {
							chatID, _ := strconv.ParseInt(adminChatID, 10, 64)
							notif := fmt.Sprintf("⚠️ <b>PESAN TERJADWAL GAGAL TERKIRIM!</b>\n\n• WA Tujuan: <code>%s</code>\n• Pesan: <i>%s</i>\n• Error: <i>%v</i>", s.Phone, s.Message, sendErr)
							_ = sendTelegramHTML(botToken, chatID, notif, nil)
						}
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
		{"command": "clearmemory", "description": "Hapus Riwayat Chat AI Kontak (/clearmemory <nomor>|all)"},
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

func getRulesSubMenuKeyboard(rules []domainBot.AutoReplyRule, page int) InlineKeyboardMarkup {
	var rows [][]InlineKeyboardButton
	const pageSize = 10

	totalPages := 1
	if len(rules) > 0 {
		totalPages = (len(rules) + pageSize - 1) / pageSize
	}
	if page < 1 {
		page = 1
	}
	if page > totalPages {
		page = totalPages
	}

	start := (page - 1) * pageSize
	end := start + pageSize
	if end > len(rules) {
		end = len(rules)
	}

	// Show rules as 2-column buttons (no delete button in list)
	if len(rules) > 0 {
		var rowBuf []InlineKeyboardButton
		for i := start; i < end; i++ {
			r := rules[i]
			statusIcon := "🟢"
			if !r.Enabled {
				statusIcon = "🔴"
			}
			btn := InlineKeyboardButton{
				Text:         fmt.Sprintf("%s #%d %s", statusIcon, i+1, r.Name),
				CallbackData: fmt.Sprintf("/viewrule %d", i+1),
			}
			rowBuf = append(rowBuf, btn)
			if len(rowBuf) == 2 {
				rows = append(rows, rowBuf)
				rowBuf = nil
			}
		}
		if len(rowBuf) > 0 {
			rows = append(rows, rowBuf)
		}
	}

	// Pagination nav row
	var navRow []InlineKeyboardButton
	if page > 1 {
		navRow = append(navRow, InlineKeyboardButton{
			Text:         fmt.Sprintf("◀️ Hal %d", page-1),
			CallbackData: fmt.Sprintf("/listrules %d", page-1),
		})
	}
	if totalPages > 1 {
		navRow = append(navRow, InlineKeyboardButton{
			Text:         fmt.Sprintf("📄 %d/%d", page, totalPages),
			CallbackData: fmt.Sprintf("/listrules %d", page),
		})
	}
	if page < totalPages {
		navRow = append(navRow, InlineKeyboardButton{
			Text:         fmt.Sprintf("Hal %d ▶️", page+1),
			CallbackData: fmt.Sprintf("/listrules %d", page+1),
		})
	}
	if len(navRow) > 0 {
		rows = append(rows, navRow)
	}

	rows = append(rows, []InlineKeyboardButton{
		{Text: "🔄 Refresh", CallbackData: "/listrules 1"},
		{Text: "➕ Tambah Rule", CallbackData: "/help_addrule"},
	})
	rows = append(rows, []InlineKeyboardButton{
		{Text: "🗑️ Hapus Rule", CallbackData: "/help_delrule"},
		{Text: "🔙 Menu Utama", CallbackData: "/start"},
	})

	return InlineKeyboardMarkup{InlineKeyboard: rows}
}

func getSchedulesSubMenuKeyboard(schedules []domainBot.ScheduledMessage) InlineKeyboardMarkup {
	var rows [][]InlineKeyboardButton

	if len(schedules) > 0 {
		var schedRow []InlineKeyboardButton
		for i, s := range schedules {
			statusIcon := "⏳"
			if s.Status == "sent" {
				statusIcon = "🟢"
			}
			btn := InlineKeyboardButton{
				Text:         fmt.Sprintf("%s Jadwal #%d", statusIcon, i+1),
				CallbackData: fmt.Sprintf("/viewschedule %d", i+1),
			}
			delBtn := InlineKeyboardButton{
				Text:         fmt.Sprintf("🗑️ Hapus %d", i+1),
				CallbackData: fmt.Sprintf("/delschedule %d", i+1),
			}
			schedRow = append(schedRow, btn, delBtn)
			if len(schedRow) == 2 {
				rows = append(rows, schedRow)
				schedRow = nil
			}
		}
		if len(schedRow) > 0 {
			rows = append(rows, schedRow)
		}
	}

	rows = append(rows, []InlineKeyboardButton{
		{Text: "🔄 Refresh Jadwal", CallbackData: "/listschedules"},
		{Text: "➕ Buat Jadwal Baru", CallbackData: "/help_addschedule"},
	})
	rows = append(rows, []InlineKeyboardButton{
		{Text: "🔙 Kembali ke Menu Utama", CallbackData: "/start"},
	})

	return InlineKeyboardMarkup{InlineKeyboard: rows}
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
				{Text: "🧹 Reset Memory Chat", CallbackData: "/help_clearmemory"},
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
		rules, _ := repo.ListRules(ctx, "")
		schedules, _ := repo.ListScheduledMessages(ctx, "")
		mutedCount := len(cfg.BlockedNumbers)
		promptsCount := len(cfg.CustomNumberPrompts)

		statusBadge := "🔴 <b>OFFLINE</b>"
		if cfg.Enabled {
			statusBadge = "🟢 <b>ONLINE &amp; SERVING</b>"
		}

		kbBadge := "🔴 <b>Empty</b>"
		if strings.TrimSpace(cfg.KnowledgeBase) != "" {
			kbBadge = "🟢 <b>Active</b>"
		}

		return "📊 <b>STATUS EXECUTIVE MASTER ADMIN WA BOT</b>\n\n" +
			fmt.Sprintf("• Status AI Engine: %s\n", statusBadge) +
			fmt.Sprintf("• Provider: <code>%s</code>\n", cfg.Provider) +
			fmt.Sprintf("• Active Model: <code>%s</code>\n", cfg.Model) +
			fmt.Sprintf("• Groq Keys Count: <b>%d Keys</b>\n", len(keys)) +
			fmt.Sprintf("• Auto-Reply Rules: <b>%d Rules</b>\n", len(rules)) +
			fmt.Sprintf("• Pesan Terjadwal: <b>%d Messages</b>\n", len(schedules)) +
			fmt.Sprintf("• Muted Contacts: <b>%d Contacts</b>\n", mutedCount) +
			fmt.Sprintf("• Custom Prompts VIP: <b>%d Prompts</b>\n", promptsCount) +
			fmt.Sprintf("• Knowledge Base: %s\n", kbBadge) +
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

	if (strings.HasPrefix(lower, "/addkey ") || strings.HasPrefix(lower, "/addkey\n") || strings.HasPrefix(lower, "/addkey\r")) && len(cmd) > 7 {
		newKey := strings.TrimSpace(cmd[7:])
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

	if strings.HasPrefix(lower, "/delkey") {
		target := strings.TrimSpace(cmd[7:])
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
	if strings.HasPrefix(lower, "/listrules") {
		pageNum := 1
		pageStr := strings.TrimSpace(cmd[10:])
		if p, err := strconv.Atoi(pageStr); err == nil && p >= 1 {
			pageNum = p
		}
		rules, err := repo.ListRules(ctx, "")
		if err != nil || len(rules) == 0 {
			return "📜 <b>MANAJEMEN AUTO-REPLY RULES</b>\n\n" +
				"<i>Belum ada aturan balas otomatis.</i>\n\n" +
				"💡 Klik <b>➕ Tambah Rule</b> untuk membuat aturan baru.", getRulesSubMenuKeyboard(nil, 1)
		}
		const pageSize = 10
		totalPages := (len(rules) + pageSize - 1) / pageSize
		if pageNum > totalPages {
			pageNum = totalPages
		}
		start := (pageNum - 1) * pageSize
		end := start + pageSize
		if end > len(rules) {
			end = len(rules)
		}
		out := fmt.Sprintf("📜 <b>AUTO-REPLY RULES</b> — <code>%d Rules</code> | Hal <b>%d</b>/<b>%d</b>\n", len(rules), pageNum, totalPages)
		out += "<b>────────────────────</b>\n"
		for i := start; i < end; i++ {
			r := rules[i]
			statusIcon := "🟢"
			if !r.Enabled {
				statusIcon = "🔴"
			}
			trigType := string(r.TriggerType)
			switch r.TriggerType {
			case domainBot.TriggerContains:
				trigType = "mengandung"
			case domainBot.TriggerExact:
				trigType = "persis"
			case domainBot.TriggerStartsWith:
				trigType = "diawali"
			case domainBot.TriggerEndsWith:
				trigType = "diakhiri"
			}
			out += fmt.Sprintf("%s <b>%d.</b> <b>%s</b>\n   └ <code>%s</code> <i>(%s)</i>\n",
				statusIcon, i+1, r.Name, r.TriggerValue, trigType)
		}
		out += "<b>────────────────────</b>\n"
		out += "<i>Ketuk rule untuk melihat detail &amp; hapus.</i>"
		return out, getRulesSubMenuKeyboard(rules, pageNum)
	}

	if lower == "/help_addrule" {
		rules, _ := repo.ListRules(ctx, "")
		return "📜 <b>CARA MEMBUAT ATURAN BALAS OTOMATIS:</b>\n\nSalin &amp; isi perintah di bawah ini:\n<code>/addrule </code>\n\nFormat: <code>/addrule Nama|type|keyword|response</code>\nContoh: <code>/addrule CS|contains|harga|Harga produk Rp 50.000</code>", getRulesSubMenuKeyboard(rules, 1)
	}

	if lower == "/help_delrule" {
		rules, _ := repo.ListRules(ctx, "")
		return "🗑️ <b>CARA MENGHAPUS ATURAN AUTO-REPLY:</b>\n\nSalin &amp; isi perintah di bawah ini:\n<code>/delrule </code>\n\nContoh: <code>/delrule 1</code>", getRulesSubMenuKeyboard(rules, 1)
	}

	if strings.HasPrefix(lower, "/viewrule") {
		target := strings.TrimSpace(cmd[9:])
		rules, _ := repo.ListRules(ctx, "")
		if len(rules) == 0 {
			return "📜 Belum ada rule tersimpan.", getRulesSubMenuKeyboard(nil, 1)
		}
		idx, err := strconv.Atoi(target)
		if err != nil || idx < 1 || idx > len(rules) {
			return "⚠️ Nomor rule tidak valid.", getRulesSubMenuKeyboard(rules, 1)
		}
		r := rules[idx-1]
		statusBadge := "🟢 AKTIF"
		if !r.Enabled {
			statusBadge = "🔴 NONAKTIF"
		}
		toggleLabel := "🔴 Nonaktifkan"
		toggleCmd := fmt.Sprintf("/togglerule %d", idx)
		if !r.Enabled {
			toggleLabel = "🟢 Aktifkan"
		}
		out := fmt.Sprintf("📜 <b>DETAIL RULE #%d</b>\n\n"+
			"• Nama: <b>%s</b>\n"+
			"• ID: <code>%d</code> (UUID: <code>%s</code>)\n"+
			"• Status: <b>%s</b>\n"+
			"• Trigger: <code>%s</code> (%s)\n"+
			"• Respon: <i>%s</i>\n"+
			"• Dibalas: <b>%d×</b>",
			idx, r.Name, idx, shortID(r.ID), statusBadge, r.TriggerType, r.TriggerValue, r.ResponseText, r.TriggeredCount)
		kb := InlineKeyboardMarkup{
			InlineKeyboard: [][]InlineKeyboardButton{
				{
					{Text: toggleLabel, CallbackData: toggleCmd},
					{Text: fmt.Sprintf("🗑️ Hapus Rule #%d", idx), CallbackData: fmt.Sprintf("/delrule %d", idx)},
				},
				{
					{Text: "◀ Kembali ke Daftar", CallbackData: "/listrules 1"},
				},
			},
		}
		return out, kb
	}

	// /togglerule N — toggle enable/disable a rule
	if strings.HasPrefix(lower, "/togglerule") {
		target := strings.TrimSpace(cmd[11:])
		rules, _ := repo.ListRules(ctx, "")
		idx, err := strconv.Atoi(target)
		if err != nil || idx < 1 || idx > len(rules) {
			return "⚠️ Nomor rule tidak valid untuk toggle.", getRulesSubMenuKeyboard(rules, 1)
		}
		r := rules[idx-1]
		r.Enabled = !r.Enabled
		_, updateErr := repo.UpdateRule(ctx, r)
		if updateErr != nil {
			return "⚠️ Gagal mengubah status rule.", getRulesSubMenuKeyboard(rules, 1)
		}
		freshRules, _ := repo.ListRules(ctx, "")
		statusTxt := "🟢 DIAKTIFKAN"
		if !r.Enabled {
			statusTxt = "🔴 DINONAKTIFKAN"
		}
		return fmt.Sprintf("✅ <b>Rule #%d '%s' berhasil %s!</b>", idx, r.Name, statusTxt), getRulesSubMenuKeyboard(freshRules, 1)
	}

	if (strings.HasPrefix(lower, "/addrule ") || strings.HasPrefix(lower, "/addrule\n") || strings.HasPrefix(lower, "/addrule\r")) && len(cmd) > 8 {
		parts := strings.SplitN(strings.TrimSpace(cmd[8:]), "|", 4)
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
					newRule.Name, len(freshRules), newRule.TriggerValue, newRule.TriggerType, newRule.ResponseText), getRulesSubMenuKeyboard(freshRules, 1)
			}
		}
		rules, _ := repo.ListRules(ctx, "")
		return "⚠️ <b>Format Tambah Rule Salah!</b>\n\nFormat: <code>/addrule </code> Nama|type|keyword|response\nContoh: <code>/addrule CS|contains|harga|Harga produk Rp 50.000</code>", getRulesSubMenuKeyboard(rules, 1)
	}

	if strings.HasPrefix(lower, "/delrule") && len(strings.TrimSpace(cmd[8:])) > 0 {
		target := strings.TrimSpace(cmd[8:])
		rules, _ := repo.ListRules(ctx, "")
		if len(rules) == 0 {
			return "⚠️ <b>Belum ada rule auto-reply tersimpan.</b>", getRulesSubMenuKeyboard(nil, 1)
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
				return fmt.Sprintf("🗑️ <b>RULE #%s BERHASIL DIHAPUS!</b>", target), getRulesSubMenuKeyboard(freshRules, 1)
			}
		}
		freshRules, _ := repo.ListRules(ctx, "")
		return "⚠️ Gagal menghapus rule. ID/Indeks tidak ditemukan.", getRulesSubMenuKeyboard(freshRules, 1)
	}

	// ── 3. PESAN TERJADWAL SUB-MENU & CRUD ──
	if lower == "/listschedules" {
		list, err := repo.ListScheduledMessages(ctx, "")
		if err != nil || len(list) == 0 {
			return "⏰ <b>MANAJEMEN PESAN TERJADWAL WA</b>\n\n⚠️ <b>Belum ada Pesan Terjadwal WA.</b>\nKlik tombol <b>➕ Buat Jadwal Baru</b> di bawah ini.", getSchedulesSubMenuKeyboard(nil)
		}
		out := fmt.Sprintf("⏰ <b>DAFTAR PESAN TERJADWAL (%d MESSAGES):</b>\n\n", len(list))
		for i, m := range list {
			out += fmt.Sprintf("<b>%d. Jadwal #%d</b> (ID: <code>%s</code>) — Status: <b>%s</b>\n• WA: <code>%s</code>\n• Waktu Kirim: <code>%s</code>\n• Pesan: <i>%s</i>\n\n",
				i+1, i+1, shortID(m.ID), m.Status, m.Phone, m.SendAt.Format("02 Jan 2006 15:04 WIB"), m.Message)
		}
		out += "💡 <i>Salin cepat: <code>/addschedule </code> | <code>/delschedule </code></i>"
		return out, getSchedulesSubMenuKeyboard(list)
	}

	if lower == "/help_addschedule" {
		list, _ := repo.ListScheduledMessages(ctx, "")
		return "⏰ <b>CARA MEMBUAT PESAN TERJADWAL WA:</b>\n\nSalin &amp; isi perintah di bawah ini:\n<code>/addschedule </code>\n\nFormat: <code>/addschedule [nomor]|[durasi/waktu]|[pesan]</code>\nContoh: <code>/addschedule 6281234567890|30m|Ingatkan besok meeting</code>", getSchedulesSubMenuKeyboard(list)
	}

	if lower == "/help_delschedule" {
		list, _ := repo.ListScheduledMessages(ctx, "")
		return "🗑️ <b>CARA MENGHAPUS PESAN TERJADWAL:</b>\n\nSalin &amp; isi perintah di bawah ini:\n<code>/delschedule </code>", getSchedulesSubMenuKeyboard(list)
	}

	if strings.HasPrefix(lower, "/viewschedule") {
		target := strings.TrimSpace(cmd[13:])
		schedules, _ := repo.ListScheduledMessages(ctx, "")
		idx, err := strconv.Atoi(target)
		if err == nil && idx >= 1 && idx <= len(schedules) {
			s := schedules[idx-1]
			statusIcon := "⏳ PENDING"
			if s.Status == "sent" {
				statusIcon = "🟢 TERKIRIM"
			}
			out := fmt.Sprintf("⏰ <b>DETAIL PESAN TERJADWAL #%d</b>\n\n"+
				"• ID: <code>%d</code> (UUID: <code>%s</code>)\n"+
				"• Status: <b>%s</b>\n"+
				"• WA Tujuan: <code>%s</code>\n"+
				"• Waktu Kirim: <code>%s</code>\n"+
				"• Pesan: <i>%s</i>",
				idx, idx, shortID(s.ID), statusIcon, s.Phone, s.SendAt.Format("02 Jan 2006 15:04 WIB"), s.Message)
			return out, getSchedulesSubMenuKeyboard(schedules)
		}
	}

	if (strings.HasPrefix(lower, "/addschedule ") || strings.HasPrefix(lower, "/addschedule\n") || strings.HasPrefix(lower, "/addschedule\r")) && len(cmd) > 12 {
		parts := strings.SplitN(strings.TrimSpace(cmd[12:]), "|", 3)
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
				freshScheds, _ := repo.ListScheduledMessages(ctx, "")
				return fmt.Sprintf("⏰ <b>PESAN TERJADWAL BERHASIL DIBUAT!</b>\n\n• ID: <code>%d</code>\n• Tujuan: <code>%s</code>\n• Waktu Kirim: <code>%s</code>\n• Pesan: <i>%s</i>",
					len(freshScheds), res.Phone, res.SendAt.Format("02 Jan 2006 15:04 WIB"), res.Message), getSchedulesSubMenuKeyboard(freshScheds)
			}
		}
		list, _ := repo.ListScheduledMessages(ctx, "")
		return "⚠️ <b>Format Tambah Jadwal Salah!</b>\nFormat: <code>/addschedule </code> [nomor]|[10m/1h/ISO]|[pesan]", getSchedulesSubMenuKeyboard(list)
	}

	if strings.HasPrefix(lower, "/delschedule") && len(strings.TrimSpace(cmd[12:])) > 0 {
		target := strings.TrimSpace(cmd[12:])
		schedules, _ := repo.ListScheduledMessages(ctx, "")
		if len(schedules) == 0 {
			return "⚠️ <b>Belum ada pesan terjadwal tersimpan.</b>", getSchedulesSubMenuKeyboard(nil)
		}

		var targetID string
		idx, err := strconv.Atoi(target)
		if err == nil && idx >= 1 && idx <= len(schedules) {
			targetID = schedules[idx-1].ID
		} else {
			for _, s := range schedules {
				if strings.HasPrefix(s.ID, target) {
					targetID = s.ID
					break
				}
			}
		}

		if targetID != "" {
			if err := repo.DeleteScheduledMessage(ctx, targetID); err == nil {
				freshScheds, _ := repo.ListScheduledMessages(ctx, "")
				return fmt.Sprintf("🗑️ <b>JADWAL #%s BERHASIL DIHAPUS!</b>", target), getSchedulesSubMenuKeyboard(freshScheds)
			}
		}
		freshScheds, _ := repo.ListScheduledMessages(ctx, "")
		return "⚠️ Gagal menghapus jadwal. ID/Indeks tidak ditemukan.", getSchedulesSubMenuKeyboard(freshScheds)
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

	if (strings.HasPrefix(lower, "/mute ") || strings.HasPrefix(lower, "/mute\n") || strings.HasPrefix(lower, "/mute\r")) && len(cmd) > 5 {
		parts := strings.Fields(strings.TrimSpace(cmd[5:]))
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

	if (strings.HasPrefix(lower, "/unmute ") || strings.HasPrefix(lower, "/unmute\n") || strings.HasPrefix(lower, "/unmute\r")) && len(cmd) > 7 {
		targetPhone := strings.TrimSpace(cmd[7:])
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

	if (strings.HasPrefix(lower, "/setprompt ") || strings.HasPrefix(lower, "/setprompt\n") || strings.HasPrefix(lower, "/setprompt\r")) && len(cmd) > 10 {
		trimmed := strings.TrimSpace(cmd[10:])
		idx := strings.IndexAny(trimmed, " \n\r\t")
		if idx != -1 {
			targetPhone := strings.TrimSpace(trimmed[:idx])
			customPrompt := strings.TrimSpace(trimmed[idx:])
			if targetPhone != "" && customPrompt != "" {
				// Use atomic update - avoids race condition with full UpsertAIConfig
				if err := repo.SetCustomPrompt(ctx, targetPhone, customPrompt); err != nil {
					return fmt.Sprintf("⚠️ <b>Gagal menyimpan prompt untuk %s: %v</b>", targetPhone, err), getPromptsSubMenuKeyboard()
				}
				displayPrompt := customPrompt
				if len(displayPrompt) > 250 {
					displayPrompt = displayPrompt[:250] + "..."
				}
				return fmt.Sprintf("💖 <b>PROMPT KHUSUS BERHASIL DISIMPAN UNTUK %s!</b>\n\n<b>Panjang Prompt:</b> %d karakter\n<b>Pratinjau:</b> <i>%s</i>", targetPhone, len(customPrompt), displayPrompt), getPromptsSubMenuKeyboard()
			}
		}
	}

	if (strings.HasPrefix(lower, "/delprompt ") || strings.HasPrefix(lower, "/delprompt\n") || strings.HasPrefix(lower, "/delprompt\r")) && len(cmd) > 10 {
		targetPhone := strings.TrimSpace(cmd[10:])
		// Use atomic update - avoids race condition with full UpsertAIConfig
		_ = repo.DeleteCustomPrompt(ctx, targetPhone)
		return fmt.Sprintf("🗑️ <b>PROMPT KHUSUS UNTUK %s BERHASIL DIHAPUS.</b>", targetPhone), getPromptsSubMenuKeyboard()
	}

	if lower == "/help_clearmemory" {
		return "🧹 <b>CARA MENGHAPUS RIWAYAT CHAT (LONG-TERM MEMORY) AI:</b>\n\n"+
			"Salin &amp; isi perintah di bawah ini:\n"+
			"<code>/clearmemory </code> [nomor|all]\n\n"+
			"• Hapus 1 kontak: <code>/clearmemory 6282392115909</code>\n"+
			"• Hapus SEMUA memori: <code>/clearmemory all</code>", getPromptsSubMenuKeyboard()
	}

	if (strings.HasPrefix(lower, "/clearmemory ") || strings.HasPrefix(lower, "/clearmemory\n") || strings.HasPrefix(lower, "/clearmemory\r") || strings.HasPrefix(lower, "/clearmemory")) && len(cmd) >= 11 {
		targetPhone := strings.TrimSpace(cmd[11:])
		if targetPhone == "" {
			return "⚠️ <b>Format Perintah Salah!</b>\nContoh: <code>/clearmemory 6282392115909</code> atau <code>/clearmemory all</code>", getPromptsSubMenuKeyboard()
		}
		if err := repo.ClearChatHistory(ctx, targetPhone); err != nil {
			return fmt.Sprintf("⚠️ <b>Gagal menghapus riwayat chat: %v</b>", err), getPromptsSubMenuKeyboard()
		}
		if targetPhone == "all" {
			return "🧹 <b>SELURUH RIWAYAT CHAT MEMORY AI BERHASIL DIHAPUS/RESET!</b>", getPromptsSubMenuKeyboard()
		}
		return fmt.Sprintf("🧹 <b>RIWAYAT CHAT MEMORY AI UNTUK %s BERHASIL DIHAPUS/RESET!</b>", targetPhone), getPromptsSubMenuKeyboard()
	}

	if lower == "/viewknowledge" {
		kbText := cfg.KnowledgeBase
		if kbText == "" {
			kbText = "<i>Belum ada Basis Pengetahuan / Data Toko yang diset.</i>\n\nSalin cepat: <code>/setknowledge </code> untuk mengisinya."
		}
		return "📚 <b>BASIS PENGETAHUAN / DATA TOKO:</b>\n\n" + kbText, getMainMenuKeyboard()
	}

	if (strings.HasPrefix(lower, "/setknowledge ") || strings.HasPrefix(lower, "/setknowledge\n") || strings.HasPrefix(lower, "/setknowledge\r")) && len(cmd) > 13 {
		newKnowledge := strings.TrimSpace(cmd[13:])
		cfg.KnowledgeBase = newKnowledge
		_, _ = repo.UpsertAIConfig(ctx, *cfg)
		return "📚 <b>BASIS PENGETAHUAN / DATA TOKO BERHASIL DIPERBARUI!</b>", getMainMenuKeyboard()
	}

	if (strings.HasPrefix(lower, "/setmodel ") || strings.HasPrefix(lower, "/setmodel\n") || strings.HasPrefix(lower, "/setmodel\r")) && len(cmd) > 9 {
		modelName := strings.TrimSpace(cmd[9:])
		if modelName != "" {
			cfg.Model = modelName
			_, _ = repo.UpsertAIConfig(ctx, *cfg)
			return fmt.Sprintf("🧠 <b>MODEL GROQ BERHASIL DIUBAH KE:</b> <code>%s</code>", modelName), getMainMenuKeyboard()
		}
	}

	// Telegram Bot is strictly for Admin Control — no AI natural replies on Telegram
	return "⚠️ <b>Perintah tidak dikenali.</b> Silakan gunakan menu kontrol di bawah ini atau ketik <code>/start</code>.", getMainMenuKeyboard()
}
