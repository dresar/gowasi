package botrepo

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"

	domainBot "github.com/aldinokemal/go-whatsapp-web-multidevice/domains/bot"
	"github.com/sirupsen/logrus"
	"go.mau.fi/whatsmeow"
	waProto "go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"google.golang.org/protobuf/proto"
)

var (
	processedMu  sync.Mutex
	processedIDs = make(map[string]time.Time)
)

func markProcessed(id string) bool {
	processedMu.Lock()
	defer processedMu.Unlock()

	now := time.Now()
	for k, t := range processedIDs {
		if now.Sub(t) > 10*time.Minute {
			delete(processedIDs, k)
		}
	}

	if _, ok := processedIDs[id]; ok {
		return false
	}
	processedIDs[id] = now
	return true
}

var (
	cooldownMu    sync.Mutex
	cooldownTimes = make(map[string]time.Time)
)

func checkAndSetCooldown(phone string, cooldownMs int) bool {
	cooldownMu.Lock()
	defer cooldownMu.Unlock()

	minInterval := time.Duration(cooldownMs) * time.Millisecond
	if minInterval < 1500*time.Millisecond {
		minInterval = 1500 * time.Millisecond
	}

	if last, ok := cooldownTimes[phone]; ok {
		if time.Since(last) < minInterval {
			return false
		}
	}
	cooldownTimes[phone] = time.Now()
	return true
}

