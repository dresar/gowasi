package uiasset

import (
	_ "embed"
)

//go:embed index.html
var defaultUIHTML []byte

// DefaultUI returns the built-in 10-page AI dashboard HTML.
func DefaultUI() []byte {
	return defaultUIHTML
}
