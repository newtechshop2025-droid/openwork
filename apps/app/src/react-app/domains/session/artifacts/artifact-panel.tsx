/** @jsxImportSource react */
import { Component, lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, X, FolderOpen, Trash2, Folder } from "lucide-react";

import type { OpenworkServerClient } from "@/app/lib/openwork-server";
import { openDesktopPath, revealDesktopItemInDir } from "@/app/lib/desktop";
import { isElectronRuntime } from "@/app/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatFileSize } from "@/lib/utils";
import { type ArtifactPanelTab, usePanelTabStore } from "../panel/panel-tab-store";
import { isCollectibleArtifactTarget, type BinaryData, type Data, type OpenTarget, type TextData } from "./open-target";
import { HTMLPreview, ImagePreview, MarkdownPreview, PlainText, PreviewError, PreviewLoading, PreviewUnavailable } from "./preview";

const ArtifactTextEditor = lazy(() =>
  import("./artifact-text-editor").then((module) => ({ default: module.ArtifactTextEditor })),
);
const ArtifactSpreadsheetEditor = lazy(() =>
  import("./artifact-spreadsheet-editor").then((module) => ({ default: module.ArtifactSpreadsheetEditor })),
);

const EMPTY_TRANSCRIPT_TARGETS: OpenTarget[] = [];

type ArtifactPanelProps = {
  sessionId: string;
  tab: ArtifactPanelTab;
  client: OpenworkServerClient | null;
  workspaceId: string | null;
  workspaceRoot: string;
  isRemoteWorkspace?: boolean;
  onClose: () => void;
};

type ArtifactPanelViewProps = {
  sessionId: string;
  client: OpenworkServerClient;
  workspaceId: string;
  workspaceRoot: string;
  isRemoteWorkspace?: boolean;
  target: OpenTarget;
  onClose: () => void;
};

type ArtifactQueryState =
  | (TextData & { updatedAt: number | null })
  | (BinaryData & { contentType: string | null; updatedAt: number | null });

type SaveArtifactInput = Data & { baseUpdatedAt: number | null };

function absoluteWorkspacePath(root: string, path: string) {
  const cleanRoot = root.trim().replace(/[/\\]+$/, "");
  const cleanPath = path.trim().replace(/^\.\//, "");
  
  return cleanRoot ? `${cleanRoot}/${cleanPath}` : cleanPath;
}

function isTextContent(target: OpenTarget): boolean {
  return ["markdown", "text", "sheet", "html"].includes(target.preview) && !/\.(xlsx|xls|ods)$/i.test(target.value);
}

export function ArtifactPanel({ sessionId, tab, client, workspaceId, workspaceRoot, isRemoteWorkspace = false, onClose }: ArtifactPanelProps) {
  const transcriptTargets = usePanelTabStore((state) => state.transcriptArtifactTargets[sessionId] ?? EMPTY_TRANSCRIPT_TARGETS);
  const artifactTargets = useMemo(() => transcriptTargets.filter(isCollectibleArtifactTarget), [transcriptTargets]);
  const target = useMemo(() => {
    const found = artifactTargets.find((item) => item.id === tab.id);
    if (found) return found;

    // When the tab was opened from the file explorer or a chat link, the
    // target may not be in the transcript targets (e.g., file hasn't been
    // verified yet). Construct a synthetic OpenTarget from the tab metadata
    // so the panel can still load and display the file.
    if (tab.id.startsWith("file:")) {
      const filePath = tab.path ?? tab.id.slice("file:".length);
      return {
        id: tab.id,
        kind: "file" as const,
        value: filePath,
        name: tab.label,
        preview: tab.preview,
        confidence: 100,
        reason: tab.origin ?? "transcript",
        exists: true,
      } satisfies OpenTarget;
    }

    return null;
  }, [artifactTargets, tab]);

  if (!target) {
    return null;
  }

  if (!client || !workspaceId) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-background">
        <div className="shrink-0 border-b border-border bg-background mac:bg-background/80 mac:backdrop-blur-2xl mac:backdrop-saturate-150">
          <div className="flex h-10 items-center gap-2 pe-2 ps-4">
            <div className="min-w-0 flex-1 flex items-center gap-1.5">
              <h3 className="text-sm font-medium text-foreground">
                <span className="truncate">{target.name}</span>
              </h3>
            </div>
            <Tooltip>
              <TooltipTrigger
                render={(
                  <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close artifact">
                    <X />
                  </Button>
                )}
              />
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-red-9">
          {isRemoteWorkspace
            ? "Cannot connect to remote workspace to load this file."
            : "Workspace not available."}
        </div>
      </div>
    );
  }

  return (
    <ArtifactPanelView
      sessionId={sessionId}
      client={client}
      workspaceId={workspaceId}
      workspaceRoot={workspaceRoot}
      isRemoteWorkspace={isRemoteWorkspace}
      target={target}
      onClose={onClose}
    />
  );
}

