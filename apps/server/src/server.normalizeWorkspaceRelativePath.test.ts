import { describe, expect, test } from "bun:test";
import { isSupportedWorkspaceTextFilePath, normalizeWorkspaceRelativePath, resolveWorkspaceRelativePath } from "./server.js";

describe("normalizeWorkspaceRelativePath", () => {
  test("accepts a plain workspace-relative path", () => {
    expect(normalizeWorkspaceRelativePath("notes.md", { allowSubdirs: true })).toBe("notes.md");
  });

  test("strips workspace/ prefix", () => {
    expect(normalizeWorkspaceRelativePath("workspace/notes.md", { allowSubdirs: true })).toBe("notes.md");
    expect(normalizeWorkspaceRelativePath("workspace/dir/notes.md", { allowSubdirs: true })).toBe("dir/notes.md");
  });

  test("strips Workspace/<id>/ prefix from rendered artifact paths", () => {
    expect(normalizeWorkspaceRelativePath("Workspace/32423/reports/artifact-eval.md", { allowSubdirs: true })).toBe("reports/artifact-eval.md");
    expect(normalizeWorkspaceRelativePath("workspaces/demo/reports/artifact-eval.csv", { allowSubdirs: true })).toBe("reports/artifact-eval.csv");
  });

  test("strips /workspace/ prefix", () => {
    expect(normalizeWorkspaceRelativePath("/workspace/notes.md", { allowSubdirs: true })).toBe("notes.md");
    expect(normalizeWorkspaceRelativePath("//workspace/dir/notes.md", { allowSubdirs: true })).toBe("dir/notes.md");
  });

  test("strips ./workspace/ prefix", () => {
    expect(normalizeWorkspaceRelativePath("./workspace/notes.md", { allowSubdirs: true })).toBe("notes.md");
  });

  test("strips tmp/opencode/ and tmp/workspace/ sandbox roots", () => {
    expect(normalizeWorkspaceRelativePath("tmp/opencode/notes.md", { allowSubdirs: true })).toBe("notes.md");
    expect(normalizeWorkspaceRelativePath("/tmp/workspace/dir/notes.md", { allowSubdirs: true })).toBe("dir/notes.md");
  });

  test("still rejects traversal after stripping prefixes", () => {
    expect(() => normalizeWorkspaceRelativePath("workspace/../secrets.md", { allowSubdirs: true })).toThrow();
    expect(() => normalizeWorkspaceRelativePath("/workspace/../secrets.md", { allowSubdirs: true })).toThrow();
  });

  test("still enforces allowSubdirs", () => {
    expect(() => normalizeWorkspaceRelativePath("workspace/dir/notes.md", { allowSubdirs: false })).toThrow();
  });

  test("treats workspace/ with no file as invalid", () => {
    expect(() => normalizeWorkspaceRelativePath("workspace/", { allowSubdirs: true })).toThrow();
    expect(() => normalizeWorkspaceRelativePath("/workspace/", { allowSubdirs: true })).toThrow();
  });
});

describe("isSupportedWorkspaceTextFilePath", () => {
  test("accepts workspace text artifact extensions", () => {
    expect(isSupportedWorkspaceTextFilePath("reports/revenue.csv")).toBe(true);
    expect(isSupportedWorkspaceTextFilePath("reports/revenue.tsv")).toBe(true);
    expect(isSupportedWorkspaceTextFilePath("logs/run.log")).toBe(true);
    expect(isSupportedWorkspaceTextFilePath("config/app.yaml")).toBe(true);
    expect(isSupportedWorkspaceTextFilePath("styles/app.css")).toBe(true);
    expect(isSupportedWorkspaceTextFilePath("dist/index.html")).toBe(true);
  });

  test("keeps accepting OpenCode config/plugin text file extensions", () => {
    expect(isSupportedWorkspaceTextFilePath(".opencode/tools/cloud.ts")).toBe(true);
    expect(isSupportedWorkspaceTextFilePath(".opencode/mcps/cloud.json")).toBe(true);
    expect(isSupportedWorkspaceTextFilePath(".opencode/plugins/cloud.txt")).toBe(true);
  });

  test("rejects unsupported binary-like extensions", () => {
    expect(isSupportedWorkspaceTextFilePath(".opencode/plugins/cloud.bin")).toBe(false);
  });
});

describe("resolveWorkspaceRelativePath", () => {
  test("resolves relative path correctly", () => {
    expect(resolveWorkspaceRelativePath("/home/acer/openwork", "notes.md")).toBe("notes.md");
    expect(resolveWorkspaceRelativePath("/home/acer/openwork", "dir/notes.md")).toBe("dir/notes.md");
  });

  test("resolves absolute path inside workspace root correctly", () => {
    expect(resolveWorkspaceRelativePath("/home/acer/openwork", "/home/acer/openwork/notes.md")).toBe("notes.md");
    expect(resolveWorkspaceRelativePath("/home/acer/openwork", "/home/acer/openwork/dir/notes.md")).toBe("dir/notes.md");
  });

  test("throws error if absolute path is outside workspace root", () => {
    expect(() => resolveWorkspaceRelativePath("/home/acer/openwork", "/home/acer/downloads/notes.md")).toThrow();
    expect(() => resolveWorkspaceRelativePath("/home/acer/openwork", "/etc/passwd")).toThrow();
  });
});
