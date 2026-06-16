/** @jsxImportSource react */
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Folder, 
  FolderOpen, 
  File as FileIcon, 
  Download, 
  Search, 
  ChevronRight, 
  ChevronDown, 
  RefreshCw,
  Loader2,
  X
} from "lucide-react";

import type { OpenworkServerClient } from "@/app/lib/openwork-server";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatFileSize } from "@/lib/utils";
import { usePanelTabStore, useSessionPanelState } from "../panel/panel-tab-store";
import { basename, classifyOpenTarget } from "./open-target";

type WorkspaceFilesExplorerProps = {
  sessionId: string;
  client: OpenworkServerClient | null;
  workspaceId: string | null;
  workspaceRoot: string;
  isRemoteWorkspace?: boolean;
  catalogRefreshKey?: number;
  revealPath?: string;
  onClose: () => void;
};

interface TreeNode {
  name: string;
  path: string;
  kind: "file" | "dir";
  size: number;
  mtimeMs: number;
  children?: TreeNode[];
}

export function WorkspaceFilesExplorer({
  sessionId,
  client,
  workspaceId,
  isRemoteWorkspace = false,
  catalogRefreshKey,
  revealPath,
  onClose,
}: WorkspaceFilesExplorerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [downloadingPaths, setDownloadingPaths] = useState<Record<string, boolean>>({});
  const [highlightedPath, setHighlightedPath] = useState<string | null>(null);
  const openTab = usePanelTabStore((state) => state.openTab);
  const { tabs } = useSessionPanelState(sessionId);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // 1. Create file session to read catalog
  const {
    data: fileSession,
    isLoading: isSessionLoading,
    isError: isSessionError,
    refetch: refetchSession
  } = useQuery({
    queryKey: ["file-session", workspaceId],
    queryFn: async () => {
      if (!client || !workspaceId) throw new Error("Client or workspaceId not available");
      return client.createFileSession(workspaceId);
    },
    enabled: !!client && !!workspaceId,
    staleTime: 5 * 60 * 1000,
  });

  const fileSessionId = fileSession?.session?.id;

  // 2. Fetch workspace files catalog
  // For remote workspaces, always refetch on mount to stay in sync with
  // the remote filesystem (files may have been written by the AI since
  // the last catalog fetch).
  const {
    data: catalog,
    isLoading: isCatalogLoading,
    isError: isCatalogError,
    error: catalogError,
    isFetching: isCatalogFetching,
    refetch: refetchCatalog,
  } = useQuery({
    queryKey: ["workspace-files-catalog", workspaceId, fileSessionId],
    queryFn: async () => {
      if (!client || !fileSessionId) throw new Error("No session active");
      return client.getFileSessionCatalog(fileSessionId);
    },
    enabled: !!client && !!fileSessionId,
    refetchOnMount: isRemoteWorkspace ? "always" : undefined,
  });

  // Reveal a file path: expand parent folders and highlight the file.
  useEffect(() => {
    if (!revealPath) return;

    // Normalize the reveal path to match catalog item paths.
    const normalized = revealPath.replace(/[\\]+/g, "/").replace(/^\/+/, "");

    // Resolve the reveal path to an actual catalog item path. For remote
    // workspaces the revealPath may be an absolute path (e.g.
    // /srv/workspace/word.docx) while catalog items are relative to the
    // workspace root (e.g. word.docx). Try exact match first, then suffix
    // match.
    let resolvedPath = normalized;
    if (catalog?.items) {
      const exactMatch = catalog.items.some((item) => item.path === normalized);
      if (!exactMatch) {
        const suffixItem = catalog.items.find(
          (item) => normalized.endsWith("/" + item.path),
        );
        if (suffixItem) {
          resolvedPath = suffixItem.path;
        }
      }
    }

    setExpandedFolders((prev) => {
      const next = { ...prev };
      let changed = false;
      const parts = resolvedPath.split("/");
      let current = "";
      // Expand all parent directories.
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!part) continue;
        current = current ? `${current}/${part}` : part;
        if (!next[current]) {
          next[current] = true;
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    // Highlight the file briefly.
    setHighlightedPath(resolvedPath);
    const timer = window.setTimeout(() => setHighlightedPath(null), 3000);

    // Scroll to the file after a short delay for the tree to render.
    const scrollTimer = window.setTimeout(() => {
      const el = scrollContainerRef.current?.querySelector(`[data-file-path="${CSS.escape(resolvedPath)}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 150);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(scrollTimer);
    };
  }, [revealPath, catalog?.items]);

  useEffect(() => {
    setExpandedFolders((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const tab of tabs) {
        if (tab.type === "artifact" && tab.id.startsWith("file:")) {
          const filePath = tab.id.slice("file:".length);
          const parts = filePath.split("/");
          let current = "";
          for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!part) continue;
            current = current ? `${current}/${part}` : part;
            if (next[current] === undefined) {
              next[current] = true;
              changed = true;
            }
          }
        }
      }

      return changed ? next : prev;
    });
  }, [tabs]);

  const handleRefresh = () => {
    if (!fileSessionId) {
      void refetchSession();
    } else {
      void refetchCatalog();
    }
  };

  // Auto-refresh catalog when refresh key changes (e.g., after AI completes writing files)
  useEffect(() => {
    if (catalogRefreshKey !== undefined && catalogRefreshKey > 0) {
      handleRefresh();
    }
  }, [catalogRefreshKey]);

  const handleDownload = async (event: React.MouseEvent, path: string, name: string) => {
    event.stopPropagation();
    if (!client || !workspaceId) return;

    setDownloadingPaths((prev) => ({ ...prev, [path]: true }));
    try {
      const result = await client.downloadWorkspaceFile(workspaceId, path);
      const url = URL.createObjectURL(new Blob([result.data], { type: result.contentType ?? "application/octet-stream" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("Download workspace file failed", err);
    } finally {
      setDownloadingPaths((prev) => ({ ...prev, [path]: false }));
    }
  };

  const handleOpenFile = (path: string, name: string) => {
    const previewType = classifyOpenTarget(path, "file");
    openTab(sessionId, {
      id: `file:${path.toLowerCase()}`,
      type: "artifact",
      label: name,
      preview: previewType,
      origin: "explorer",
      path,
    });
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  // Filter and build tree structure
  const fileTree = useMemo(() => {
    if (!catalog?.items) return [];

    const items = catalog.items;
    const query = searchQuery.trim().toLowerCase();

    let filteredItems = items;
    if (query) {
      // If there's a search query, we filter files matching the name/path.
      // We must also include parent folders so the tree renders properly.
      const matchedPaths = new Set<string>();
      
      for (const item of items) {
        if (item.path.toLowerCase().includes(query)) {
          matchedPaths.add(item.path);
          // Add all parent folders to the set
          const parts = item.path.split("/");
          let current = "";
          for (let i = 0; i < parts.length - 1; i++) {
            current = current ? `${current}/${parts[i]}` : parts[i]!;
            matchedPaths.add(current);
          }
        }
      }

      filteredItems = items.filter((item) => matchedPaths.has(item.path));
    }

    // Build the tree nodes
    const root: TreeNode[] = [];
    const map: Record<string, TreeNode> = {};

    for (const item of filteredItems) {
      const parts = item.path.split("/");
      let currentPath = "";
      let parentChildren = root;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLast = i === parts.length - 1;

        let node = map[currentPath];
        if (!node) {
          node = {
            name: part,
            path: currentPath,
            kind: isLast ? item.kind : "dir",
            size: isLast ? item.size : 0,
            mtimeMs: isLast ? item.mtimeMs : 0,
          };
          if (node.kind === "dir") {
            node.children = [];
          }
          map[currentPath] = node;
          parentChildren.push(node);
        }

        if (node.children) {
          parentChildren = node.children;
        }
      }
    }

    // Sort nodes: directories first, then files, alphabetically
    const sortTree = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => {
        if (a.kind !== b.kind) {
          return a.kind === "dir" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      for (const node of nodes) {
        if (node.children) {
          sortTree(node.children);
        }
      }
    };

    sortTree(root);
    return root;
  }, [catalog, searchQuery]);

  // Recursively render node tree
  const renderTreeNodes = (nodes: TreeNode[], depth = 0) => {
    return nodes.map((node) => {
      const isDir = node.kind === "dir";
      const isExpanded = !!expandedFolders[node.path];
      const isDownloading = !!downloadingPaths[node.path];

      const isHighlighted = highlightedPath === node.path;

      return (
        <div key={node.path} className="flex flex-col">
          <div
            data-file-path={!isDir ? node.path : undefined}
            onClick={() => {
              if (isDir) {
                toggleFolder(node.path);
              } else {
                handleOpenFile(node.path, node.name);
              }
            }}
            className={`group flex h-8 cursor-pointer items-center justify-between rounded px-2 hover:bg-dls-hover${isHighlighted ? " bg-amber-2 ring-1 ring-amber-5" : ""}`}
            style={{ paddingLeft: `${Math.max(8, depth * 16)}px` }}
          >
            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-foreground">
              {isDir ? (
                <>
                  <span className="text-muted-foreground">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                  <span className="text-amber-9">
                    {isExpanded ? <FolderOpen size={15} /> : <Folder size={15} />}
                  </span>
                </>
              ) : (
                <>
                  <span className="w-3.5 shrink-0" />
                  <span className="text-muted-foreground">
                    <FileIcon size={14} />
                  </span>
                </>
              )}
              <span className="truncate" title={node.name}>
                {node.name}
              </span>
              {!isDir && node.size > 0 && (
                <span className="text-[10px] text-muted-foreground opacity-60">
                  ({formatFileSize(node.size)})
                </span>
              )}
            </div>

            {!isDir && (
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                <Tooltip>
                  <TooltipTrigger
                    render={(
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                        onClick={(e) => void handleDownload(e, node.path, node.name)}
                        disabled={isDownloading}
                        aria-label="Download file"
                      >
                        {isDownloading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Download className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                  />
                  <TooltipContent>Download file</TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>

          {isDir && isExpanded && node.children && node.children.length > 0 && (
            <div className="flex flex-col">
              {renderTreeNodes(node.children, depth + 1)}
            </div>
          )}

          {isDir && isExpanded && node.children && node.children.length === 0 && (
            <div 
              className="py-1 text-[11px] text-muted-foreground italic opacity-50"
              style={{ paddingLeft: `${(depth + 1) * 16 + 20}px` }}
            >
              Empty directory
            </div>
          )}
        </div>
      );
    });
  };

  const isBusy = isSessionLoading || isCatalogLoading;
  const isRefreshing = isCatalogFetching && !isCatalogLoading;
  const isErr = isSessionError || isCatalogError;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="shrink-0 border-b border-border bg-background mac:bg-background/80 mac:backdrop-blur-2xl mac:backdrop-saturate-150">
        <div className="flex h-10 items-center gap-2 pe-2 ps-4">
          <div className="min-w-0 flex-1 flex items-center gap-1.5">
            <h3 className="text-sm font-medium text-foreground">
              Workspace Files {isRemoteWorkspace ? "(Remote)" : ""}
            </h3>
            {catalog?.items && (
              <span className="text-xs text-muted-foreground">
                ({catalog.items.length} files)
              </span>
            )}
          </div>

          <Tooltip>
            <TooltipTrigger
              render={(
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleRefresh}
                  disabled={isBusy}
                  aria-label="Refresh files list"
                >
                  <RefreshCw className={`h-4 w-4 ${isBusy || isRefreshing ? "animate-spin" : ""}`} />
                </Button>
              )}
            />
            <TooltipContent>Refresh file list</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={(
                <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close panel">
                  <X className="h-4 w-4" />
                </Button>
              )}
            />
            <TooltipContent>Close panel</TooltipContent>
          </Tooltip>
        </div>

        <div className="px-4 pb-2">
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-3 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery("")} 
                className="absolute right-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto p-2">
        {isBusy ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading workspace files...
          </div>
        ) : isErr ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-center text-xs text-red-9 p-4">
            {isRemoteWorkspace
              ? "Could not load files from remote workspace. Check your connection and try again."
              : "Failed to load workspace files."}
            {isRemoteWorkspace && catalogError ? (
              <span className="text-[10px] opacity-60">{String(catalogError?.message ?? "")}</span>
            ) : null}
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              Retry
            </Button>
          </div>
        ) : fileTree.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center text-center text-xs text-muted-foreground p-4">
            {searchQuery ? "No files match your search query." : "No files found in workspace."}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {renderTreeNodes(fileTree)}
          </div>
        )}
      </div>
    </div>
  );
}
