import type { UIMessage } from "ai";

type OpenTargetKind = "url" | "file";
export type OpenTargetPreview = "browser" | "markdown" | "sheet" | "slides" | "image" | "pdf" | "html" | "text" | "external";

export interface TextData {
  kind: "text";
  data: string;
}

export interface BinaryData {
  kind: "binary";
  data: ArrayBuffer;
}

export type Data = TextData | BinaryData;

export type OpenTarget = {
  id: string;
  kind: OpenTargetKind;
  value: string;
  name: string;
  preview: OpenTargetPreview;
  confidence: number;
  reason: string;
  exists?: boolean;
  size?: number;
  updatedAt?: number;
};

const WORKSPACES_PREFIX_PATTERN = /^workspaces\/[^/]+\//i;
const WORKSPACE_ID_PREFIX_PATTERN = /^workspace\/(?:ws_[^/]+|\d+|[0-9a-f-]{6,})\//i;

const FILE_PATTERN = /(?:^|[\s"'`([{*~_])((?:\.{1,2}[/\\]|~[/\\]|[/\\])?[\w.\-]+(?:[/\\][\w.\-]+)+\.[a-z][a-z0-9]{0,9}|[\w.\-]+\.[a-z][a-z0-9]{0,9})/gi;
const URL_PATTERN = /https?:\/\/[^\s)\]}>"'`]+/gi;
const SOCKET_PATTERN = /(?:ws|wss):\/\/[^\s)\]}>"'`]+/gi;
const ARTIFACT_FILE_PREVIEWS = new Set<OpenTargetPreview>(["markdown", "sheet", "slides", "image", "pdf", "html", "text", "external"]);
const ASSISTANT_ARTIFACT_MENTION_PATTERN = /\b(?:artifact|created|deck|deliverable|exported|file|generated|opened|presentation|saved|slides?|updated|wrote)\b/i;
const DISCOVERY_TOOL_NAMES = new Set(["glob", "grep", "search", "find"]);
const ARTIFACT_METADATA_TOOL_NAMES = new Set(["openwork_extension_call"]);
const WRITE_TOOL_NAMES = new Set([
  "apply_patch",
  "edit",
  "edit_file",
  "multi_edit",
  "multiedit",
  "patch",
  "str_replace_editor",
  "write",
  "write_file",
]);
const FILE_METADATA_KEYS = ["path", "file", "filePath", "filepath"];
const PATCH_FILE_PATTERN = /^\*\*\* (?:Add File|Update File):\s*(.+)$/gmi;
const PATCH_MOVE_TO_PATTERN = /^\*\*\* Move to:\s*(.+)$/gmi;
const URI_PATTERN = /^(?:https?|wss?|file):\/\//i;

type DeriveOpenTargetsOptions = {
  includeFileMentions?: boolean;
  workspaceRoot?: string;
  isRemoteWorkspace?: boolean;
};

function cleanWorkspaceRoot(root: string) {
  return root.trim().replace(/[\\]+/g, "/").replace(/\/+$/, "");
}

