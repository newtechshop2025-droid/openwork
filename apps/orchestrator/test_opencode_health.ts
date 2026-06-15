import { createOpencodeClient } from "@opencode-ai/sdk/v2/client";

function unwrap<T>(result: any): T {
  if (result.data !== undefined) {
    return result.data;
  }
  const message =
    result.error instanceof Error
      ? result.error.message
      : typeof result.error === "string"
        ? result.error
        : JSON.stringify(result.error);
  throw new Error(message || "Unknown error");
}

async function waitForOpencodeHealthy(
  client: any,
  timeoutMs = 10_000,
  pollMs = 250,
) {
  const start = Date.now();
  let lastError: string | null = null;
  let iterations = 0;
  while (Date.now() - start < timeoutMs) {
    iterations++;
    console.log(`Iteration ${iterations}, elapsed: ${Date.now() - start}ms`);
    try {
      console.log("Probing global.health...");
      const health = unwrap(
        await Promise.race([
          client.global.health(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 2000)
          ),
        ])
      );
      console.log("health resolved:", health);
      if (health?.healthy) return health;
      lastError = "Server reported unhealthy";
    } catch (error) {
      console.log("health failed:", error);
      lastError = error instanceof Error ? error.message : String(error);
    }

    try {
      console.log("Probing path.get...");
      unwrap(
        await Promise.race([
          client.path.get(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 2000)
          ),
        ])
      );
      console.log("path resolved successfully");
      return { healthy: true, degraded: true, reason: lastError ?? undefined };
    } catch (error) {
      console.log("path failed:", error);
      if (!lastError) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    console.log("Waiting pollMs...");
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(lastError ?? "Timed out waiting for OpenCode health");
}

async function main() {
  console.log("Creating client...");
  const client = createOpencodeClient({
    baseUrl: "http://127.0.0.1:34915",
    directory: "/srv/workspace",
  });

  console.log("Starting waitForOpencodeHealthy...");
  try {
    const res = await waitForOpencodeHealthy(client);
    console.log("waitForOpencodeHealthy resolved:", res);
  } catch (err) {
    console.error("waitForOpencodeHealthy thrown:", err);
  }
}

main().catch(console.error);