func ProcessMessage(
	ctx context.Context,
	msgID string,
	from string, // full JID: 628xxx@s.whatsapp.net
	isGroup bool,
	text string,
	repo domainBot.IBotRepository,
	client *whatsmeow.Client,
) {
	if text == "" || from == "" {
		return
	}

	if !markProcessed(msgID) {
		logrus.Debugf("[BOT] skipping already-processed message %s", msgID)
		return
	}

	deviceID := ""
	if client != nil && client.Store != nil && client.Store.ID != nil {
		deviceID = client.Store.ID.ToNonAD().String()
	}

	rules, err := repo.ListRules(ctx, deviceID)
	if err != nil {
		logrus.Errorf("[BOT] ListRules error: %v", err)
		return
	}

	aiCfg, err := repo.GetAIConfig(ctx, deviceID)
	if err != nil || aiCfg == nil {
		if globalCfg, gErr := repo.GetAIConfig(ctx, ""); gErr == nil && globalCfg != nil {
			aiCfg = globalCfg
		} else {
			defaultCfg := defaultAIConfig(deviceID)
			aiCfg = &defaultCfg
		}
	}

	phone := stripJID(from)

	// ── 1. Auto-reply Rules ──────────────────────────────────────────────────
	for _, rule := range rules {
		if !rule.Enabled {
			continue
		}
		if isGroup && rule.OnlyPrivate {
			continue
		}
		if !isGroup && rule.OnlyGroups {
			continue
		}
		if !numberAllowed(phone, from, rule.AllowedNumbers, rule.BlockedNumbers) {
			continue
		}
		if !matchesTrigger(text, rule.TriggerType, rule.TriggerValue, rule.CaseSensitive) {
			continue
		}

		if !checkAndSetCooldown(from, 1500) {
			logrus.Debugf("[BOT] auto-reply cooldown active for %s", from)
			return
		}

		logrus.Infof("[BOT] auto-reply rule '%s' matched for %s (text: %q)", rule.Name, from, text)

		responses := []string{}
		if rule.ResponseText != "" {
			responses = append(responses, rule.ResponseText)
		}
		responses = append(responses, rule.AdditionalTexts...)

		// Trigger typing presence indicator ("mengetik...")
		sendTypingPresence(client, from, types.ChatPresenceComposing)

		for i, respText := range responses {
			delay := time.Duration(rule.ResponseDelayMs)*time.Millisecond + time.Duration(i)*800*time.Millisecond
			if delay < 800*time.Millisecond {
				delay = 800 * time.Millisecond
			}
			capturedText := respText
			capturedRule := rule
			isLast := i == len(responses)-1
			go func() {
				time.Sleep(delay)
				if err := sendTextMessage(client, from, capturedText); err != nil {
					logrus.Errorf("[BOT] send auto-reply failed to %s: %v", from, err)
					sendTypingPresence(client, from, types.ChatPresencePaused)
					_ = repo.AddLog(ctx, domainBot.ActivityLog{
						DeviceID: deviceID,
						Type:     "auto_reply",
						Phone:    from,
						Message:  capturedText,
						Status:   "failed",
						RuleID:   capturedRule.ID,
						Error:    err.Error(),
					})
					return
				}
				if isLast {
					sendTypingPresence(client, from, types.ChatPresencePaused)
				}
				logrus.Infof("[BOT] sent auto-reply to %s: %q", from, capturedText)
				if i == 0 {
					_ = repo.IncrementRuleStat(ctx, capturedRule.ID)
				}
				_ = repo.AddLog(ctx, domainBot.ActivityLog{
					DeviceID: deviceID,
					Type:     "auto_reply",
					Phone:    from,
					Message:  capturedText,
					Status:   "success",
					RuleID:   capturedRule.ID,
				})
			}()
		}
		return // STOP – first matching rule wins
	}

	// ── 2. AI Fallback (Runs for ALL chats when no Auto-Reply rule matches) ──
	if !aiCfg.Enabled {
		logrus.Infof("[BOT] no auto-reply matched and AI is disabled for %s", from)
		return
	}
	if isGroup && !aiCfg.ReplyToGroups {
		return
	}
	if !isGroup && !aiCfg.ReplyToPrivate {
		return
	}
	if aiCfg.TriggerKeyword != "" && !strings.Contains(strings.ToLower(text), strings.ToLower(aiCfg.TriggerKeyword)) {
		return
	}
	if !numberAllowed(phone, from, aiCfg.AllowedNumbers, aiCfg.BlockedNumbers) {
		return
	}
	if !checkAndSetCooldown("ai_"+from, aiCfg.CooldownMs) {
		logrus.Debugf("[BOT] AI cooldown active for %s", from)
		return
	}

	logrus.Infof("[BOT] falling back to AI Assistant for %s (text: %q)", from, text)

	// Send typing presence while AI thinks
	sendTypingPresence(client, from, types.ChatPresenceComposing)

	go func() {
		defer sendTypingPresence(client, from, types.ChatPresencePaused)

		reply, err := callAI(ctx, aiCfg, text, phone)
		if err != nil || reply == "" {
			logrus.Errorf("[BOT] AI reply error for %s: %v", from, err)
			_ = repo.AddLog(ctx, domainBot.ActivityLog{
				DeviceID: deviceID,
				Type:     "ai_reply",
				Phone:    from,
				Message:  text,
				Status:   "failed",
				Error:    fmt.Sprintf("%v", err),
			})
			return
		}
		if err := sendTextMessage(client, from, reply); err != nil {
			logrus.Errorf("[BOT] send AI reply failed to %s: %v", from, err)
			return
		}
		logrus.Infof("[BOT] sent AI reply to %s: %q", from, reply)
		_ = repo.AddLog(ctx, domainBot.ActivityLog{
			DeviceID: deviceID,
			Type:     "ai_reply",
			Phone:    from,
			Message:  reply,
			Status:   "success",
		})
	}()
}

func sendTypingPresence(client *whatsmeow.Client, to string, state types.ChatPresence) {
	if client == nil {
		return
	}
	jid, err := parseJID(to)
	if err != nil {
		return
	}
	_ = client.SendChatPresence(context.Background(), jid, state, types.ChatPresenceMedia(""))
}

func matchesTrigger(text string, trigType domainBot.TriggerType, value string, caseSensitive bool) bool {
	if text == "" || value == "" {
		return false
	}
	t := strings.TrimSpace(text)
	v := strings.TrimSpace(value)
	if !caseSensitive {
		t = strings.ToLower(t)
		v = strings.ToLower(v)
	}

	// Handle common Indonesian typos (e.g., assalamualikum vs assalamualaikum)
	if strings.Contains(v, "assalam") && strings.Contains(t, "assalam") {
		return true
	}

	punct := ".,/#!$%^&*;:{}=-_`~()?"
	cleanT := strings.TrimRight(t, punct)
	cleanV := strings.TrimRight(v, punct)

	switch trigType {
	case domainBot.TriggerExact:
		return t == v || cleanT == cleanV
	case domainBot.TriggerContains:
		return strings.Contains(t, v) || strings.Contains(cleanT, cleanV)
	case domainBot.TriggerStartsWith:
		return strings.HasPrefix(t, v) || strings.HasPrefix(cleanT, cleanV)
	case domainBot.TriggerEndsWith:
		return strings.HasSuffix(t, v) || strings.HasSuffix(cleanV, cleanV)
	case domainBot.TriggerRegex:
		flags := "(?i)"
		if caseSensitive {
			flags = ""
		}
		re, err := regexp.Compile(flags + value)
		if err != nil {
			return false
		}
		return re.MatchString(text)
	}
	return false
}