function normalizePath(path: string, workspaceRoot?: string, isRemote?: boolean) {
  let clean = path.trim().replace(/[\\]+/g, "/");

  if (workspaceRoot) {
    const cleanRoot = cleanWorkspaceRoot(workspaceRoot);
    if (cleanRoot) {
      if (clean.toLowerCase().startsWith(cleanRoot.toLowerCase() + "/")) {
        clean = clean.slice(cleanRoot.length + 1);
      } else if (clean.toLowerCase() === cleanRoot.toLowerCase()) {
        clean = "";
      }
    }
  }

  // For remote workspaces, preserve leading slashes on absolute paths so the
  // remote server can resolve them against its own workspace root. Local
  // workspaces strip leading slashes since paths are always relative.
  if (!isRemote) {
    clean = clean.replace(/^\/+/, "");
  }
  clean = clean.replace(/^\.\//, "");

  const spacesMatch = clean.match(WORKSPACES_PREFIX_PATTERN);
  if (spacesMatch) {
    clean = clean.slice(spacesMatch[0].length);
  }
  const idMatch = clean.match(WORKSPACE_ID_PREFIX_PATTERN);
  if (idMatch) {
    clean = clean.slice(idMatch[0].length);
  }

  if (clean.toLowerCase().startsWith("workspace/")) {
    clean = clean.slice(10);
  }

  // For remote workspaces, preserve leading slashes on absolute paths so the
  // remote server can resolve them against its own workspace root.
  if (isRemote) {
    return clean;
  }

  return clean.replace(/^\/+/, "");
}

export function basename(value: string) {
  const clean = value.split(/[?#]/)[0] ?? value;
  return clean.split("/").filter(Boolean).pop() ?? value;
}

function extname(value: string) {
  const name = basename(value).toLowerCase();
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index) : "";
}

export function classifyOpenTarget(value: string, kind: OpenTargetKind): OpenTargetPreview {
  if (kind === "url") return "browser";
  const ext = extname(value);
  if ([".md", ".markdown", ".mdx"].includes(ext)) return "markdown";
  if ([".csv", ".tsv", ".xlsx", ".xls", ".ods"].includes(ext)) return "sheet";
  if ([".ppt", ".pptx", ".pptm", ".pot", ".potx", ".odp", ".key", ".sxi"].includes(ext)) return "slides";
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext)) return "image";
  if (ext === ".pdf") return "pdf";
  if ([".html", ".htm"].includes(ext)) return "html";
  if ([".txt", ".log", ".json", ".jsonc", ".yaml", ".yml", ".toml", ".xml", ".ts", ".tsx", ".js", ".jsx", ".css", ".scss"].includes(ext)) return "text";
  return "external";
}

function shouldScanAssistantFileMentions(text: string) {
  return ASSISTANT_ARTIFACT_MENTION_PATTERN.test(text);
}

function targetFromFile(path: string, confidence: number, reason: string, workspaceRoot?: string, isRemote?: boolean): OpenTarget | null {
  const normalized = normalizePath(path, workspaceRoot, isRemote).replace(/[.,;:]+$/, "");
  if (!normalized || normalized.length > 500 || !normalized.includes(".")) return null;
  return {
    id: `file:${normalized.toLowerCase()}`,
    kind: "file",
    value: normalized,
    name: basename(normalized),
    preview: classifyOpenTarget(normalized, "file"),
    confidence,
    reason,
  };
}

