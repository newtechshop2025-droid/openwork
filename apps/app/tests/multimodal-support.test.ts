import { describe, expect, test } from "bun:test";
import { isMultimodalSupported } from "../src/react-app/domains/session/sync/prompt-file-parts";

describe("isMultimodalSupported", () => {
  test("identifies image MIME types as supported", () => {
    expect(isMultimodalSupported("image/png")).toBe(true);
    expect(isMultimodalSupported("image/jpeg")).toBe(true);
    expect(isMultimodalSupported("image/gif")).toBe(true);
    expect(isMultimodalSupported("IMAGE/PNG")).toBe(true);
  });

  test("identifies PDF MIME type as supported", () => {
    expect(isMultimodalSupported("application/pdf")).toBe(true);
    expect(isMultimodalSupported("APPLICATION/PDF")).toBe(true);
  });

  test("identifies plain text and text/* MIME types as supported", () => {
    expect(isMultimodalSupported("text/plain")).toBe(true);
    expect(isMultimodalSupported("text/markdown")).toBe(true);
    expect(isMultimodalSupported("text/html")).toBe(true);
    expect(isMultimodalSupported("TEXT/PLAIN")).toBe(true);
  });

  test("identifies unsupported binary formats as unsupported", () => {
    expect(isMultimodalSupported("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(false); // docx
    expect(isMultimodalSupported("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(false); // xlsx
    expect(isMultimodalSupported("application/zip")).toBe(false);
    expect(isMultimodalSupported("application/octet-stream")).toBe(false);
  });
});
