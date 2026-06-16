/** @jsxImportSource react */
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Folder,
  File as FileIcon,
  Download,
  Search,
  ChevronRight,
  RefreshCw,
  Loader2,
  X,
  Home,
} from "lucide-react";

import type { OpenworkServerClient } from "@/app/lib/openwork-server";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatFileSize } from "@/lib/utils";
import { usePanelTabStore } from "../panel/panel-tab-store";
import { classifyOpenTarget } from "./open-target";

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
  descendantCount?: number;
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
  const [currentPath, setCurrentPath] = useState("");
  const [downloadingPaths, setDownloadingPaths] = useState<Record<string, boolean>>({});
  const [highlightedPath, setHighlightedPath] = useState<string | null>(null);
  const [visibleLimit, setVisibleLimit] = useState(200);
  const openTab = usePanelTabStore((state) => state.openTab);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // 1. Create file session to read catalog
  const {
    data: fileSession,
    isLoading: isSessionLoading,
    isError: isSessionError,
    refetch: refetchSession,
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

  // Reveal a file path: navigate to its parent directory and highlight it.
  useEffect(() => {
    if (!revealPath) return;

    const normalized = revealPath.replace(/[\\]+/g, "/").replace(/^\/+/, "");

    // Resolve the reveal path to an actual catalog item path.
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

    // Navigate to the parent directory.
    const lastSlash = resolvedPath.lastIndexOf("/");
    if (lastSlash >= 0) {
      setCurrentPath(resolvedPath.slice(0, lastSlash));
    } else {
      setCurrentPath("");
    }

    // Highlight the file briefly.
    setHighlightedPath(resolvedPath);
    setVisibleLimit(200);
    const timer = window.setTimeout(() => setHighlightedPath(null), 3000);

    // Scroll to the file after a short delay.
    const scrollTimer = window.setTimeout(() => {
      const el = scrollContainerRef.current?.querySelector(`[data-file-path="${CSS.escape(resolvedPath)}"]`);
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 150);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(scrollTimer);
    };
  }, [revealPath, catalog?.items]);

  const handleRefresh = () => {
    if (!fileSessionId) {
      void refetchSession();
    } else {
      void refetchCatalog();
    }
  };

  // Auto-refresh catalog when refresh key changes.
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

  const navigateTo = (path: string) => {
    setCurrentPath(path);
    setHighlightedPath(null);
    setVisibleLimit(200);
  };

  // Format large file counts: 999 → "999", 1200 → "1.2K", 2000 → "2K"
  const formatFileCount = (count: number) => {
    if (count >= 1000) {
      const k = count / 1000;
      return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`;
    }
    return count.toLocaleString();
  };

  // Count total descendants for a tree node
  const countDescendants = (node: TreeNode): number => {
    if (!node.children) return 0;
    let count = 0;
    for (const child of node.children) {
      if (child.kind === "file") count += 1;
      else count += 1 + countDescendants(child);
    }
    return count;
  };

  // Build the full tree structure from catalog items
  const fileTree = useMemo(() => {
    if (!catalog?.items) return { root: [], map: {} as Record<string, TreeNode> };

    const items = catalog.items;

    // Build the tree nodes (always full tree, search filtering is separate)
    const root: TreeNode[] = [];
    const map: Record<string, TreeNode> = {};

    for (const item of items) {
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

    // Annotate descendant counts
    const annotateDescendants = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.kind === "dir" && node.children) {
          node.descendantCount = countDescendants(node);
          annotateDescendants(node.children);
        }
      }
    };

    sortTree(root);
    annotateDescendants(root);

    // Build a lookup map for fast directory navigation
    return { root, map };
  }, [catalog]);

  // Find a directory node by path
  const findDirByPath = (path: string): TreeNode | null => {
    if (!path) return null;
    return fileTree.map[path] ?? null;
  };

  // Current directory's direct children
  const currentDirNodes = useMemo(() => {
    if (!fileTree.root.length) return [];
    if (searchQuery.trim()) return []; // Search mode is handled separately
    if (!currentPath) return fileTree.root;
    const dir = findDirByPath(currentPath);
    return dir?.children ?? [];
  }, [fileTree, currentPath, searchQuery]);

  // Search results: flat list of matching items
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query || !catalog?.items) return [];

    const matched: TreeNode[] = [];
    const matchedPaths = new Set<string>();

    for (const item of catalog.items) {
      if (item.path.toLowerCase().includes(query)) {
        matchedPaths.add(item.path);
      }
    }

    // Build flat list of matching items (files and their parent dirs)
    const result: TreeNode[] = [];
    const addedDirs = new Set<string>();

    for (const path of matchedPaths) {
      const node = fileTree.map[path];
      if (node) {
        result.push(node);
      }
    }

    // Sort: dirs first, then files
    result.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [catalog, searchQuery, fileTree]);

  // Breadcrumb path segments
  const currentPathSegments = useMemo(() => {
    if (!currentPath) return [];
    return currentPath.split("/").map((name, index, parts) => {
      const path = parts.slice(0, index + 1).join("/");
      return { name, path };
    });
  }, [currentPath]);

  // The items to render
  const displayItems = searchQuery.trim() ? searchResults : currentDirNodes;
  const hasMore = displayItems.length > visibleLimit;
  const visibleItems = hasMore ? displayItems.slice(0, visibleLimit) : displayItems;

  // Reset visible limit on navigation/search
  useEffect(() => {
    setVisibleLimit(200);
  }, [currentPath, searchQuery]);

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
                ({formatFileCount(catalog.items.length)} files)
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

        {/* Breadcrumb navigation */}
        {!searchQuery.trim() && (
          <div className="flex items-center gap-0.5 border-t border-border/60 px-2 py-1.5 text-xs text-muted-foreground no-scrollbar overflow-x-auto">
            <button
              onClick={() => navigateTo("")}
              className="shrink-0 rounded p-0.5 hover:bg-dls-hover hover:text-foreground"
              aria-label="Go to root"
            >
              <Home className="h-3.5 w-3.5" />
            </button>
            {currentPathSegments.map((seg, i) => (
              <span key={seg.path} className="flex shrink-0 items-center gap-0.5">
                <ChevronRight className="h-3 w-3 opacity-40" />
                <button
                  onClick={() => navigateTo(seg.path)}
                  className={`rounded px-1 hover:bg-dls-hover hover:text-foreground ${i === currentPathSegments.length - 1 ? "text-foreground font-medium" : ""}`}
                >
                  {seg.name}
                </button>
              </span>
            ))}
          </div>
        )}
        {searchQuery.trim() && (
          <div className="flex items-center gap-1 border-t border-border/60 px-3 py-1.5 text-xs text-muted-foreground">
            <Search className="h-3 w-3" />
            <span>Searching "{searchQuery.trim()}" — {searchResults.length} results</span>
          </div>
        )}
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
        ) : displayItems.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center text-center text-xs text-muted-foreground p-4">
            {searchQuery ? "No files match your search query." : currentPath ? "This directory is empty." : "No files found in workspace."}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {visibleItems.map((node) => {
              const isDir = node.kind === "dir";
              const isDownloading = !!downloadingPaths[node.path];
              const isHighlighted = highlightedPath === node.path;

              return (
                <div key={node.path} className="flex flex-col">
                  <div
                    data-file-path={!isDir ? node.path : undefined}
                    onClick={() => {
                      if (isDir) {
                        navigateTo(node.path);
                      } else {
                        handleOpenFile(node.path, node.name);
                      }
                    }}
                    className={`group flex h-8 cursor-pointer items-center justify-between rounded px-2 hover:bg-dls-hover${isHighlighted ? " bg-amber-2 ring-1 ring-amber-5" : ""}`}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-foreground">
                      {isDir ? (
                        <span className="text-amber-9">
                          <Folder size={15} />
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          <FileIcon size={14} />
                        </span>
                      )}
                      <span className="truncate" title={node.name}>
                        {node.name}
                      </span>
                      {isDir && node.descendantCount != null && (
                        <span className="shrink-0 text-[10px] text-muted-foreground opacity-60">
                          {node.descendantCount}
                        </span>
                      )}
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
                </div>
              );
            })}
            {hasMore && (
              <button
                onClick={() => setVisibleLimit((prev) => prev + 200)}
                className="mt-2 rounded px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-dls-hover transition-colors"
              >
                Show {Math.min(200, displayItems.length - visibleLimit)} more of {displayItems.length - visibleItems.length} remaining
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}