function ArtifactPanelView({ sessionId, client, workspaceId, workspaceRoot, isRemoteWorkspace = false, target, onClose }: ArtifactPanelViewProps) {
  const openTab = usePanelTabStore((state) => state.openTab);
  const closeTab = usePanelTabStore((state) => state.closeTab);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const isDirectTextEdit = isTextContent(target) && target.preview === "markdown";
  const externalPath = useMemo(() => target.kind === "file" ? absoluteWorkspacePath(workspaceRoot, target.value) : target.value, [target.kind, target.value, workspaceRoot]);

  const handleDelete = async () => {
    if (target.kind !== "file") return;

    const confirmDelete = window.confirm(`Bạn có chắc chắn muốn xóa file ${target.name}?`);
    if (!confirmDelete) return;

    try {
      const fileSession = await client.createFileSession(workspaceId);
      const fileSessionId = fileSession?.session?.id;
      if (!fileSessionId) {
        throw new Error("Không thể tạo file session.");
      }

      await client.applyFileSessionOperations(fileSessionId, [
        { type: "delete", path: target.value, recursive: true }
      ]);

      await queryClient.invalidateQueries({
        queryKey: ["workspace-files-catalog", workspaceId]
      });

      closeTab(sessionId, target.id);
    } catch (err) {
      console.error("Delete file failed from artifact panel", err);
      alert("Xóa file thất bại. Vui lòng thử lại.");
    }
  };

  const { data, error, isError, isLoading } = useQuery<ArtifactQueryState>({
    queryKey: ["artifact-panel", workspaceId, target.id] as const,
    queryFn: async () => {
      if (target.kind === "url") {
        throw new Error("URLs open in browser tabs.");
      }
      else if (target.exists === false) {
        throw new Error("File not found in this workspace.");
      }

      if (isTextContent(target)) {
        const result = await client.readWorkspaceFile(workspaceId, target.value);
        
        return { kind: "text", data: result.content, updatedAt: result.updatedAt ?? null };
      }

      const result = await client.downloadWorkspaceFile(workspaceId, target.value, { preview: true });

      return { kind: "binary", data: result.data, contentType: result.contentType, updatedAt: target.updatedAt ?? null };
    },
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

  const [binaryObjectUrl, setBinaryObjectUrl] = useState<string | null>(null);

  const directPreviewUrl = useMemo(() => {
    if (!client || !workspaceId || target.kind !== "file") return null;
    const params = new URLSearchParams();
    params.set("path", target.value);
    if (target.preview === "pdf" || target.preview === "document" || target.preview === "slides" || (data?.kind === "binary" && data.contentType === "application/pdf")) {
      params.set("preview", "true");
    }
    if (client.token) {
      params.set("token", client.token);
    }
    return `${client.baseUrl}/workspace/${encodeURIComponent(workspaceId)}/files/raw?${params.toString()}`;
  }, [client, workspaceId, target, data]);

  useEffect(() => {
    if (!data || data.kind !== "binary") {
      setBinaryObjectUrl(null);

      return;
    }

    const url = URL.createObjectURL(new Blob([data.data], { type: data.contentType ?? "application/octet-stream" }));

    setBinaryObjectUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [data]);

  useEffect(() => {
    setEditing(false);
    setDraft("");
  }, [target.id, workspaceId]);

  useEffect(() => {
    if (data?.kind === "text") {
      setDraft(data.data);
    }
  }, [data]);

  const { mutate, mutateAsync, isPending: isSaving } = useMutation({
    mutationFn: async (input: SaveArtifactInput) => {
      if (target.kind !== "file") {
        throw new Error("Cannot save non-file artifact.");
      }

      if (input.kind === "text") {
        return client.writeWorkspaceFile(workspaceId, { path: target.value, content: input.data, baseUpdatedAt: input.baseUpdatedAt });
      }

      return client.writeWorkspaceBinaryFile(workspaceId, { path: target.value, data: input.data, baseUpdatedAt: input.baseUpdatedAt });
    },
    onSuccess: (result, input) => {
      queryClient.setQueryData<ArtifactQueryState>(
        ["artifact-panel", workspaceId, target.id] as const,
        input.kind === "text"
          ? { kind: "text", data: input.data, updatedAt: result.updatedAt ?? null }
          : { kind: "binary", data: input.data, contentType: data?.kind === "binary" ? data.contentType : null, updatedAt: result.updatedAt ?? null },
      );

      if (input.kind === "text") {
        setDraft(input.data);
      }
    },
  });

  const download = async () => {
    if (target.kind === "url") {
      return;
    }
    
    const result = await client.downloadWorkspaceFile(workspaceId, target.value);
    const url = URL.createObjectURL(new Blob([result.data], { type: result.contentType ?? "application/octet-stream" }));
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = target.name;
    anchor.click();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const openExternal = async () => {
    if (target.kind === "url") {
      window.open(target.value, "_blank", "noopener,noreferrer");

      return;
    }

    // In Electron, open the file with the OS default app.
    if (isElectronRuntime()) {
      void openDesktopPath(externalPath);

      return;
    }

    // In web (non-Electron), download the file so the user can open it locally.
    await download();
  };

  const save = () => {
    if (target.kind !== "file" || !isTextContent(target) || data?.kind !== "text") {
      return;
    }

    mutate(
      {
        kind: "text",
        data: draft,
        baseUpdatedAt: data.updatedAt,
      },
      { onSuccess: () => setEditing(false) },
    );
  };

  const saveSpreadsheetContent = async (payload: Data) => {
    if (target.kind !== "file") {
      return;
    }

    await mutateAsync({
      ...payload,
      baseUpdatedAt: data?.kind === payload.kind ? data.updatedAt : target.updatedAt ?? null,
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 border-b border-border bg-background mac:bg-background/80 mac:backdrop-blur-2xl mac:backdrop-saturate-150">
        <div className="flex h-10 items-center gap-2 pe-2 ps-4">
          <div className="min-w-0 flex-1 flex items-center gap-1.5">
            <h3 className="text-sm font-medium text-foreground">
              <span className="truncate">{target.name}</span>
            </h3>
            <span className="truncate text-xs text-muted-foreground">
              {target.exists === false ? "missing" : target.size !== undefined ? `${formatFileSize(target.size)}` : ""}
            </span>
          </div>
          {isTextContent(target) && data?.kind === "text" ? (
            editing || isDirectTextEdit ? (
              <>
                <Tooltip>
                  <TooltipTrigger
                    render={(
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (data?.kind === "text") {
                            setDraft(data.data);
                          }
                          setEditing(false);
                        }}
                        disabled={isSaving}
                      >
                        Discard
                      </Button>
                    )}
                  />
                  <TooltipContent>Discard changes</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={(
                      <Button variant="default" size="sm" onClick={() => void save()} disabled={isSaving || draft === data.data}>{isSaving ? "Saving" : "Save"}</Button>
                    )}
                  />
                  <TooltipContent>Save changes</TooltipContent>
                </Tooltip>
              </>
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit</Button>
                  )}
                />
                <TooltipContent>Edit artifact</TooltipContent>
              </Tooltip>
            )
          ) : null}
          {target.kind === "file" ? (
            <>
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        openTab(sessionId, { id: "files", type: "explorer", label: "Workspace Files", revealPath: target.value, revealKey: Date.now() });
                      }}
                      aria-label="Reveal in Explorer"
                    >
                      <FolderOpen />
                    </Button>
                  )}
                />
                <TooltipContent>Reveal in Explorer</TooltipContent>
              </Tooltip>
              {isElectronRuntime() && !isRemoteWorkspace ? (
                <Tooltip>
                  <TooltipTrigger
                    render={(
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          void revealDesktopItemInDir(externalPath);
                        }}
                        aria-label="Show in Folder"
                      >
                        <Folder className="h-4 w-4" />
                      </Button>
                    )}
                  />
                  <TooltipContent>Show in Folder</TooltipContent>
                </Tooltip>
              ) : null}
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button variant="ghost" size="icon-sm" onClick={() => void download()} aria-label="Download artifact">
                      <Download />
                    </Button>
                  )}
                />
                <TooltipContent>Download artifact</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={(
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => void handleDelete()}
                      aria-label="Delete artifact"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                />
                <TooltipContent>Delete file</TooltipContent>
              </Tooltip>
            </>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={(
                <Button variant="ghost" size="icon-sm" onClick={() => void openExternal()} aria-label={isElectronRuntime() && !isRemoteWorkspace ? "Open externally" : "Download"}>
                  <ExternalLink />
                </Button>
              )}
            />
            <TooltipContent>{isElectronRuntime() && !isRemoteWorkspace ? "Open externally" : "Download"}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={(
                <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close artifact">
                  <X />
                </Button>
              )}
            />
            <TooltipContent>Close artifact</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <PreviewErrorBoundary>
        {isLoading || (data?.kind === "binary" && !binaryObjectUrl) ? (
          <PreviewLoading />
        ) : isError ? (
          <PreviewError message={error instanceof Error ? error.message : "Failed to load artifact" } />
        ) : data?.kind === "text" && (editing || isDirectTextEdit) ? (
          <TextEditor value={draft} language={target.preview === "markdown" ? "markdown" : "text"} onChange={setDraft} />
        ) : target.preview === "markdown" && data?.kind === "text" ? (
          <MarkdownPreview content={data.data} />
        ) : target.preview === "sheet" && (data?.kind === "text" || (data?.kind === "binary" && data.contentType !== "application/pdf")) ? (
          <SheetEditor
            name={target.name}
            content={data ?? { kind: "binary", data: new ArrayBuffer(0) }}
            saving={isSaving}
            onSave={saveSpreadsheetContent}
          />
        ) : target.preview === "html" && data?.kind === "text" ? (
          <HTMLPreview type="text" title={target.name} content={data.data} />
        ) : target.preview === "image" && data?.kind === "binary" && binaryObjectUrl ? (
          <ImagePreview src={binaryObjectUrl} alt={target.name} />
        ) : data?.kind === "binary" && directPreviewUrl && (target.preview === "pdf" || target.preview === "html" || target.preview === "document" || target.preview === "slides" || target.preview === "sheet") ? (
          <OfficePreviewContainer
            title={target.name}
            url={directPreviewUrl}
            previewType={target.preview}
            contentType={data.contentType}
            onDownload={download}
            onOpenExternal={openExternal}
          />
        ) : data?.kind === "text" ? (
          <PlainText content={data.data} />
        ) : (
          <PreviewUnavailable
            onDownload={download}
            onReveal={() => {
              openTab(sessionId, { id: "files", type: "explorer", label: "Workspace Files", revealPath: target.value, revealKey: Date.now() });
            }}
          />
        )}
        </PreviewErrorBoundary>
      </div>
    </div>
  );
}

