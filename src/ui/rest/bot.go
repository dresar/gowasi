package rest

import (
	domainBot "github.com/aldinokemal/go-whatsapp-web-multidevice/domains/bot"
	"github.com/aldinokemal/go-whatsapp-web-multidevice/pkg/utils"
	"github.com/gofiber/fiber/v3"
)

type BotHandler struct {
	Repo domainBot.IBotRepository
}

func InitRestBot(app fiber.Router, repo domainBot.IBotRepository) BotHandler {
	handler := BotHandler{Repo: repo}

	app.Get("/bot/rules", handler.ListRules)
	app.Post("/bot/rules", handler.CreateRule)
	app.Put("/bot/rules/:id", handler.UpdateRule)
	app.Delete("/bot/rules/:id", handler.DeleteRule)

	app.Get("/bot/ai-config", handler.GetAIConfig)
	app.Post("/bot/ai-config", handler.SaveAIConfig)

	app.Get("/bot/logs", handler.ListLogs)

	return handler
}

func (h *BotHandler) ListRules(c fiber.Ctx) error {
	if h.Repo == nil {
		return c.JSON(utils.ResponseData{
			Status:  200,
			Code:    "SUCCESS",
			Message: "Bot repository disabled",
			Results: []domainBot.AutoReplyRule{},
		})
	}
	deviceID := c.Query("device_id", "")
	rules, err := h.Repo.ListRules(c.Context(), deviceID)
	if err != nil {
		return c.Status(500).JSON(utils.ResponseData{
			Status:  500,
			Code:    "INTERNAL_SERVER_ERROR",
			Message: err.Error(),
		})
	}
	if rules == nil {
		rules = []domainBot.AutoReplyRule{}
	}
	return c.JSON(utils.ResponseData{
		Status:  200,
		Code:    "SUCCESS",
		Message: "Success get auto-reply rules",
		Results: rules,
	})
}

func (h *BotHandler) CreateRule(c fiber.Ctx) error {
	if h.Repo == nil {
		return c.Status(400).JSON(utils.ResponseData{
			Status:  400,
			Code:    "DISABLED",
			Message: "Bot repository disabled",
		})
	}
	var rule domainBot.AutoReplyRule
	if err := c.Bind().Body(&rule); err != nil {
		return c.Status(400).JSON(utils.ResponseData{
			Status:  400,
			Code:    "BAD_REQUEST",
			Message: err.Error(),
		})
	}
	created, err := h.Repo.CreateRule(c.Context(), rule)
	if err != nil {
		return c.Status(500).JSON(utils.ResponseData{
			Status:  500,
			Code:    "INTERNAL_SERVER_ERROR",
			Message: err.Error(),
		})
	}
	return c.JSON(utils.ResponseData{
		Status:  200,
		Code:    "SUCCESS",
		Message: "Rule created successfully",
		Results: created,
	})
}

func (h *BotHandler) UpdateRule(c fiber.Ctx) error {
	if h.Repo == nil {
		return c.Status(400).JSON(utils.ResponseData{
			Status:  400,
			Code:    "DISABLED",
			Message: "Bot repository disabled",
		})
	}
	id := c.Params("id")
	var rule domainBot.AutoReplyRule
	if err := c.Bind().Body(&rule); err != nil {
		return c.Status(400).JSON(utils.ResponseData{
			Status:  400,
			Code:    "BAD_REQUEST",
			Message: err.Error(),
		})
	}
	rule.ID = id
	updated, err := h.Repo.UpdateRule(c.Context(), rule)
	if err != nil {
		return c.Status(500).JSON(utils.ResponseData{
			Status:  500,
			Code:    "INTERNAL_SERVER_ERROR",
			Message: err.Error(),
		})
	}
	return c.JSON(utils.ResponseData{
		Status:  200,
		Code:    "SUCCESS",
		Message: "Rule updated successfully",
		Results: updated,
	})
}

func (h *BotHandler) DeleteRule(c fiber.Ctx) error {
	if h.Repo == nil {
		return c.Status(400).JSON(utils.ResponseData{
			Status:  400,
			Code:    "DISABLED",
			Message: "Bot repository disabled",
		})
	}
	id := c.Params("id")
	if err := h.Repo.DeleteRule(c.Context(), id); err != nil {
		return c.Status(500).JSON(utils.ResponseData{
			Status:  500,
			Code:    "INTERNAL_SERVER_ERROR",
			Message: err.Error(),
		})
	}
	return c.JSON(utils.ResponseData{
		Status:  200,
		Code:    "SUCCESS",
		Message: "Rule deleted successfully",
	})
}

func (h *BotHandler) GetAIConfig(c fiber.Ctx) error {
	if h.Repo == nil {
		return c.JSON(utils.ResponseData{
			Status:  200,
			Code:    "SUCCESS",
			Message: "Bot repository disabled",
			Results: nil,
		})
	}
	deviceID := c.Query("device_id", "")
	cfg, err := h.Repo.GetAIConfig(c.Context(), deviceID)
	if err != nil {
		return c.Status(500).JSON(utils.ResponseData{
			Status:  500,
			Code:    "INTERNAL_SERVER_ERROR",
			Message: err.Error(),
		})
	}
	return c.JSON(utils.ResponseData{
		Status:  200,
		Code:    "SUCCESS",
		Message: "Success get AI config",
		Results: cfg,
	})
}

func (h *BotHandler) SaveAIConfig(c fiber.Ctx) error {
	if h.Repo == nil {
		return c.Status(400).JSON(utils.ResponseData{
			Status:  400,
			Code:    "DISABLED",
			Message: "Bot repository disabled",
		})
	}
	var cfg domainBot.AIConfig
	if err := c.Bind().Body(&cfg); err != nil {
		return c.Status(400).JSON(utils.ResponseData{
			Status:  400,
			Code:    "BAD_REQUEST",
			Message: err.Error(),
		})
	}
	saved, err := h.Repo.UpsertAIConfig(c.Context(), cfg)
	if err != nil {
		return c.Status(500).JSON(utils.ResponseData{
			Status:  500,
			Code:    "INTERNAL_SERVER_ERROR",
			Message: err.Error(),
		})
	}
	return c.JSON(utils.ResponseData{
		Status:  200,
		Code:    "SUCCESS",
		Message: "AI config saved successfully",
		Results: saved,
	})
}

func (h *BotHandler) ListLogs(c fiber.Ctx) error {
	if h.Repo == nil {
		return c.JSON(utils.ResponseData{
			Status:  200,
			Code:    "SUCCESS",
			Message: "Bot repository disabled",
			Results: []domainBot.ActivityLog{},
		})
	}
	deviceID := c.Query("device_id", "")
	limit := fiber.Query[int](c, "limit", 100)
	logs, err := h.Repo.ListLogs(c.Context(), deviceID, limit)
	if err != nil {
		return c.Status(500).JSON(utils.ResponseData{
			Status:  500,
			Code:    "INTERNAL_SERVER_ERROR",
			Message: err.Error(),
		})
	}
	if logs == nil {
		logs = []domainBot.ActivityLog{}
	}
	return c.JSON(utils.ResponseData{
		Status:  200,
		Code:    "SUCCESS",
		Message: "Success get bot logs",
		Results: logs,
	})
}
