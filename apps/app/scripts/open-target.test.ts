import { describe, expect, it } from "bun:test";
import type { UIMessage } from "ai";

import {
  deriveOpenTargets,
  isCollectibleArtifactTarget,
  selectAutoOpenTarget,
  linkifyOpenTargets,
  parseOpenWorkTargetHref,
  isOpenWorkTargetHref,
} from "../src/react-app/domains/session/artifacts/open-target";

function message(id: string, role: "user" | "assistant", text: string): UIMessage {
  return { id, role, parts: [{ type: "text", text, state: "done" }] };
}

function toolMessage(id: string, toolName: string, input: Record<string, unknown>, output: unknown): UIMessage {
  return {
    id,
    role: "assistant",
    parts: [{
      type: "dynamic-tool",
      toolName,
      toolCallId: `${id}_tool`,
      state: "output-available",
      input,
      output,
    }],
  };
}

describe("deriveOpenTargets", () => {
  it("extracts file and localhost URL targets from recent assistant output", () => {
    const targets = deriveOpenTargets([
      toolMessage("msg_tool", "write", { filePath: "reports/revenue.xlsx" }, { filePath: "reports/revenue.xlsx" }),
      message("msg_1", "assistant", "Created reports/revenue.xlsx and started http://localhost:5173 for preview."),
    ]);

    expect(targets.map((target) => target.value)).toContain("reports/revenue.xlsx");
    expect(targets.map((target) => target.value)).toContain("http://localhost:5173");
    expect(targets.find((target) => target.value === "reports/revenue.xlsx")?.preview).toBe("sheet");
  });

  it("extracts websocket URLs so local socket/dev-server hints stay visible", () => {
    const targets = deriveOpenTargets([
      toolMessage("msg_tool", "write", { filePath: "dist/index.html" }, { filePath: "dist/index.html" }),
      message("msg_1", "assistant", "Socket open at ws://localhost:5173/socket and preview at dist/index.html"),
    ]);

    expect(targets.map((target) => target.value)).toContain("ws://localhost:5173/socket");
    expect(targets.map((target) => target.value)).toContain("dist/index.html");
  });

  it("normalizes Workspace/<id>/ prefixes from artifact paths", () => {
    const targets = deriveOpenTargets([
      toolMessage("msg_tool_1", "write", { filePath: "Workspace/32423/reports/artifact-eval.md" }, { filePath: "Workspace/32423/reports/artifact-eval.md" }),
      toolMessage("msg_tool_2", "write", { filePath: "Workspace/32423/reports/artifact-eval.csv" }, { filePath: "Workspace/32423/reports/artifact-eval.csv" }),
      message("msg_1", "assistant", "See Workspace/32423/reports/artifact-eval.md and Workspace/32423/reports/artifact-eval.csv"),
    ]);

    expect(targets.map((target) => target.value)).toContain("reports/artifact-eval.md");
    expect(targets.map((target) => target.value)).toContain("reports/artifact-eval.csv");
  });

  it("prefers explicit dynamic tool metadata over prose guesses", () => {
    const targets = deriveOpenTargets([
      toolMessage("msg_tool", "write", { path: "summary.md" }, { path: "summary.md" }),
    ]);

    expect(targets[0]).toMatchObject({ value: "summary.md", preview: "markdown", confidence: 95 });
  });

  it("extracts filePath metadata from write tools", () => {
    const targets = deriveOpenTargets([
      toolMessage("msg_tool", "write", { filePath: "reports/summary.md" }, { filePath: "reports/summary.md" }),
    ]);

    expect(targets[0]).toMatchObject({ value: "reports/summary.md", preview: "markdown", confidence: 95 });
  });

  it("extracts Dockerfile, Makefile, and gitignore correctly and classifies them as text", () => {
    const targets = deriveOpenTargets([
      toolMessage("msg_tool_1", "write", { filePath: "Dockerfile" }, { filePath: "Dockerfile" }),
      toolMessage("msg_tool_2", "write", { filePath: "Makefile" }, { filePath: "Makefile" }),
      toolMessage("msg_tool_3", "write", { filePath: ".gitignore" }, { filePath: ".gitignore" }),
    ]);

    const dockerfileTarget = targets.find((t) => t.value === "Dockerfile");
    const makefileTarget = targets.find((t) => t.value === "Makefile");
    const gitignoreTarget = targets.find((t) => t.value === ".gitignore");

    expect(dockerfileTarget).toMatchObject({ preview: "text", confidence: 95 });
    expect(makefileTarget).toMatchObject({ preview: "text", confidence: 95 });
    expect(gitignoreTarget).toMatchObject({ preview: "text", confidence: 95 });
  });

  it("extracts PowerPoint decks from assistant artifact summaries", () => {
    const targets = deriveOpenTargets([
      message("msg_1", "assistant", "Updated file: decks/openwork-vertebrae-deck.pptx"),
    ]);
    const deck = targets.find((target) => target.value === "decks/openwork-vertebrae-deck.pptx");

    expect(deck).toMatchObject({ preview: "slides", confidence: 65 });
    expect(deck ? isCollectibleArtifactTarget({ ...deck, exists: true }) : false).toBe(true);
  });

  it("extracts artifact paths from OpenWork extension call metadata", () => {
    const targets = deriveOpenTargets([
      toolMessage("msg_tool", "openwork_extension_call", {
        extensionId: "openai-image-generation",
        action: "image_generate",
      }, {
        ok: true,
        extensionId: "openai-image-generation",
        action: "image_generate",
        path: "artifacts/potato.png",
        result: {
          path: "artifacts/potato.png",
          bytes: 12345,
          model: "gpt-image-2",
        },
      }),
    ]);

    expect(targets[0]).toMatchObject({ value: "artifacts/potato.png", preview: "image", confidence: 95 });
  });

  it("extracts artifact targets from attachment sources", () => {
    const targets = deriveOpenTargets([
      {
        id: "msg_attachment",
        role: "assistant",
        parts: [{
          type: "source-document",
          sourceId: "attachment-source",
          mediaType: "text/csv",
          title: "customers.csv",
          filename: "reports/customers.csv",
        }],
      },
    ]);

    expect(targets[0]).toMatchObject({ value: "reports/customers.csv", preview: "sheet", confidence: 95 });
  });

  it("keeps URI-backed source documents as URL targets when filename is missing", () => {
    const targets = deriveOpenTargets([
      {
        id: "msg_source",
        role: "assistant",
        parts: [{
          type: "source-document",
          sourceId: "url-source",
          mediaType: "text/html",
          title: "https://example.com/docs/report.html",
        }],
      },
    ]);

    expect(targets[0]).toMatchObject({ kind: "url", value: "https://example.com/docs/report.html", preview: "browser" });
  });

  it("does not extract file artifacts from read tool metadata or output", () => {
    const targets = deriveOpenTargets([
      toolMessage(
        "msg_tool",
        "read",
        { filePath: "reports/source.md" },
        { content: "Reviewed reports/source.md and referenced reports/source.csv" },
      ),
      message("msg_2", "assistant", "Reviewed reports/source.md and reports/source.csv."),
    ]);

    expect(targets.map((target) => target.value)).not.toContain("reports/source.md");
    expect(targets.map((target) => target.value)).not.toContain("reports/source.csv");
  });

  it("extracts paths written by apply_patch metadata", () => {
    const targets = deriveOpenTargets([
      toolMessage("msg_tool", "apply_patch", {
        patchText: "*** Begin Patch\n*** Add File: reports/new-report.md\n+hello\n*** Update File: reports/existing-report.csv\n@@\n-old\n+new\n*** End Patch",
      }, "Success. Updated files."),
    ]);

    expect(targets.map((target) => target.value)).toContain("reports/new-report.md");
    expect(targets.map((target) => target.value)).toContain("reports/existing-report.csv");
  });

  it("does not turn package search results into artifacts", () => {
    const targets = deriveOpenTargets([
      toolMessage("msg_tool", "glob", { pattern: "**/package.json" }, {
        files: [
          "package.json",
          "apps/app/package.json",
          "packages/ui/package.json",
          "reports/revenue.csv",
        ],
      }),
      message("msg_2", "assistant", "Found package.json, apps/app/package.json, and reports/revenue.csv"),
    ]);

    expect(targets.map((target) => target.value)).not.toContain("package.json");
    expect(targets.map((target) => target.value)).not.toContain("apps/app/package.json");
    expect(targets.map((target) => target.value)).not.toContain("packages/ui/package.json");
    expect(targets.map((target) => target.value)).not.toContain("reports/revenue.csv");
  });

  it("does not turn discovery tool markdown listings into artifacts", () => {
    const targets = deriveOpenTargets([
      toolMessage("msg_write", "write", { filePath: "reports/created-report.md" }, { filePath: "reports/created-report.md" }),
      toolMessage("msg_tool", "glob", { pattern: "**/*.md" }, {
        files: [
          "README.md",
          ".opencode/skills/example/SKILL.md",
          "reports/created-report.md",
        ],
      }),
      message("msg_2", "assistant", "Created reports/created-report.md as the deliverable."),
    ]);

    expect(targets.map((target) => target.value)).toContain("reports/created-report.md");
    expect(targets.map((target) => target.value)).not.toContain("README.md");
    expect(targets.map((target) => target.value)).not.toContain(".opencode/skills/example/SKILL.md");
  });

  it("does not collect server-verified missing file targets", () => {
    const target = deriveOpenTargets([
      toolMessage("msg_tool", "write", { filePath: "index.html" }, { filePath: "index.html" }),
      message("msg_1", "assistant", "Preview file: index.html"),
    ])[0];

    expect(target).toMatchObject({ value: "index.html", preview: "html" });
    expect(isCollectibleArtifactTarget({ ...target, exists: false })).toBe(false);
    expect(isCollectibleArtifactTarget({ ...target, exists: true })).toBe(true);
  });

  it("does not auto-open generated html files or localhost browser previews", () => {
    const targets = deriveOpenTargets([
      toolMessage("msg_tool", "write", { filePath: "public/index.html" }, { filePath: "public/index.html" }),
      message("msg_1", "assistant", "Created public/index.html. API: `http://localhost:3000/api/info`. App: `http://localhost:3000`."),
    ]).map((target) => ({ ...target, exists: target.kind === "url" || target.value === "public/index.html" }));

    expect(targets.map((target) => target.value)).toContain("http://localhost:3000/api/info");
    expect(targets.map((target) => target.value)).toContain("http://localhost:3000");
    expect(selectAutoOpenTarget(targets)).toBeNull();
  });

  it("normalizes escaped localhost root URL variants into one target", () => {
    const targets = deriveOpenTargets([
      message("msg_1", "assistant", "App: `http://localhost:3000/\\` and also http://localhost:3000//"),
    ]);

    expect(targets.filter((target) => target.value === "http://localhost:3000")).toHaveLength(1);
    expect(targets.map((target) => target.name)).not.toContain("\\");
  });

  it("keeps accessible targets from earlier session messages", () => {
    const targets = deriveOpenTargets([
      toolMessage("msg_tool", "write", { filePath: "reports/earlier.csv" }, { filePath: "reports/earlier.csv" }),
      message("msg_1", "assistant", "Created reports/earlier.csv"),
      ...Array.from({ length: 12 }, (_, index) => message(`msg_noise_${index}`, "assistant", `Status update ${index + 1}`)),
      message("msg_last", "assistant", "Server running at http://localhost:3000"),
    ]);

    expect(targets.map((target) => target.value)).toContain("reports/earlier.csv");
    expect(targets.map((target) => target.value)).toContain("http://localhost:3000");
  });

  it("does not auto-open high-confidence deliverables or browser previews", () => {
    const targets = deriveOpenTargets([
      toolMessage("msg_tool", "write", { filePath: "data/customers.csv" }, { filePath: "data/customers.csv" }),
      message("msg_1", "assistant", "Created data/customers.csv and see https://example.com for docs."),
    ]).map((target) => ({ ...target, exists: target.kind === "file" }));

    expect(selectAutoOpenTarget(targets)).toBeNull();
  });

  it("extracts markdown-formatted bold/italic filenames", () => {
    const targets = deriveOpenTargets([
      message("msg_1", "assistant", "Created **Bao_cao_RAM.docx** and *Bao_cao_RAM.pptx* successfully."),
    ]);

    expect(targets.map((target) => target.value)).toContain("Bao_cao_RAM.docx");
    expect(targets.map((target) => target.value)).toContain("Bao_cao_RAM.pptx");
  });

  it("strips workspaceRoot prefix for local workspaces", () => {
    const targets = deriveOpenTargets([
      toolMessage("msg_tool", "write", { filePath: "/home/user/project/reports/summary.md" }, { filePath: "/home/user/project/reports/summary.md" }),
    ], { workspaceRoot: "/home/user/project" });

    expect(targets.map((target) => target.value)).toContain("reports/summary.md");
  });

  it("does not strip workspaceRoot prefix for remote workspaces", () => {
    const targets = deriveOpenTargets([
      toolMessage("msg_tool", "write", { filePath: "/srv/workspace/reports/summary.md" }, { filePath: "/srv/workspace/reports/summary.md" }),
    ], { workspaceRoot: "/srv/workspace", isRemoteWorkspace: true });

    // For remote workspaces, workspaceRoot stripping AND leading-slash stripping
    // are skipped so the remote server can resolve the absolute path against its
    // own filesystem root via relative(workspaceResolved, absolutePath).
    expect(targets.map((target) => target.value)).toContain("/srv/workspace/reports/summary.md");
  });

  it("still strips workspace/<id>/ protocol prefixes for remote workspaces", () => {
    const targets = deriveOpenTargets([
      toolMessage("msg_tool", "write", { filePath: "Workspace/ws_abc123/reports/summary.md" }, { filePath: "Workspace/ws_abc123/reports/summary.md" }),
    ], { isRemoteWorkspace: true });

    expect(targets.map((target) => target.value)).toContain("reports/summary.md");
  });

  it("retains leading slash for paths under /tmp/opencode/ even for local workspaces", () => {
    const targets = deriveOpenTargets([
      toolMessage("msg_tool", "write", { filePath: "/tmp/opencode/OpenWork.docx" }, { filePath: "/tmp/opencode/OpenWork.docx" }),
    ], { workspaceRoot: "/home/user/project" });

    expect(targets.map((target) => target.value)).toContain("/tmp/opencode/OpenWork.docx");
  });
});