func numberAllowed(phone, from string, allowed, blocked []string) bool {
	phone = strings.TrimSpace(phone)
	nowISO := time.Now().UTC().Format(time.RFC3339)

	for _, b := range blocked {
		b = strings.TrimSpace(b)
		if b == "" {
			continue
		}
		// Support format: "phone|expirationISO" or plain "phone"
		parts := strings.Split(b, "|")
		blockedNum := strings.TrimSpace(parts[0])
		if blockedNum != "" && (strings.Contains(from, blockedNum) || strings.Contains(phone, blockedNum)) {
			if len(parts) > 1 {
				expireISO := strings.TrimSpace(parts[1])
				if expireISO != "" && nowISO > expireISO {
					// Timed mute expired! Resume AI.
					continue
				}
			}
			return false
		}
	}

	if len(allowed) == 0 {
		return true
	}
	for _, a := range allowed {
		a = strings.TrimSpace(a)
		if a != "" && (strings.Contains(from, a) || strings.Contains(phone, a)) {
			return true
		}
	}
	return false
}

func sendTextMessage(client *whatsmeow.Client, to, text string) error {
	if client == nil {
		return fmt.Errorf("whatsapp client is nil")
	}
	jid, err := parseJID(to)
	if err != nil {
		return err
	}
	msg := &waProto.Message{
		Conversation: proto.String(text),
	}
	_, err = client.SendMessage(context.Background(), jid, msg)
	return err
}

func parseJID(s string) (types.JID, error) {
	if !strings.Contains(s, "@") {
		return types.NewJID(s, types.DefaultUserServer), nil
	}
	jid, err := types.ParseJID(s)
	if err != nil {
		return jid, err
	}
	return jid.ToNonAD(), nil
}