function targetFromUrl(url: string, confidence: number, reason: string): OpenTarget | null {
  const stripped = url.trim().replace(/[.,;:`\\]+$/, "");
  let clean = stripped;
  try {
    const parsed = new URL(stripped);
    if (/^\/+$/i.test(parsed.pathname) && !parsed.search && !parsed.hash) {
      clean = parsed.origin;
    }
  } catch {
    // Keep the stripped value; regex extraction already validated the shape.
  }
  if (!clean) return null;
  return {
    id: `url:${clean}`,
    kind: "url",
    value: clean,
    name: basename(clean) || clean,
    preview: "browser",
    confidence,
    reason,
  };
}

function addTarget(map: Map<string, OpenTarget>, target: OpenTarget | null) {
  if (!target) return;
  const existing = map.get(target.id);
  if (!existing || target.confidence >= existing.confidence) map.set(target.id, target);
}

function isArtifactTarget(target: OpenTarget) {
  return target.kind === "url" || ARTIFACT_FILE_PREVIEWS.has(target.preview);
}

export function isCollectibleArtifactTarget(target: OpenTarget) {
  return target.kind === "file" && target.exists === true && ARTIFACT_FILE_PREVIEWS.has(target.preview);
}

export function isLocalhostBrowserTarget(target: OpenTarget) {
  return target.kind === "url" && /(?:https?|wss?):\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(target.value);
}

export function selectAutoOpenTarget(_targets: OpenTarget[]): OpenTarget | null {
  return null;
}

function scanText(
  map: Map<string, OpenTarget>,
  text: string,
  confidence: number,
  reason: string,
  options: { includeFiles: boolean; workspaceRoot?: string; isRemote?: boolean },
) {
  if (!text) {
    return;
  }

  URL_PATTERN.lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    if (match[0]) addTarget(map, targetFromUrl(match[0], confidence, reason));
  }

  SOCKET_PATTERN.lastIndex = 0;

  for (const match of text.matchAll(SOCKET_PATTERN)) {
    if (match[0]) addTarget(map, targetFromUrl(match[0], confidence, reason));
  }

  if (!options.includeFiles) return;

  FILE_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(FILE_PATTERN)) {
    if (match[1]) addTarget(map, targetFromFile(match[1], confidence, reason, options.workspaceRoot, options.isRemote));
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function normalizedToolName(toolName: string) {
  return toolName.trim().toLowerCase().replace(/^functions[._-]/, "");
}

function isDiscoveryTool(toolName: string) {
  return DISCOVERY_TOOL_NAMES.has(normalizedToolName(toolName));
}

function isWriteTool(toolName: string) {
  return WRITE_TOOL_NAMES.has(normalizedToolName(toolName));
}

function isArtifactMetadataTool(toolName: string) {
  return ARTIFACT_METADATA_TOOL_NAMES.has(normalizedToolName(toolName));
}

function collectFileMetadataValues(value: unknown) {
  if (!isObject(value)) return [];
  const values: string[] = [];
  for (const key of FILE_METADATA_KEYS) {
    const file = value[key];
    if (typeof file === "string") values.push(file);
  }
  const files = value.files;
  if (Array.isArray(files)) {
    for (const file of files) {
      if (typeof file === "string") values.push(file);
    }
  }
  return values;
}

function collectNestedFileMetadataValues(value: unknown) {
  if (!isObject(value)) return [];
  return [value, value.result].flatMap(collectFileMetadataValues);
}

function collectPatchFileValues(value: unknown) {
  if (!isObject(value)) return [];
  const patchText = value.patchText ?? value.patch ?? value.diff;
  if (typeof patchText !== "string") return [];
  const values: string[] = [];
  PATCH_FILE_PATTERN.lastIndex = 0;
  for (const match of patchText.matchAll(PATCH_FILE_PATTERN)) {
    if (match[1]) values.push(match[1]);
  }
  PATCH_MOVE_TO_PATTERN.lastIndex = 0;
  for (const match of patchText.matchAll(PATCH_MOVE_TO_PATTERN)) {
    if (match[1]) values.push(match[1]);
  }
  return values;
}

function addFileValues(map: Map<string, OpenTarget>, values: string[], confidence: number, reason: string, workspaceRoot?: string, isRemote?: boolean) {
  for (const value of values) {
    addTarget(map, targetFromFile(value, confidence, reason, workspaceRoot, isRemote));
  }
}

export function deriveOpenTargets(messages: UIMessage[], options: DeriveOpenTargetsOptions = {}): OpenTarget[] {
  const targets = new Map<string, OpenTarget>();
  // For remote workspaces, skip client-side workspace-root stripping because the
  // local `workspaceRoot` is resolved against the local filesystem and is
  // meaningless for the remote server. The remote server handles absolute-path
  // resolution correctly in its own `resolveWorkspaceArtifactTargets`.
  // Also preserve leading slashes on absolute paths so the remote server can
  // resolve them against its own workspace root.
  const effectiveWorkspaceRoot = options.isRemoteWorkspace ? undefined : options.workspaceRoot;
  const isRemote = options.isRemoteWorkspace === true;

  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "text" && typeof part.text === "string") {
        scanText(targets, part.text, message.role === "assistant" ? 65 : 40, "message", {
          includeFiles: options.includeFileMentions === true || (message.role === "assistant" && shouldScanAssistantFileMentions(part.text)),
          workspaceRoot: effectiveWorkspaceRoot,
          isRemote,
        });
        continue;
      }

      if (part.type === "source-document") {
        addTarget(
          targets,
          part.filename
            ? targetFromFile(part.filename, 95, "attachment source", effectiveWorkspaceRoot, isRemote)
            : URI_PATTERN.test(part.title)
              ? targetFromUrl(part.title, 95, "attachment source")
              : targetFromFile(part.title, 95, "attachment source", effectiveWorkspaceRoot, isRemote),
        );
        continue;
      }

      if (part.type !== "dynamic-tool") {
        continue;
      }

      const discoveryTool = isDiscoveryTool(part.toolName);
      const writeTool = isWriteTool(part.toolName);
      const artifactMetadataTool = isArtifactMetadataTool(part.toolName);

      if (writeTool) {
        addFileValues(
          targets,
          [part.input, part.output].flatMap(collectFileMetadataValues),
          95,
          "write tool metadata",
          effectiveWorkspaceRoot,
          isRemote,
        );
        addFileValues(targets, collectPatchFileValues(part.input), 95, "patch metadata", effectiveWorkspaceRoot, isRemote);
        if (typeof part.output === "string") {
          scanText(targets, part.output, 90, "write tool output", { includeFiles: true, workspaceRoot: effectiveWorkspaceRoot, isRemote });
        }
      }

      if (artifactMetadataTool) {
        addFileValues(
          targets,
          [part.input, part.output].flatMap(collectNestedFileMetadataValues),
          95,
          "artifact tool metadata",
          effectiveWorkspaceRoot,
          isRemote,
        );
      }

      if (!discoveryTool) {
        scanText(targets, JSON.stringify(part.output ?? part.input ?? ""), 75, "tool output", { includeFiles: false, workspaceRoot: effectiveWorkspaceRoot, isRemote });
      }
    }
  }

  return Array.from(targets.values())
    .filter(isArtifactTarget)
    .sort((left, right) => right.confidence - left.confidence);
}

const OPENWORK_TARGET_HREF_PREFIX = "#openwork-target:";

/**
 * Check if an `<a>` href points to an OpenTarget (fragment-based protocol).
 */
export function isOpenWorkTargetHref(href: string): boolean {
  return href.startsWith(OPENWORK_TARGET_HREF_PREFIX);
}

/**
 * Parse an `<a>` href produced by `linkifyOpenTargets` back into the target id.
 */
export function parseOpenWorkTargetHref(href: string): string | null {
  if (!isOpenWorkTargetHref(href)) return null;
  return decodeURIComponent(href.slice(OPENWORK_TARGET_HREF_PREFIX.length));
}

/**
 * Pre-process markdown text so that file paths and URLs matching known
 * OpenTargets become clickable links using a fragment-based protocol
 * (`#openwork-target:<targetId>`). The markdown renderer preserves fragment
 * hrefs, and a delegated click handler intercepts them to call `onOpenTarget`.
 *
 * Only targets with `kind === "file"` or `kind === "url"` that pass
 * `isArtifactTarget` are linkified. Targets already inside markdown link
 * syntax `[text](url)` are left alone to avoid double-linking.
 */
export function linkifyOpenTargets(text: string, targets: OpenTarget[]): string {
  if (!targets.length || !text) return text;

  // Sort targets by value length descending so longer paths match first
  // (prevents partial matches like `/srv/workspace/docs` matching before
  // `/srv/workspace/docs.docx`).
  const sorted = [...targets]
    .filter(isArtifactTarget)
    .sort((a, b) => b.value.length - a.value.length);

  // Collect all match positions, then replace from end to start to preserve indices.
  const matches: { start: number; end: number; target: OpenTarget }[] = [];

  for (const target of sorted) {
    const escaped = target.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "g");
    re.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      // Skip if inside markdown link syntax: check for "](" before the match
      const before = text.slice(Math.max(0, start - 50), start);
      // If preceded by "](" this is already a markdown link href — skip
      if (/\]\([^)]*$/.test(before)) continue;
      // If preceded by "[" this is a markdown link text — skip
      if (/\[[^\]]*$/.test(before)) continue;
      // If inside an HTML tag attribute — skip
      if (/=<[^>]*$/.test(before)) continue;

      // Check for overlap with existing matches
      const overlaps = matches.some(
        (m) => (start >= m.start && start < m.end) || (end > m.start && end <= m.end),
      );
      if (!overlaps) {
        matches.push({ start, end, target });
      }
    }
  }

  if (!matches.length) return text;

  // Sort matches by start position descending for safe replacement
  matches.sort((a, b) => b.start - a.start);

  let result = text;
  for (const { start, end, target } of matches) {
    const original = result.slice(start, end);
    const targetId = target.id;
    const href = `${OPENWORK_TARGET_HREF_PREFIX}${encodeURIComponent(targetId)}`;
    const replacement = `[${original}](${href})`;
    result = result.slice(0, start) + replacement + result.slice(end);
  }

  return result;
}