describe("isCollectibleArtifactTarget", () => {
  it("accepts high-confidence file targets with optimistic exists for remote", () => {
    const target = {
      id: "file:output.md",
      kind: "file" as const,
      value: "output.md",
      name: "output.md",
      preview: "markdown" as const,
      confidence: 95,
      reason: "write tool metadata",
      exists: true,
    };

    expect(isCollectibleArtifactTarget(target)).toBe(true);
  });

  it("rejects file targets with exists: false even for remote", () => {
    const target = {
      id: "file:missing.md",
      kind: "file" as const,
      value: "missing.md",
      name: "missing.md",
      preview: "markdown" as const,
      confidence: 95,
      reason: "write tool metadata",
      exists: false,
    };

    expect(isCollectibleArtifactTarget(target)).toBe(false);
  });

  it("rejects file targets with undefined exists", () => {
    const target = {
      id: "file:unknown.md",
      kind: "file" as const,
      value: "unknown.md",
      name: "unknown.md",
      preview: "markdown" as const,
      confidence: 95,
      reason: "write tool metadata",
    };

    expect(isCollectibleArtifactTarget(target)).toBe(false);
  });
});

describe("linkifyOpenTargets", () => {
  const fileTarget = {
    id: "file:/srv/workspace/docs.docx",
    kind: "file" as const,
    value: "/srv/workspace/docs.docx",
    name: "docs.docx",
    preview: "external" as const,
    confidence: 65,
    reason: "message",
  };
  const urlTarget = {
    id: "url:https://example.com/api",
    kind: "url" as const,
    value: "https://example.com/api",
    name: "api",
    preview: "browser" as const,
    confidence: 70,
    reason: "message",
  };

  it("wraps bare file path in markdown link", () => {
    const text = "Created /srv/workspace/docs.docx with content.";
    const result = linkifyOpenTargets(text, [fileTarget]);
    expect(result).toContain("[/srv/workspace/docs.docx](#openwork-target:");
    expect(result).toContain(encodeURIComponent(fileTarget.id));
  });

  it("wraps bare URL in markdown link", () => {
    const text = "Check https://example.com/api for details.";
    const result = linkifyOpenTargets(text, [urlTarget]);
    expect(result).toContain("[https://example.com/api](#openwork-target:");
  });

  it("does not double-link already linked markdown syntax", () => {
    const text = "See [docs](/srv/workspace/docs.docx) for info.";
    const result = linkifyOpenTargets(text, [fileTarget]);
    // Should NOT add another link around the path inside the existing link
    expect(result).not.toContain("[/srv/workspace/docs.docx](#openwork-target:");
  });

  it("returns original text when no targets match", () => {
    const text = "Hello world";
    const result = linkifyOpenTargets(text, [fileTarget]);
    expect(result).toBe("Hello world");
  });

  it("returns original text when targets array is empty", () => {
    const text = "Created /srv/workspace/docs.docx";
    const result = linkifyOpenTargets(text, []);
    expect(result).toBe(text);
  });

  it("handles multiple targets in one text", () => {
    const text = "Created /srv/workspace/docs.docx. See https://example.com/api.";
    const result = linkifyOpenTargets(text, [fileTarget, urlTarget]);
    expect(result).toContain("[/srv/workspace/docs.docx](#openwork-target:");
    expect(result).toContain("[https://example.com/api](#openwork-target:");
  });
});

describe("parseOpenWorkTargetHref", () => {
  it("parses a valid openwork target href", () => {
    const id = "file:/srv/workspace/docs.docx";
    const href = `#openwork-target:${encodeURIComponent(id)}`;
    expect(parseOpenWorkTargetHref(href)).toBe(id);
  });

  it("returns null for non-openwork hrefs", () => {
    expect(parseOpenWorkTargetHref("#section")).toBeNull();
    expect(parseOpenWorkTargetHref("https://example.com")).toBeNull();
  });
});

describe("isOpenWorkTargetHref", () => {
  it("recognizes openwork target hrefs", () => {
    expect(isOpenWorkTargetHref("#openwork-target:file%3A%2Ftest.md")).toBe(true);
  });

  it("rejects other hrefs", () => {
    expect(isOpenWorkTargetHref("#section")).toBe(false);
    expect(isOpenWorkTargetHref("https://example.com")).toBe(false);
  });
});

