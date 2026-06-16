import { describe, expect, test } from "bun:test";
import { isMultimodalSupported } from "../src/react-app/domains/session/sync/prompt-file-parts";

describe("isMultimodalSupported", () => {
  test("identifies image MIME types as supported", () => {
    expect(isMultimodalSupported("image/png")).toBe(true);
    expect(isMultimodalSupported("image/jpeg")).toBe(true);
    expect(isMultimodalSupported("image/gif")).toBe(true);
    expect(isMultimodalSupported("IMAGE/PNG")).toBe(true);
  });

  test("identifies PDF MIME type support based on model capabilities", () => {
    const geminiModel = { providerID: "google", modelID: "gemini-1.5-pro" };
    const claudeModel = { providerID: "anthropic", modelID: "claude-3-5-sonnet" };
    const deepseekModel = { providerID: "deepseek", modelID: "deepseek-coder" };

    expect(isMultimodalSupported("application/pdf", geminiModel)).toBe(true);
    expect(isMultimodalSupported("application/pdf", claudeModel)).toBe(true);
    expect(isMultimodalSupported("APPLICATION/PDF", geminiModel)).toBe(true);
    expect(isMultimodalSupported("application/pdf", deepseekModel)).toBe(false);
    expect(isMultimodalSupported("application/pdf")).toBe(false);
  });

  test("identifies plain text and text/* MIME types as supported", () => {
    expect(isMultimodalSupported("text/plain")).toBe(true);
    expect(isMultimodalSupported("text/markdown")).toBe(true);
    expect(isMultimodalSupported("text/html")).toBe(true);
    expect(isMultimodalSupported("TEXT/PLAIN")).toBe(true);
  });

  test("identifies spreadsheet formats as supported", () => {
    expect(isMultimodalSupported("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(true); // xlsx
    expect(isMultimodalSupported("application/vnd.ms-excel")).toBe(true); // xls
    expect(isMultimodalSupported("application/vnd.oasis.opendocument.spreadsheet")).toBe(true); // ods
    expect(isMultimodalSupported("text/csv")).toBe(true); // csv
    expect(isMultimodalSupported("text/tab-separated-values")).toBe(true); // tsv
  });

  test("identifies unsupported binary formats as unsupported", () => {
    expect(isMultimodalSupported("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(false); // docx
    expect(isMultimodalSupported("application/zip")).toBe(false);
    expect(isMultimodalSupported("application/octet-stream")).toBe(false);
  });
});
