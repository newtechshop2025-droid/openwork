# 9Router Model Diagnostics & Integration Guide

This document describes how OpenWork apps can configure and use the **9Router** API gateway, explains the key constraints (such as case sensitivity and active credentials), and lists the working status of all tested models.

---

## 1. How Apps Can Use 9Router

To consume 9Router inside OpenWork, follow these steps:

### A. Add/Configure 9Router Connection in the UI
1. Click the model dropdown picker or open the **Settings -> Connections** pane.
2. Select **9Router** from the list of providers.
3. Enter your **9Router API Key** (must start with `sk-4d...`).
4. Enter the **API Endpoint**: `https://9router.openit.vn/v1` (without trailing slashes).
5. Submit to save the credentials.

### B. Workspace Configuration (`opencode.json`)
When credentials are saved, OpenWork automatically registers the provider and its models in your project configuration file (located at `.opencode/opencode.json` under your workspace root).

Here is the configuration pattern used to register 9Router with custom model mappings:

```json
{
  "provider": {
    "9router": {
      "name": "9Router",
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "https://9router.openit.vn/v1"
      },
      "models": {
        "gemini-cli/gemini-2.5-pro": {
          "name": "Gemini 2.5 Pro (gemini-cli)"
        },
        "gemini-cli/gemini-3-flash-preview": {
          "name": "Gemini 3 Flash Preview (gemini-cli)"
        },
        "gemini-cli/gemini-3.1-pro-preview": {
          "name": "Gemini 3.1 Pro Preview (gemini-cli)"
        }
      }
    }
  }
}
```

### C. Trigger Daemon Engine Reload (Critical Step)
If you manually edit `.opencode/opencode.json` or update it through scripts, the running OpenCode daemon container might not detect file changes because of virtual mount boundaries. You **MUST** trigger an engine reload:
* In the UI, click **Reload Engine** on the connection state banner.
* Or programmatically send a `POST` request to `http://<workspace-endpoint>/engine/reload` with the local auth token.

---

## 2. Key Findings & Troubleshooting

### ⚠️ Case Sensitivity Constraint
The 9Router gateway uses case-sensitive matching for custom providers.
* **`gemini-cli/*` (Lowercase)**: ✅ Works. Successfully authenticates with your active credentials.
* **`Gemini-Cli/*` (PascalCase)**: ❌ Fails. Returns `404 - No active credentials for provider: Gemini-Cli`.

### 💰 Quota & Active Credentials
Ensure that the custom provider is configured and has green/active credentials in the 9Router gateway dashboard. 
* Testing `openai/*`, `google/*`, and `anthropic/*` directly through 9Router fails if those providers do not have active credentials linked on your dashboard.
* DeepSeek models are currently failing due to `402 - Insufficient Balance` on the underlying provider.

---

## 3. Model Status Checklist

We tested 24 models against your active 9Router credentials. Here is the exact status of each model:

| Model ID | Provider Name | Status | Details / Response Snippet |
| :--- | :--- | :--- | :--- |
| **`gemini-cli/gemini-2.5-pro`** | Gemini-Cli (9Router) | **✅ WORKING** | `"Hi. What do?"` (3.48s) |
| **`gemini-cli/gemini-3-flash-preview`** | Gemini-Cli (9Router) | **✅ WORKING** | `"Hello! How can I help you today?"` (2.69s) |
| **`gemini-cli/gemini-3-pro-preview`** | Gemini-Cli (9Router) | **✅ WORKING** | `"Hi there! How can I help you today?"` (2.36s) |
| **`gemini-cli/gemini-2.5-flash`** | Gemini-Cli (9Router) | **✅ WORKING** | `"Hello! How can I help you today?"` (1.82s) |
| **`gemini-cli/gemini-2.5-flash-lite`** | Gemini-Cli (9Router) | **✅ WORKING** | `"Hello! How can I help you today?"` (1.18s) |
| **`gemini-cli/gemini-3.1-flash-lite`** | Gemini-Cli (9Router) | **✅ WORKING** | `"Hello! How can I help you today?"` (1.39s) |
| **`gemini-cli/gemini-3.1-flash-lite-preview`** | Gemini-Cli (9Router) | **✅ WORKING** | `"Hello! How can I help you today?"` (1.79s) |
| **`gemini-cli/gemini-3.1-pro-preview`** | Gemini-Cli (9Router) | **✅ WORKING** | `"Hello! How can I help you today?"` (2.22s) |
| `Gemini-Cli/gemini-2.5-pro` | Gemini-Cli (PascalCase) | ❌ Failed | `No active credentials for provider: Gemini-Cli` |
| `Gemini-Cli/gemini-3-flash-preview` | Gemini-Cli (PascalCase) | ❌ Failed | `No active credentials for provider: Gemini-Cli` |
| `Gemini-Cli/gemini-3-pro-preview` | Gemini-Cli (PascalCase) | ❌ Failed | `No active credentials for provider: Gemini-Cli` |
| `Gemini-Cli/gemini-2.5-flash` | Gemini-Cli (PascalCase) | ❌ Failed | `No active credentials for provider: Gemini-Cli` |
| `Gemini-Cli/gemini-2.5-flash-lite` | Gemini-Cli (PascalCase) | ❌ Failed | `No active credentials for provider: Gemini-Cli` |
| `Gemini-Cli/gemini-3.1-flash-lite` | Gemini-Cli (PascalCase) | ❌ Failed | `No active credentials for provider: Gemini-Cli` |
| `Gemini-Cli/gemini-3.1-flash-lite-preview` | Gemini-Cli (PascalCase) | ❌ Failed | `No active credentials for provider: Gemini-Cli` |
| `Gemini-Cli/gemini-3.1-pro-preview` | Gemini-Cli (PascalCase) | ❌ Failed | `No active credentials for provider: Gemini-Cli` |
| `google/gemini-2.5-pro` | Google | ❌ Failed | `No active credentials for provider: google` |
| `google/gemini-2.5-flash` | Google | ❌ Failed | `No active credentials for provider: google` |
| `openai/gpt-4o` | OpenAI | ❌ Failed | `No active credentials for provider: openai` |
| `openai/gpt-4o-mini` | OpenAI | ❌ Failed | `No active credentials for provider: openai` |
| `anthropic/claude-3-5-sonnet` | Anthropic | ❌ Failed | `No active credentials for provider: anthropic` |
| `kr/claude-sonnet-4.5` | Kiro AI | ❌ Failed | `No active credentials for provider: kr` |
| `deepseek/deepseek-chat` | DeepSeek | ❌ Failed | `402 Insufficient Balance` |
| `deepseek/deepseek-reasoner` | DeepSeek | ❌ Failed | `402 Insufficient Balance` |

---
*Generated by OpenWork Diagnostics Tool.*