func callAI(ctx context.Context, cfg *domainBot.AIConfig, userMessage, senderPhone string) (string, error) {
	if cfg == nil {
		return "", nil
	}

	// ── AGENTIC AI SKILLS & REALTIME CONTEXT INGESTION ──
	loc, err := time.LoadLocation("Asia/Jakarta")
	if err != nil || loc == nil {
		loc = time.FixedZone("WIB", 7*3600)
	}
	now := time.Now().In(loc)

	days := []string{"Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"}
	months := []string{"", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"}

	timeContext := fmt.Sprintf("[WAKTU & SKILL SYSTEM REAL-TIME]:\n- Waktu Saat Ini: %s, %d %s %d Pukul %02d:%02d WIB\n- Status Operational: Online & Siap Melayani",
		days[now.Weekday()], now.Day(), months[now.Month()], now.Year(), now.Hour(), now.Minute())

	systemPrompt := cfg.SystemPrompt

	// ── Normalize phone for custom prompt lookup ──
	normalizedPhone := stripJID(senderPhone)

	// ── 1. Custom Prompt lookup (checked FIRST — overrides everything incl. admin) ──
	// If a custom prompt is explicitly set for this contact, use it as the persona.
	customPromptFound := ""
	if cfg.CustomNumberPrompts != nil {
		// Strategy 1: exact match
		for _, tryPhone := range []string{normalizedPhone, senderPhone} {
			if p, ok := cfg.CustomNumberPrompts[tryPhone]; ok && strings.TrimSpace(p) != "" {
				customPromptFound = strings.TrimSpace(p)
				break
			}
		}
		// Strategy 2: substring / suffix match (handles missing country code digits)
		if customPromptFound == "" {
			for storedPhone, p := range cfg.CustomNumberPrompts {
				storedClean := stripJID(storedPhone)
				if storedClean == "" || strings.TrimSpace(p) == "" {
					continue
				}
				if strings.Contains(normalizedPhone, storedClean) || strings.Contains(storedClean, normalizedPhone) {
					customPromptFound = strings.TrimSpace(p)
					break
				}
				// Suffix match: last 9+ digits — handles "62392115909" vs "6282392115909"
				const minSuffix = 9
				if len(storedClean) >= minSuffix && len(normalizedPhone) >= minSuffix {
					sfxLen := len(storedClean)
					if sfxLen > len(normalizedPhone) {
						sfxLen = len(normalizedPhone)
					}
					if strings.HasSuffix(normalizedPhone, storedClean[len(storedClean)-sfxLen:]) ||
						strings.HasSuffix(storedClean, normalizedPhone[len(normalizedPhone)-sfxLen:]) {
						customPromptFound = strings.TrimSpace(p)
						break
					}
				}
			}
		}
	}

	if customPromptFound != "" {
		// Custom persona explicitly set → use it as full system prompt
		logrus.Infof("[BOT] Custom prompt applied for %s", normalizedPhone)
		systemPrompt = fmt.Sprintf("[PERAN & INSTRUKSI KHUSUS UNTUK KONTAK %s]:\n%s\n\n"+
			"PENTING: Kamu WAJIB memerankan karakter di atas secara PENUH dan KONSISTEN. "+
			"Jangan pernah keluar dari peran ini, jangan mengaku sebagai AI atau bot, "+
			"jawab selalu sesuai karakter yang diperintahkan.",
			normalizedPhone, customPromptFound)
	}

	if systemPrompt == "" {
		systemPrompt = "Kamu adalah asisten WhatsApp yang ramah, santai, manusiawi, dan solutif. Jawab pertanyaan pengguna secara akurat, lugas, dan mudah dipahami dalam Bahasa Indonesia."
	}

	systemPrompt = timeContext + "\n\n" + systemPrompt

	if cfg.KnowledgeBase != "" {
		systemPrompt += "\n\n[BASIS PENGETAHUAN / DATA TOKO BISNIS]:\n" + cfg.KnowledgeBase
	}

	// Agentic Skills System Instructions
	systemPrompt += "\n\n[PETUNJUK AI SKILLS HERMES AGENT & BAHASA MANUSIA]:\n" +
		"1. SKILL BAHASA NON-FORMAL & MANUSIAWI: Sebelum membalas, pahami konteks obrolan. Berpikirlah secara logis dan bernalar. Gunakan bahasa sehari-hari yang santai, alami, manusiawi, ramah, dan tidak kaku seperti robot.\n" +
		"2. SKILL JADWAL & PENGINGAT: Jika pengirim meminta dibuatkan jadwal, janji, atau pengingat (contoh: 'ingatkan saya besok jam 8 pagi'), buatkan jadwal dan konfirmasi secara ramah.\n" +
		"3. SKILL WAKTU: Gunakan info waktu real-time jika pengirim bertanya jam, hari, atau tanggal.\n" +
		"4. SKILL KALKULATOR: Hitung harga dan total pesanan secara akurat jika dibutuhkan.\n" +
		"5. Jawab pesan secara langsung, natural, akrab, dan mudah dipahami."

	switch cfg.Provider {
	case domainBot.AIProviderGroq, "gemini":
		return callGroq(ctx, cfg.APIKey, cfg.Model, systemPrompt, userMessage, cfg.MaxTokens, cfg.Temperature)
	case domainBot.AIProviderCustom:
		return callCustom(ctx, cfg.APIKey, cfg.CustomURL, cfg.Model, systemPrompt, userMessage, cfg.MaxTokens, cfg.Temperature)
	case domainBot.AIProviderOllama:
		return callOllama(ctx, cfg.OllamaURL, cfg.Model, systemPrompt, userMessage)
	default:
		return callGroq(ctx, cfg.APIKey, cfg.Model, systemPrompt, userMessage, cfg.MaxTokens, cfg.Temperature)
	}
}

func parseGroqKeys(apiKeyRaw string) []string {
	var keys []string
	seen := make(map[string]bool)

	f := func(c rune) bool {
		return c == '\n' || c == '\r' || c == ',' || c == ';' || c == ' '
	}
	parts := strings.FieldsFunc(apiKeyRaw, f)

	for _, p := range parts {
		p = strings.TrimSpace(p)
		if idx := strings.Index(p, "gsk_"); idx != -1 {
			k := p[idx:]
			if secondIdx := strings.Index(k[4:], "gsk_"); secondIdx != -1 {
				k = k[:4+secondIdx]
			}
			if len(k) >= 20 && !seen[k] {
				seen[k] = true
				keys = append(keys, k)
			}
		} else if len(p) >= 20 && !seen[p] {
			seen[p] = true
			keys = append(keys, p)
		}
	}

	return keys
}

func callGroq(ctx context.Context, apiKey, model, systemPrompt, userMessage string, maxTokens int, temperature float64) (string, error) {
	if apiKey == "" {
		apiKey = os.Getenv("GROQ_API_KEY")
	}
	if model == "" {
		model = "llama-3.3-70b-versatile"
	}
	keys := parseGroqKeys(apiKey)
	if len(keys) == 0 {
		return "", fmt.Errorf("Groq API Key is empty. Please enter your Groq API Key starting with gsk_...")
	}

	var lastErr error
	for i, k := range keys {
		res, err := callGroqSingle(ctx, k, model, systemPrompt, userMessage, maxTokens, temperature)
		if err == nil && res != "" {
			if i > 0 {
				logrus.Infof("[BOT_GROQ] Key #%d rotated successfully!", i+1)
			}
			return res, nil
		}
		logrus.Warnf("[BOT_GROQ] Groq Key #%d failed: %v. Rotating to key #%d...", i+1, err, i+2)
		lastErr = err
	}
	return "", fmt.Errorf("All %d Groq API Key(s) failed. Last error: %w", len(keys), lastErr)
}

func callGroqSingle(ctx context.Context, apiKey, model, systemPrompt, userMessage string, maxTokens int, temperature float64) (string, error) {
	endpoint := "https://api.groq.com/openai/v1/chat/completions"
	body := map[string]any{
		"model": model,
		"messages": []map[string]any{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userMessage},
		},
		"max_tokens":  maxTokens,
		"temperature": temperature,
	}
	b, _ := json.Marshal(body)

	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("Groq HTTP error: %w", err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Error *struct {
			Message string `json:"message"`
			Type    string `json:"type"`
			Code    string `json:"code"`
		} `json:"error"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return "", fmt.Errorf("Groq json parse error: %w (raw response: %s)", err, string(data))
	}
	if result.Error != nil {
		return "", fmt.Errorf("Groq API Error (%s): %s", result.Error.Code, result.Error.Message)
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("Groq returned empty response")
	}
	return result.Choices[0].Message.Content, nil
}

func callCustom(ctx context.Context, apiKey, endpoint, model, systemPrompt, userMessage string, maxTokens int, temperature float64) (string, error) {
	if endpoint == "" {
		endpoint = "https://api.openai.com/v1/chat/completions"
	}
	body := map[string]any{
		"model": model,
		"messages": []map[string]any{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userMessage},
		},
		"max_tokens":  maxTokens,
		"temperature": temperature,
	}
	b, _ := json.Marshal(body)

	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+apiKey)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Error *struct{ Message string `json:"message"` } `json:"error"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return "", err
	}
	if result.Error != nil {
		return "", fmt.Errorf("custom AI error: %s", result.Error.Message)
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("custom AI returned empty response")
	}
	return result.Choices[0].Message.Content, nil
}

func callOllama(ctx context.Context, ollamaURL, model, systemPrompt, userMessage string) (string, error) {
	if ollamaURL == "" {
		ollamaURL = "http://localhost:11434"
	}
	if model == "" {
		model = "llama3.2"
	}
	body := map[string]any{
		"model": model,
		"messages": []map[string]any{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userMessage},
		},
		"stream": false,
	}
	b, _ := json.Marshal(body)

	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, ollamaURL+"/api/chat", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)

	var result struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return "", err
	}
	return result.Message.Content, nil
}