type ErrorBoundaryProps = { children: React.ReactNode };
type ErrorBoundaryState = { hasError: boolean; error: Error | null };

class PreviewErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return <PreviewError message={this.state.error?.message ?? "Preview crashed"} />;
    }
    return this.props.children;
  }
}

interface TextEditorProps extends React.ComponentProps<typeof ArtifactTextEditor> {
  value: string;
  language: "markdown" | "text";
  onChange: (value: string) => void;
}

function TextEditor({ value, language, onChange, ...props }: TextEditorProps) {
  return (
    <Suspense fallback={<PreviewLoading />}>
      <ArtifactTextEditor value={value} language={language} onChange={onChange} {...props} />
    </Suspense>
  );
}

interface SheetEditorProps extends React.ComponentProps<typeof ArtifactSpreadsheetEditor> {
  
}

function SheetEditor({ className, ...props }: SheetEditorProps) {
  return (
    <Suspense fallback={<PreviewLoading />}>
      <ArtifactSpreadsheetEditor
        className={className}
        {...props}
      />
    </Suspense>
  );
}

type OfficePreviewContainerProps = {
  title: string;
  url: string;
  previewType: string;
  contentType: string | null;
  onDownload: () => void;
  onOpenExternal: () => void;
};

function OfficePreviewContainer({ title, url, previewType, contentType, onDownload, onOpenExternal }: OfficePreviewContainerProps) {
  const isWord = previewType === "document" || title.endsWith(".docx") || title.endsWith(".doc");
  const isExcel = previewType === "sheet" || title.endsWith(".xlsx") || title.endsWith(".xls");
  const isPowerPoint = previewType === "slides" || title.endsWith(".pptx") || title.endsWith(".ppt");
  const isPdf = !isWord && !isExcel && !isPowerPoint && (previewType === "pdf" || title.endsWith(".pdf") || contentType === "application/pdf");
  const isConverted = contentType === "application/pdf" || contentType === "text/html" || contentType?.includes("pdf") || contentType?.includes("html");

  let brandColor = "bg-[#185abd]"; // Word Blue
  let brandBorderColor = "border-[#185abd]";
  let brandTextColor = "text-[#185abd]";
  let brandName = "Microsoft Word";
  let brandIcon = (
    <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
    </svg>
  );

  if (isExcel) {
    brandColor = "bg-[#107c41]"; // Excel Green
    brandBorderColor = "border-[#107c41]";
    brandTextColor = "text-[#107c41]";
    brandName = "Microsoft Excel";
    brandIcon = (
      <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M8 13h8" />
        <path d="M8 17h8" />
        <path d="M10 9h4" />
      </svg>
    );
  } else if (isPowerPoint) {
    brandColor = "bg-[#d83b01]"; // PowerPoint Orange
    brandBorderColor = "border-[#d83b01]";
    brandTextColor = "text-[#d83b01]";
    brandName = "Microsoft PowerPoint";
    brandIcon = (
      <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M16 13H8v4h8v-4z" />
      </svg>
    );
  } else if (isPdf) {
    brandColor = "bg-[#a80000]"; // PDF Red
    brandBorderColor = "border-[#a80000]";
    brandTextColor = "text-[#a80000]";
    brandName = "PDF Document";
    brandIcon = (
      <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <path d="M9 15h6" />
      </svg>
    );
  }

  const [activeTab, setActiveTab] = useState<string>("home");
  const [activeSheet, setActiveSheet] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [fontFamily, setFontFamily] = useState("Calibri");
  const [fontSize, setFontSize] = useState(11);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [align, setAlign] = useState<"left" | "center" | "right" | "justify">("left");
  const [showNotification, setShowNotification] = useState<string | null>(null);

  const triggerMockAction = (name: string) => {
    setShowNotification(`Tính năng '${name}' đang ở chế độ xem trước (Read-only Preview).`);
    setTimeout(() => setShowNotification(null), 3000);
  };

  const cleanUrl = useMemo(() => {
    let base = url;
    if (base.includes("#")) {
      base = base.split("#")[0];
    }
    const hashParams = [];
    if (currentPage > 1) {
      hashParams.push(`page=${currentPage}`);
    }
    if (zoom !== 100) {
      hashParams.push(`zoom=${zoom}`);
    } else {
      hashParams.push("zoom=100");
    }
    hashParams.push("toolbar=0");
    hashParams.push("navpanes=0");
    return `${base}#${hashParams.join("&")}`;
  }, [url, currentPage, zoom]);

  const renderIframeOrFallback = () => {
    if (isConverted) {
      return (
        <iframe
          src={cleanUrl}
          title={title}
          className="w-full h-full border-none"
        />
      );
    }

    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center bg-white select-text">
        <div className="rounded-full bg-amber-50 p-3 mb-4 border border-amber-100">
          <svg className="h-8 w-8 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-2">Xem trước trực tiếp không khả dụng</h3>
        <p className="text-xs text-muted-foreground max-w-sm mb-6 leading-relaxed">
          Không thể hiển thị xem trước định dạng này trực tiếp (thông thường do LibreOffice chưa được cài đặt hoặc cấu hình trên server).
          Bạn vẫn có thể mở file gốc hoặc tải xuống để xem bằng các ứng dụng như Microsoft Office hay WPS Office.
        </p>
        <div className="flex items-center gap-3">
          <Button onClick={onOpenExternal} variant="default" size="sm" className="gap-2">
            <ExternalLink className="h-4 w-4" />
            Mở File Gốc
          </Button>
          <Button onClick={onDownload} variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Tải về
          </Button>
        </div>
      </div>
    );
  };

  const ribbonTabs = isExcel
    ? (["home", "insert", "formulas", "data", "view"] as const)
    : (["home", "insert", "layout", "view"] as const);

  const labels: Record<string, string> = {
    home: "Trang chủ",
    insert: "Chèn",
    layout: "Bố trí",
    formulas: "Công thức",
    data: "Dữ liệu",
    view: "Xem",
  };

  return (
    <div className="flex h-full w-full flex-col bg-[#f3f2f1] relative">
      {/* Toast Notification for Mock Actions */}
      {showNotification && (
        <div className="absolute top-28 left-1/2 transform -translate-x-1/2 z-50 bg-[#fffbeb] border border-[#fef3c7] text-[#92400e] text-xs px-3 py-2 rounded-md shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-4 duration-200">
          <svg className="h-4 w-4 text-[#d97706] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {showNotification}
        </div>
      )}

      {/* Top File bar */}
      <div className="flex h-10 items-center justify-between border-b border-border bg-[#f3f2f1] px-3 select-none shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`flex items-center justify-center rounded-sm p-1 shrink-0 ${brandColor}`}>
            {brandIcon}
          </div>
          <span className="text-xs font-semibold text-foreground truncate max-w-[200px] md:max-w-[300px]">
            {title}
          </span>
          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full border border-amber-200 shrink-0">
            Xem trước
          </span>
        </div>

        {/* Global doc actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
            onClick={onOpenExternal}
          >
            <ExternalLink className="h-3 w-3" />
            Mở File Gốc
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
            onClick={onDownload}
          >
            <Download className="h-3 w-3" />
            Tải về
          </Button>
        </div>
      </div>

      {/* Office-style Ribbon Tabs */}
      <div className="bg-[#f3f2f1] border-b border-border select-none shrink-0">
        <div className="flex items-center px-4 gap-1 h-8 bg-white border-b border-muted">
          {ribbonTabs.map((tab) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                className={`text-xs px-3 h-full flex items-center transition-all border-b-2 font-medium ${
                  isActive
                    ? `${brandBorderColor} ${brandTextColor} bg-white`
                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>

        {/* Ribbon Content depending on active tab */}
        <div className="h-16 bg-[#f3f2f1] px-4 py-2 flex items-center gap-6 overflow-x-auto border-b border-border/80">
          {activeTab === "home" && (
            <>
              {/* Clipboard Group */}
              <div className="flex flex-col items-center border-r border-border/70 pr-4 shrink-0">
                <div className="flex items-center gap-1">
                  <button onClick={() => triggerMockAction("Sao chép")} className="p-1.5 hover:bg-muted/80 rounded transition-colors text-muted-foreground hover:text-foreground" title="Sao chép">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                  </button>
                  <button onClick={() => triggerMockAction("Dán")} className="p-1.5 hover:bg-muted/80 rounded transition-colors text-muted-foreground hover:text-foreground" title="Dán">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  </button>
                </div>
                <span className="text-[9px] text-muted-foreground mt-1">Bảng tạm</span>
              </div>

              {/* Font Group */}
              <div className="flex flex-col items-center border-r border-border/70 pr-4 shrink-0">
                <div className="flex items-center gap-1.5">
                  {/* Font dropdown */}
                  <select
                    value={fontFamily}
                    onChange={(e) => {
                      setFontFamily(e.target.value);
                      triggerMockAction(`Thay đổi phông chữ thành ${e.target.value}`);
                    }}
                    className="text-xs bg-white border border-border/80 rounded px-1.5 py-0.5 h-6 outline-none focus:border-primary w-24"
                  >
                    <option value="Calibri">Calibri</option>
                    <option value="Arial">Arial</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Segoe UI">Segoe UI</option>
                  </select>

                  {/* Font size dropdown */}
                  <select
                    value={fontSize}
                    onChange={(e) => {
                      setFontSize(Number(e.target.value));
                      triggerMockAction(`Cỡ chữ: ${e.target.value}`);
                    }}
                    className="text-xs bg-white border border-border/80 rounded px-1.5 py-0.5 h-6 outline-none focus:border-primary w-12"
                  >
                    {[9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48].map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>

                  <div className="h-4 w-[1px] bg-border/60 mx-1" />

                  {/* Formatting buttons */}
                  <button
                    onClick={() => {
                      setIsBold(!isBold);
                      triggerMockAction(isBold ? "Tắt chữ đậm" : "Bật chữ đậm");
                    }}
                    className={`p-1 rounded transition-colors text-xs font-bold w-6 h-6 flex items-center justify-center ${isBold ? "bg-muted text-foreground font-extrabold border border-border/80" : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"}`}
                    title="Chữ đậm"
                  >
                    B
                  </button>
                  <button
                    onClick={() => {
                      setIsItalic(!isItalic);
                      triggerMockAction(isItalic ? "Tắt chữ nghiêng" : "Bật chữ nghiêng");
                    }}
                    className={`p-1 rounded transition-colors text-xs italic w-6 h-6 flex items-center justify-center ${isItalic ? "bg-muted text-foreground font-bold border border-border/80" : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"}`}
                    title="Chữ nghiêng"
                  >
                    I
                  </button>
                  <button
                    onClick={() => {
                      setIsUnderline(!isUnderline);
                      triggerMockAction(isUnderline ? "Tắt gạch chân" : "Bật gạch chân");
                    }}
                    className={`p-1 rounded transition-colors text-xs underline w-6 h-6 flex items-center justify-center ${isUnderline ? "bg-muted text-foreground font-bold border border-border/80" : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"}`}
                    title="Gạch chân"
                  >
                    U
                  </button>

                  {isExcel && (
                    <>
                      <button onClick={() => triggerMockAction("Thay đổi đường viền ô (Borders)")} className="p-1 rounded transition-colors text-muted-foreground hover:bg-muted/80 hover:text-foreground w-6 h-6 flex items-center justify-center" title="Đường viền ô">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M3 12h18M12 3v18" /></svg>
                      </button>
                      <button onClick={() => triggerMockAction("Tô màu nền (Fill Color)")} className="p-1 rounded transition-colors text-muted-foreground hover:bg-muted/80 hover:text-foreground w-6 h-6 flex items-center justify-center relative" title="Tô màu nền">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1" /></svg>
                        <div className="absolute bottom-[2px] left-1 right-1 h-[2.5px] bg-[#107c41]" />
                      </button>
                    </>
                  )}
                </div>
                <span className="text-[9px] text-muted-foreground mt-1">Phông chữ</span>
              </div>

              {/* Paragraph / Alignment Group */}
              <div className="flex flex-col items-center border-r border-border/70 pr-4 shrink-0">
                <div className="flex items-center gap-1">
                  {isExcel && (
                    <>
                      <button onClick={() => triggerMockAction("Căn lề trên")} className="p-1 rounded transition-colors text-muted-foreground hover:bg-muted/80 hover:text-foreground w-6 h-6 flex items-center justify-center" title="Căn lề trên">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4h16M4 10h10M4 16h6" /></svg>
                      </button>
                      <button onClick={() => triggerMockAction("Căn lề giữa")} className="p-1 rounded transition-colors text-muted-foreground hover:bg-muted/80 hover:text-foreground w-6 h-6 flex items-center justify-center" title="Căn lề giữa">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16M7 6h10M7 18h10" /></svg>
                      </button>
                      <button onClick={() => triggerMockAction("Căn lề dưới")} className="p-1 rounded transition-colors text-muted-foreground hover:bg-muted/80 hover:text-foreground w-6 h-6 flex items-center justify-center" title="Căn lề dưới">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 20h16M4 14h10M4 8h6" /></svg>
                      </button>
                      <div className="h-4 w-[1px] bg-border/60 mx-1" />
                    </>
                  )}

                  {(["left", "center", "right"] as const).map((mode) => {
                    const icons = {
                      left: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h16" /></svg>,
                      center: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M4 18h16" /></svg>,
                      right: <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M10 12h10M4 18h16" /></svg>,
                    };
                    return (
                      <button
                        key={mode}
                        onClick={() => {
                          setAlign(mode);
                          triggerMockAction(`Căn lề ${mode}`);
                        }}
                        className={`p-1 rounded transition-colors w-6 h-6 flex items-center justify-center ${align === mode ? "bg-muted text-foreground border border-border/80" : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"}`}
                        title={`Căn lề ${mode}`}
                      >
                        {icons[mode]}
                      </button>
                    );
                  })}

                  {!isExcel && (
                    <button
                      onClick={() => {
                        setAlign("justify");
                        triggerMockAction("Căn lề đều");
                      }}
                      className={`p-1 rounded transition-colors w-6 h-6 flex items-center justify-center ${align === "justify" ? "bg-muted text-foreground border border-border/80" : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"}`}
                      title="Căn lề đều"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
                    </button>
                  )}

                  {isExcel && (
                    <>
                      <div className="h-4 w-[1px] bg-border/60 mx-1" />
                      <button onClick={() => triggerMockAction("Wrap Text (Ngắt dòng)")} className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium border border-border/80 hover:bg-muted/80 rounded text-muted-foreground hover:text-foreground h-6" title="Tự động xuống dòng">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h12a2 2 0 012 2v2a2 2 0 01-2 2H4" /><path strokeLinecap="round" strokeLinejoin="round" d="M7 16l-3 3 3 3" /></svg>
                        Ngắt dòng
                      </button>
                      <button onClick={() => triggerMockAction("Trộn & Căn giữa ô")} className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium border border-border/80 hover:bg-muted/80 rounded text-muted-foreground hover:text-foreground h-6" title="Gộp ô & Căn giữa">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8M8 17h8M4 12h16M4 7v10M20 7v10" /></svg>
                        Trộn ô
                      </button>
                    </>
                  )}
                </div>
                <span className="text-[9px] text-muted-foreground mt-1">Căn lề</span>
              </div>

              {/* Number Format Group (Excel only) */}
              {isExcel && (
                <div className="flex flex-col items-center shrink-0">
                  <div className="flex items-center gap-1.5">
                    <select
                      defaultValue="General"
                      onChange={(e) => triggerMockAction(`Định dạng số: ${e.target.value}`)}
                      className="text-xs bg-white border border-border/80 rounded px-1.5 py-0.5 h-6 outline-none focus:border-primary w-24"
                    >
                      <option value="General">Chung (General)</option>
                      <option value="Number">Số (Number)</option>
                      <option value="Currency">Tiền tệ</option>
                      <option value="Accounting">Kế toán</option>
                      <option value="ShortDate">Ngày ngắn</option>
                      <option value="Percentage">Phần trăm</option>
                    </select>

                    <button onClick={() => triggerMockAction("Định dạng Tiền tệ")} className="p-1 rounded transition-colors text-muted-foreground hover:bg-muted/80 hover:text-foreground w-6 h-6 flex items-center justify-center font-bold text-xs" title="Tiền tệ">$</button>
                    <button onClick={() => triggerMockAction("Định dạng Phần trăm")} className="p-1 rounded transition-colors text-muted-foreground hover:bg-muted/80 hover:text-foreground w-6 h-6 flex items-center justify-center font-bold text-xs" title="Phần trăm">%</button>
                    <button onClick={() => triggerMockAction("Dấu phân tách phần nghìn")} className="p-1 rounded transition-colors text-muted-foreground hover:bg-muted/80 hover:text-foreground w-6 h-6 flex items-center justify-center font-bold text-xs" title="Phân tách">,</button>
                    <button onClick={() => triggerMockAction("Tăng số thập phân")} className="p-1 rounded transition-colors text-muted-foreground hover:bg-muted/80 hover:text-foreground w-6 h-6 flex items-center justify-center text-xs" title="Tăng số thập phân">.00</button>
                  </div>
                  <span className="text-[9px] text-muted-foreground mt-1">Số</span>
                </div>
              )}
            </>
          )}

          {activeTab === "insert" && (
            <>
              {isExcel ? (
                <>
                  {/* Tables Group */}
                  <div className="flex flex-col items-center border-r border-border/70 pr-4 shrink-0">
                    <div className="flex items-center gap-2">
                      <button onClick={() => triggerMockAction("Chèn PivotTable")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground p-1 hover:bg-muted/80 rounded transition-colors">
                        <svg className="h-4 w-4 text-[#107c41]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M9 4v16M4 9h16M14 9v11" /></svg>
                        PivotTable
                      </button>
                      <button onClick={() => triggerMockAction("Chèn bảng")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground p-1 hover:bg-muted/80 rounded transition-colors">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M12 5v14M8 5v14M16 5v14" /><rect x="3" y="5" width="18" height="14" rx="2"/></svg>
                        Bảng
                      </button>
                    </div>
                    <span className="text-[9px] text-muted-foreground mt-1">Bảng</span>
                  </div>

                  {/* Illustrations Group */}
                  <div className="flex flex-col items-center border-r border-border/70 pr-4 shrink-0">
                    <div className="flex items-center gap-2">
                      <button onClick={() => triggerMockAction("Chèn hình ảnh")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground p-1 hover:bg-muted/80 rounded transition-colors">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                        Hình ảnh
                      </button>
                      <button onClick={() => triggerMockAction("Chèn hình dạng")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground p-1 hover:bg-muted/80 rounded transition-colors">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 22a10 10 0 100-20 10 10 0 000 20z"/></svg>
                        Hình dạng
                      </button>
                    </div>
                    <span className="text-[9px] text-muted-foreground mt-1">Hình minh họa</span>
                  </div>

                  {/* Charts Group */}
                  <div className="flex flex-col items-center pr-4 shrink-0">
                    <div className="flex items-center gap-2">
                      <button onClick={() => triggerMockAction("Chèn biểu đồ Cột")} className="p-1 hover:bg-muted/80 rounded transition-colors text-muted-foreground hover:text-foreground" title="Biểu đồ cột">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l4 2v11M4 19V11l4-1v9m10 0v-5l4-2v7" /></svg>
                      </button>
                      <button onClick={() => triggerMockAction("Chèn biểu đồ Đường")} className="p-1 hover:bg-muted/80 rounded transition-colors text-muted-foreground hover:text-foreground" title="Biểu đồ đường">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 19l6-6 4 4 6-8" /></svg>
                      </button>
                      <button onClick={() => triggerMockAction("Chèn biểu đồ Tròn")} className="p-1 hover:bg-muted/80 rounded transition-colors text-muted-foreground hover:text-foreground" title="Biểu đồ tròn">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.003 9.003 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
                      </button>
                    </div>
                    <span className="text-[9px] text-muted-foreground mt-1">Biểu đồ</span>
                  </div>
                </>
              ) : (
                <>
                  {/* Pages Group */}
                  <div className="flex flex-col items-center border-r border-border/70 pr-4 shrink-0">
                    <div className="flex items-center gap-2">
                      <button onClick={() => triggerMockAction("Chèn ngắt trang")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground p-1 hover:bg-muted/80 rounded transition-colors">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 3"/><path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18"/></svg>
                        Ngắt trang
                      </button>
                    </div>
                    <span className="text-[9px] text-muted-foreground mt-1">Trang</span>
                  </div>

                  {/* Table Group */}
                  <div className="flex flex-col items-center border-r border-border/70 pr-4 shrink-0">
                    <div className="flex items-center gap-2">
                      <button onClick={() => triggerMockAction("Chèn bảng")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground p-1 hover:bg-muted/80 rounded transition-colors">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M12 5v14M8 5v14M16 5v14" /><rect x="3" y="5" width="18" height="14" rx="2"/></svg>
                        Bảng (Table)
                      </button>
                    </div>
                    <span className="text-[9px] text-muted-foreground mt-1">Bảng</span>
                  </div>

                  {/* Illustrations Group */}
                  <div className="flex flex-col items-center pr-4 shrink-0">
                    <div className="flex items-center gap-2">
                      <button onClick={() => triggerMockAction("Chèn hình ảnh")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground p-1 hover:bg-muted/80 rounded transition-colors">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                        Hình ảnh
                      </button>
                      <button onClick={() => triggerMockAction("Chèn hình dạng")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground p-1 hover:bg-muted/80 rounded transition-colors">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 22a10 10 0 100-20 10 10 0 000 20z"/></svg>
                        Hình dạng
                      </button>
                    </div>
                    <span className="text-[9px] text-muted-foreground mt-1">Hình minh họa</span>
                  </div>
                </>
              )}
            </>
          )}

          {activeTab === "layout" && !isExcel && (
            <>
              {/* Page Setup Group */}
              <div className="flex flex-col items-center pr-4 shrink-0">
                <div className="flex items-center gap-3">
                  <button onClick={() => triggerMockAction("Thiết lập lề giấy")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground p-1 hover:bg-muted/80 rounded transition-colors" title="Lề">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="1"/><path d="M9 4v16M15 4v16M4 9h16M4 15h16"/></svg>
                    Căn lề
                  </button>
                  <button onClick={() => triggerMockAction("Thay đổi hướng giấy")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground p-1 hover:bg-muted/80 rounded transition-colors" title="Hướng giấy">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="12" height="16" rx="2" transform="rotate(90 12 12)"/></svg>
                    Hướng xoay
                  </button>
                  <button onClick={() => triggerMockAction("Thay đổi cỡ giấy")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground p-1 hover:bg-muted/80 rounded transition-colors" title="Cỡ giấy">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="5" y="3" width="14" height="18" rx="2"/></svg>
                    Kích cỡ
                  </button>
                </div>
                <span className="text-[9px] text-muted-foreground mt-1">Thiết lập trang</span>
              </div>
            </>
          )}

          {activeTab === "formulas" && isExcel && (
            <>
              {/* Function Library Group */}
              <div className="flex flex-col items-center shrink-0">
                <div className="flex items-center gap-2">
                  <button onClick={() => triggerMockAction("Tự động tính tổng (AutoSum)")} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground p-1 hover:bg-muted/80 rounded transition-colors" title="AutoSum">
                    <span className="text-sm font-bold text-[#107c41]">Σ</span> AutoSum
                  </button>
                  <div className="h-4 w-[1px] bg-border/60 mx-1" />
                  <button onClick={() => triggerMockAction("Hàm tài chính")} className="px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded transition-colors">Tài chính</button>
                  <button onClick={() => triggerMockAction("Hàm logic")} className="px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded transition-colors">Logic</button>
                  <button onClick={() => triggerMockAction("Hàm văn bản")} className="px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded transition-colors">Văn bản</button>
                  <button onClick={() => triggerMockAction("Hàm ngày & giờ")} className="px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded transition-colors">Ngày & Giờ</button>
                  <button onClick={() => triggerMockAction("Hàm tra cứu")} className="px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded transition-colors">Tra cứu</button>
                </div>
                <span className="text-[9px] text-muted-foreground mt-1">Thư viện hàm</span>
              </div>
            </>
          )}

          {activeTab === "data" && isExcel && (
            <>
              {/* Sort & Filter Group */}
              <div className="flex flex-col items-center border-r border-border/70 pr-4 shrink-0">
                <div className="flex items-center gap-2">
                  <button onClick={() => triggerMockAction("Sắp xếp A đến Z")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground p-1 hover:bg-muted/80 rounded transition-colors" title="Sắp xếp A-Z">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
                    A-Z
                  </button>
                  <button onClick={() => triggerMockAction("Sắp xếp Z đến A")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground p-1 hover:bg-muted/80 rounded transition-colors" title="Sắp xếp Z-A">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h9m5-1l-4 4m0 0l-4-4m4 4V8" /></svg>
                    Z-A
                  </button>
                  <button onClick={() => triggerMockAction("Lọc dữ liệu")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground p-1 hover:bg-muted/80 rounded transition-colors" title="Lọc">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                    Bộ lọc
                  </button>
                </div>
                <span className="text-[9px] text-muted-foreground mt-1">Sắp xếp & Lọc</span>
              </div>

              {/* Data Tools Group */}
              <div className="flex flex-col items-center shrink-0">
                <div className="flex items-center gap-2">
                  <button onClick={() => triggerMockAction("Phân tách văn bản thành cột")} className="px-2 py-0.5 text-xs border border-border/80 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors">Phân tách cột</button>
                  <button onClick={() => triggerMockAction("Xác thực dữ liệu (Data Validation)")} className="px-2 py-0.5 text-xs border border-border/80 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors">Xác thực dữ liệu</button>
                </div>
                <span className="text-[9px] text-muted-foreground mt-1">Công cụ dữ liệu</span>
              </div>
            </>
          )}

          {activeTab === "view" && (
            <>
              {/* Excel Gridlines / Headings / Formula bar options */}
              {isExcel && (
                <div className="flex flex-col items-center border-r border-border/70 pr-4 shrink-0">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
                      <input type="checkbox" defaultChecked onChange={() => triggerMockAction("Ẩn/Hiện đường lưới (Gridlines)")} className="rounded accent-[#107c41]" />
                      Đường lưới
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
                      <input type="checkbox" defaultChecked onChange={() => triggerMockAction("Ẩn/Hiện thanh công thức (Formula Bar)")} className="rounded accent-[#107c41]" />
                      Thanh công thức
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
                      <input type="checkbox" defaultChecked onChange={() => triggerMockAction("Ẩn/Hiện tiêu đề hàng/cột (Headings)")} className="rounded accent-[#107c41]" />
                      Tiêu đề hàng/cột
                    </label>
                  </div>
                  <span className="text-[9px] text-muted-foreground mt-1">Hiển thị</span>
                </div>
              )}

              {/* Zoom Group */}
              <div className="flex flex-col items-center border-r border-border/70 pr-4 shrink-0">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setZoom(Math.max(50, zoom - 10))}
                    className="p-1.5 hover:bg-muted/80 rounded transition-colors text-muted-foreground hover:text-foreground text-xs font-semibold"
                    title="Thu nhỏ"
                  >
                    -
                  </button>
                  <span className="text-xs font-medium w-12 text-center select-none">
                    {zoom}%
                  </span>
                  <button
                    onClick={() => setZoom(Math.min(200, zoom + 10))}
                    className="p-1.5 hover:bg-muted/80 rounded transition-colors text-muted-foreground hover:text-foreground text-xs font-semibold"
                    title="Phóng to"
                  >
                    +
                  </button>
                  <div className="h-4 w-[1px] bg-border/60 mx-1" />
                  <button
                    onClick={() => setZoom(100)}
                    className="px-1.5 py-0.5 text-[10px] hover:bg-muted/80 border border-border/50 rounded transition-colors text-muted-foreground hover:text-foreground"
                  >
                    100%
                  </button>
                </div>
                <span className="text-[9px] text-muted-foreground mt-1">Thu phóng</span>
              </div>

              {/* Show controls */}
              <div className="flex flex-col items-center shrink-0">
                <div className="flex items-center gap-2">
                  <button onClick={() => triggerMockAction(isExcel ? "Chế độ xem trang tính" : "Chế độ đọc tập trung")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground p-1 hover:bg-muted/80 rounded transition-colors">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                    {isExcel ? "Xem trang tính" : "Tập trung"}
                  </button>
                </div>
                <span className="text-[9px] text-muted-foreground mt-1">Chế độ hiển thị</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Excel Formula Bar */}
      {isExcel && (
        <div className="flex h-9 items-center border-b border-border bg-[#f8f9fa] px-3 text-xs text-foreground shrink-0 select-none">
          {/* Active cell name box */}
          <div
            onClick={() => triggerMockAction("Thay đổi ô hiện tại")}
            className="w-14 text-center py-0.5 bg-white border border-border/80 rounded font-mono text-[11px] shadow-sm cursor-pointer hover:bg-muted/30 transition-colors"
          >
            {activeSheet === 0 ? "A1" : activeSheet === 1 ? "B2" : "A1"}
          </div>

          <div className="h-5 w-[1px] bg-border mx-2" />

          {/* Formula symbols */}
          <div className="flex items-center gap-1.5 mr-2">
            <button onClick={() => triggerMockAction("Hủy")} className="h-5 w-5 rounded hover:bg-muted/80 flex items-center justify-center text-muted-foreground hover:text-red-600 transition-colors" title="Hủy">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <button onClick={() => triggerMockAction("Nhập")} className="h-5 w-5 rounded hover:bg-muted/80 flex items-center justify-center text-muted-foreground hover:text-green-600 transition-colors" title="Nhập">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </button>

            <button onClick={() => triggerMockAction("Chèn hàm")} className="px-1 text-[11px] italic font-semibold text-muted-foreground hover:text-foreground font-serif hover:bg-muted/80 rounded" title="Chèn hàm">
              fx
            </button>
          </div>

          {/* Formula content input */}
          <div className="flex-1 flex items-center bg-white border border-border/80 rounded px-2 py-0.5 h-6 shadow-sm">
            <input
              type="text"
              readOnly
              value={
                activeSheet === 0
                  ? "=SUM(B2:B10)"
                  : activeSheet === 1
                    ? "=AVERAGE(C2:C15)"
                    : "=COUNT(A1:A50)"
              }
              onClick={() => triggerMockAction("Chỉnh sửa thanh công thức")}
              className="w-full bg-transparent outline-none font-mono text-[11px] cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* Main Canvas Area */}
      {isExcel ? (
        <div className="flex-1 flex flex-col min-h-0 bg-white relative overflow-hidden">
          {/* Viewport container */}
          <div className="flex-1 overflow-auto relative bg-[#f3f2f1]">
            <div className="min-w-max min-h-max flex flex-col">
              {/* Sticky Column Headers (Top) */}
              <div className="sticky top-0 z-20 flex h-6 bg-[#f3f2f1] border-b border-border shrink-0 select-none text-[11px] text-muted-foreground">
                {/* Sticky Top-Left Corner */}
                <div className="sticky left-0 z-30 w-9 h-full bg-[#f3f2f1] border-r border-border flex items-center justify-center shrink-0">
                  <div className="w-2 h-2 bg-muted-foreground/30 rounded-sm" />
                </div>
                {/* Columns A-O */}
                {["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O"].map((col) => {
                  const activeCol = activeSheet === 1 ? "B" : "A";
                  const isActive = col === activeCol;
                  return (
                    <div
                      key={col}
                      onClick={() => triggerMockAction(`Chọn cột ${col}`)}
                      className={`w-28 text-center py-1 border-r border-border/50 shrink-0 font-medium hover:bg-[#e1dfdd] transition-colors cursor-pointer ${
                        isActive
                          ? "bg-[#e1dfdd] text-[#107c41] font-semibold border-b-2 border-[#107c41]"
                          : ""
                      }`}
                    >
                      {col}
                    </div>
                  );
                })}
              </div>

              {/* Bottom Row for Row Headers & Canvas */}
              <div className="flex flex-1">
                {/* Sticky Row Headers (Left) */}
                <div className="sticky left-0 z-10 w-9 bg-[#f3f2f1] border-r border-border flex flex-col shrink-0 select-none text-[11px] text-muted-foreground">
                  {Array.from({ length: 45 }).map((_, i) => {
                    const rowNum = i + 1;
                    const activeRow = activeSheet === 1 ? 2 : 1;
                    const isActive = rowNum === activeRow;
                    return (
                      <div
                        key={i}
                        onClick={() => triggerMockAction(`Chọn hàng ${rowNum}`)}
                        className={`h-9 flex items-center justify-center border-b border-border/50 font-medium hover:bg-[#e1dfdd] transition-colors cursor-pointer ${
                          isActive
                            ? "bg-[#e1dfdd] text-[#107c41] font-semibold border-r-2 border-r-[#107c41]"
                            : ""
                        }`}
                      >
                        {rowNum}
                      </div>
                    );
                  })}
                </div>

                {/* Sheet Canvas Content (Grid background + Iframe) */}
                <div
                  className="flex-1 p-6 min-w-[1680px]"
                  style={{
                    backgroundImage: "linear-gradient(to right, #e1dfdd 1px, transparent 1px), linear-gradient(to bottom, #e1dfdd 1px, transparent 1px)",
                    backgroundSize: "112px 36px", // 112px = w-28, 36px = h-9
                    backgroundColor: "#ffffff",
                  }}
                >
                  {/* The PDF iframe centered on top of the grid */}
                  <div className="w-full max-w-[1200px] h-[1200px] bg-white rounded shadow-md border border-border/80 overflow-hidden relative">
                    {renderIframeOrFallback()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden p-4 bg-[#f3f2f1] flex justify-center items-stretch relative">
          <div className="w-full max-w-[850px] bg-white rounded shadow-md border border-border/80 overflow-hidden relative">
            {renderIframeOrFallback()}
          </div>
        </div>
      )}

      {/* Excel Sheet Tabs Selection Bar */}
      {isExcel && (
        <div className="flex h-8 items-center border-t border-border bg-white text-xs px-2 shrink-0 select-none justify-between">
          <div className="flex items-center gap-1">
            <button onClick={() => triggerMockAction("Chuyển trang tính trước")} className="p-1 hover:bg-muted/80 rounded transition-colors text-muted-foreground hover:text-foreground">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button onClick={() => triggerMockAction("Chuyển trang tính sau")} className="p-1 hover:bg-muted/80 rounded transition-colors text-muted-foreground hover:text-foreground">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
            <div className="h-4 w-[1px] bg-border/60 mx-1" />

            {["Trang tính 1", "Trang tính 2", "Trang tính 3"].map((sheetName, index) => {
              const isActive = activeSheet === index;
              return (
                <button
                  key={sheetName}
                  onClick={() => {
                    setActiveSheet(index);
                    triggerMockAction(`Chuyển sang ${sheetName}`);
                  }}
                  className={`px-3 py-1 flex items-center h-8 transition-colors border-t-2 font-medium ${
                    isActive
                      ? "border-t-[#107c41] text-[#107c41] bg-white border-x border-x-border/50"
                      : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                  }`}
                >
                  {sheetName}
                </button>
              );
            })}

            <button onClick={() => triggerMockAction("Thêm trang tính mới")} className="p-1 hover:bg-muted/80 rounded transition-colors text-muted-foreground hover:text-foreground ml-1" title="Thêm trang tính">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            </button>
          </div>

          <div className="text-[10px] text-muted-foreground font-mono pr-2">
            {activeSheet === 0 ? "A1:F20" : activeSheet === 1 ? "B2:D10" : "A1:Z100"}
          </div>
        </div>
      )}

      {/* Bottom MS Office Status Bar */}
      <div className={`h-6 ${brandColor} text-white flex items-center justify-between px-3 text-[10px] select-none shrink-0 font-normal`}>
        {isExcel ? (
          <>
            <div className="flex items-center gap-4">
              <span>Sẵn sàng</span>
              <span className="h-3 w-[1px] bg-white/30" />
              <span>Trung bình: -- | Số lượng: -- | Tổng: --</span>
            </div>

            <div className="flex items-center gap-3">
              <span>Xem Bình thường</span>
              <span className="h-3 w-[1px] bg-white/30" />
              <div className="flex items-center gap-1.5">
                <button onClick={() => setZoom(Math.max(50, zoom - 10))} className="hover:bg-white/10 px-1.5 rounded text-white font-bold">-</button>
                <span className="w-8 text-center">{zoom}%</span>
                <button onClick={() => setZoom(Math.min(200, zoom + 10))} className="hover:bg-white/10 px-1.5 rounded text-white font-bold">+</button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  className="hover:bg-white/10 px-1 py-0.5 rounded text-white"
                  title="Trang trước"
                >
                  ◀
                </button>
                <span>Trang {currentPage}</span>
                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  className="hover:bg-white/10 px-1 py-0.5 rounded text-white"
                  title="Trang sau"
                >
                  ▶
                </button>
              </div>
              <span className="h-3 w-[1px] bg-white/30" />
              <span>Số từ: --</span>
              <span className="h-3 w-[1px] bg-white/30" />
              <span>Tiếng Việt</span>
            </div>

            <div className="flex items-center gap-3">
              <span>Xem Bố trí Trang in</span>
              <span className="h-3 w-[1px] bg-white/30" />
              <div className="flex items-center gap-1.5">
                <button onClick={() => setZoom(Math.max(50, zoom - 10))} className="hover:bg-white/10 px-1.5 rounded text-white font-bold">-</button>
                <span className="w-8 text-center">{zoom}%</span>
                <button onClick={() => setZoom(Math.min(200, zoom + 10))} className="hover:bg-white/10 px-1.5 rounded text-white font-bold">+</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

