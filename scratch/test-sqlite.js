import { Database } from "bun:sqlite";

try {
  console.log("Testing bun:sqlite with a directory path...");
  const db = new Database("scratch");
  console.log("Success opening directory?!");
  db.close();
} catch (e) {
  console.error("Failed opening directory (expected):", e.message || e);
}
