import type { FilePartInput } from "@opencode-ai/sdk/v2/client";

const FIRST_LINE_LOCAL_PATH_RE = /(?:file:\/\/[^\s"'`<>]+|~\/[^\s"'`<>]+|[A-Za-z]:[\\/][^\s"'`<>]+|(?<![:/])\/[A-Za-z0-9._~+%/-]*[\/.][A-Za-z0-9._~+%/-]*)/g;
const TRAILING_PUNCTUATION_RE = /[),.;:]+$/;

function stripTrailingPunctuation(value: string) {
  return value.replace(TRAILING_PUNCTUATION_RE, "");
}

function hasPathBoundary(line: string, start: number) {
  if (start <= 0) return true;
  return /[\s("'[]/.test(line[start - 1] ?? "");
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeFileUri(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "file:") return "";
    const pathname = safeDecodeURIComponent(parsed.pathname);
    if (!pathname) return "";
    if (parsed.hostname && parsed.hostname.toLowerCase() !== "localhost") {
      return `//${parsed.hostname}${pathname}`;
    }
    return pathname;
  } catch {
    return "";
  }
}

function homeFromWorkspaceRoot(workspaceRoot: string) {
  const normalized = workspaceRoot.trim().replace(/\\/g, "/");
  const macMatch = normalized.match(/^(\/Users\/[^/]+)(?:\/|$)/);
  if (macMatch) return macMatch[1] ?? "";
  const linuxMatch = normalized.match(/^(\/home\/[^/]+)(?:\/|$)/);
  if (linuxMatch) return linuxMatch[1] ?? "";
  return "";
}

function toAbsolutePath(value: string, workspaceRoot: string) {
  if (/^file:\/\//i.test(value)) return normalizeFileUri(value);
  if (value.startsWith("~/")) {
    const home = homeFromWorkspaceRoot(workspaceRoot);
    return home ? `${home}/${value.slice(2)}` : "";
  }
  if (value.startsWith("/")) return value;
  if (/^[A-Za-z]:[\\/]/.test(value)) return value.replace(/\\/g, "/");
  return "";
}

function filenameFromPath(value: string) {
  const normalized = value.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "file";
}

function encodeFilePath(path: string) {
  return path.replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/");
}

function toFileUrl(path: string) {
  const normalized = path.replace(/\\/g, "/");
  if (/^[A-Za-z]:\//.test(normalized)) return `file:///${encodeFilePath(normalized).replace(/^([A-Za-z])%3A/, "$1:")}`;
  return `file://${encodeFilePath(normalized)}`;
}

export function firstLineLocalFileParts(text: string, workspaceRoot: string): FilePartInput[] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const parts: FilePartInput[] = [];
  const seen = new Set<string>();

  for (const match of firstLine.matchAll(FIRST_LINE_LOCAL_PATH_RE)) {
    if (!hasPathBoundary(firstLine, match.index ?? 0)) continue;
    const raw = stripTrailingPunctuation(match[0]);
    const absolute = toAbsolutePath(raw, workspaceRoot);
    if (!absolute || seen.has(absolute)) continue;
    seen.add(absolute);
    parts.push({
      type: "file",
      mime: "text/plain",
      url: toFileUrl(absolute),
      filename: filenameFromPath(raw),
    });
  }

  return parts;
}

function modelSupportsPdf(model?: { providerID: string; modelID: string } | null): boolean {
  if (!model) return false;
  const modelId = model.modelID.toLowerCase();
  const providerId = model.providerID.toLowerCase();
  return (
    modelId.includes("gemini") ||
    modelId.includes("claude") ||
    providerId.includes("gemini") ||
    providerId.includes("claude") ||
    providerId.includes("google") ||
    providerId.includes("anthropic")
  );
}

function isSpreadsheetMime(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase();
  return (
    normalized === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    normalized === "application/vnd.ms-excel" ||
    normalized === "application/vnd.oasis.opendocument.spreadsheet" ||
    normalized === "text/csv" ||
    normalized === "text/tab-separated-values"
  );
}

export function isMultimodalSupported(
  mimeType: string,
  model?: { providerID: string; modelID: string } | null
): boolean {
  const normalized = mimeType.toLowerCase();
  if (normalized === "application/pdf") {
    return modelSupportsPdf(model);
  }
  return (
    normalized.startsWith("image/") ||
    normalized === "text/plain" ||
    normalized.startsWith("text/") ||
    isSpreadsheetMime(normalized)
  );
}

export interface ConfigClient {
  getConfig(workspaceId: string): Promise<unknown>;
  patchConfig(workspaceId: string, delta: unknown): Promise<unknown>;
  reloadEngine(workspaceId: string): Promise<unknown>;
}

export async function ensureModelVisionCapabilities(
  client: ConfigClient,
  workspaceId: string,
  defaultModel?: { providerID: string; modelID: string }
) {
  if (!defaultModel) return;
  const providerId = defaultModel.providerID;
  const modelId = defaultModel.modelID;

  const lowerModelId = modelId.toLowerCase();
  const shouldHaveVision =
    lowerModelId.includes("gemini") ||
    lowerModelId.includes("vision") ||
    lowerModelId.includes("claude") ||
    lowerModelId.includes("gpt-4") ||
    lowerModelId.includes("pixtral") ||
    lowerModelId.includes("llava") ||
    lowerModelId.includes("qwen-vl");

  if (!shouldHaveVision) return;

  try {
    const config = await client.getConfig(workspaceId);
    const providerConfig = (config as { opencode?: { provider?: Record<string, { models?: Record<string, { name: string; attachment?: boolean; modalities?: unknown }> }> } })?.opencode?.provider?.[providerId];
    if (!providerConfig) return;

    const modelConfig = providerConfig.models?.[modelId];
    if (!modelConfig) return;

    const inputModalities = (modelConfig.modalities as { input?: string[] } | undefined)?.input;
    const hasImageInput = Array.isArray(inputModalities) && inputModalities.includes("image");

    if (!modelConfig.attachment || !hasImageInput) {
      console.log(`[Vision Auto-Fix] Patching vision capabilities for model ${modelId} of provider ${providerId}`);
      const updatedModels = {
        ...providerConfig.models,
        [modelId]: {
          ...modelConfig,
          attachment: true,
          modalities: { input: ["text", "image"], output: ["text"] },
        }
      };

      await client.patchConfig(workspaceId, {
        opencode: {
          provider: {
            [providerId]: {
              ...providerConfig,
              models: updatedModels,
            }
          }
        }
      });

      await client.reloadEngine(workspaceId);
      console.log(`[Vision Auto-Fix] Reloaded engine for workspace ${workspaceId}`);
    }
  } catch (error) {
    console.error("[Vision Auto-Fix] Failed to check or patch model capabilities:", error);
  }
}
