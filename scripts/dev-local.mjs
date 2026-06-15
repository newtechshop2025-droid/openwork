import { spawn } from "node:child_process"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const composeFile = path.join(rootDir, "packaging", "docker", "docker-compose.web-local.yml")
const composeProject = "openwork-den-local"

const apiPort = process.env.DEN_API_PORT?.trim() || process.env.DEN_CONTROLLER_PORT?.trim() || "8788"
const workerProxyPort = process.env.DEN_WORKER_PROXY_PORT?.trim() || "8789"
const inferencePort = process.env.INFERENCE_PORT?.trim() || "8791"
const webPort = process.env.DEN_WEB_PORT?.trim() || "3005"
const appPort = process.env.OPENWORK_APP_PORT?.trim() || process.env.PORT?.trim() || "5173"
const databaseUrl = process.env.DATABASE_URL?.trim() || "mysql://root:password@127.0.0.1:3308/openwork_den"
const dbEncryptionKey =
  process.env.DEN_DB_ENCRYPTION_KEY?.trim() ||
  "local-dev-db-encryption-key-please-change-1234567890"

function detectWebOrigins() {
  const origins = new Set([
    `http://localhost:${webPort}`,
    `http://127.0.0.1:${webPort}`,
    `http://0.0.0.0:${webPort}`,
    `http://localhost:${appPort}`,
    `http://127.0.0.1:${appPort}`,
  ])

  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (!entry || entry.internal || entry.family !== "IPv4") {
        continue
      }

      origins.add(`http://${entry.address}:${webPort}`)
    }
  }

  return Array.from(origins).join(",")
}

function parseDatabaseEndpoint(value) {
  const parsed = new URL(value)
  return {
    host: parsed.hostname,
    port: Number(parsed.port || "3306"),
  }
}

function canReachMysql(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })

    const finalize = (result) => {
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(1500)
    socket.once("connect", () => finalize(true))
    socket.once("error", () => finalize(false))
    socket.once("timeout", () => finalize(false))
  })
}

function canListenOnPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer()

    const finalize = (result) => {
      server.close(() => resolve(result))
    }

    server.once("error", () => resolve(false))
    server.once("listening", () => finalize(true))
    server.listen(port, "0.0.0.0")
  })
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      stdio: "inherit",
      ...options,
    })

    child.once("error", reject)
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      const detail = signal ? `signal ${signal}` : `exit code ${code ?? 1}`
      reject(new Error(`${command} ${args.join(" ")} failed with ${detail}`))
    })
  })
}

let startedMysql = false
let cleaningUp = false
const activeChildren = new Map()

function stopTurboChild() {
  const promises = []
  for (const [name, child] of activeChildren.entries()) {
    if (child && child.exitCode === null) {
      console.log(`[dev] Stopping ${name}...`)
      promises.push(new Promise((resolve) => {
        child.once("exit", resolve)
        child.kill("SIGINT")
        setTimeout(() => {
          if (child.exitCode === null) {
            child.kill("SIGKILL")
          }
        }, 2000)
      }))
    }
  }
  return Promise.all(promises)
}

async function cleanup(exitCode = 0) {
  if (cleaningUp) {
    return
  }

  cleaningUp = true

  await stopTurboChild()

  if (startedMysql) {
    await run("docker", ["compose", "-p", composeProject, "-f", composeFile, "down"], {
      stdio: "inherit",
    }).catch(() => {})
  }

  process.exit(exitCode)
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    void cleanup(0)
  })
}

async function main() {
  for (const [name, port] of [["den-web", webPort], ["den-api", apiPort], ["den-worker-proxy", workerProxyPort], ["inference", inferencePort]]) {
    const available = await canListenOnPort(Number(port))
    if (!available) {
      throw new Error(`${name} local port ${port} is already in use. Stop the existing process or rerun with a different port env override.`)
    }
  }

  const { host, port } = parseDatabaseEndpoint(databaseUrl)
  const mysqlAvailable = await canReachMysql(host, port)

  if (!mysqlAvailable) {
    if (!(host === "127.0.0.1" || host === "localhost")) {
      throw new Error(`MySQL at ${host}:${port} is not reachable, and auto-start only supports localhost`) 
    }

    console.log(`[den] MySQL not reachable at ${host}:${port}; starting Docker MySQL...`)
    await run("docker", ["compose", "-p", composeProject, "-f", composeFile, "up", "-d", "--wait", "mysql"])
    startedMysql = true
  } else {
    console.log(`[den] Using existing MySQL at ${host}:${port}`)
  }

  console.log("[den] Syncing Den schema...")
  await run("bash", ["-lc", "pnpm --filter @openwork-ee/den-db build && pnpm --filter @openwork-ee/den-db exec node --import tsx ./node_modules/drizzle-kit/bin.cjs push --config drizzle.config.ts --force"], {
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  })

  const webOrigins = detectWebOrigins()
  console.log(`[den] Allowed local web origins: ${webOrigins}`)

  const serviceEnv = {
    ...process.env,
    OPENWORK_DEV_MODE: process.env.OPENWORK_DEV_MODE?.trim() || "1",
    DATABASE_URL: databaseUrl,
    DEN_DB_ENCRYPTION_KEY: dbEncryptionKey,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET?.trim() || "local-dev-secret-not-for-production-use!!",
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL?.trim() || `http://localhost:${webPort}`,
    DEN_MCP_RESOURCE_URL: process.env.DEN_MCP_RESOURCE_URL?.trim() || `http://127.0.0.1:${apiPort}/mcp`,
    DEN_BETTER_AUTH_TRUSTED_ORIGINS: process.env.DEN_BETTER_AUTH_TRUSTED_ORIGINS?.trim() || webOrigins,
    CORS_ORIGINS: process.env.CORS_ORIGINS?.trim() || webOrigins,
    DEN_API_PORT: apiPort,
    DEN_CONTROLLER_PORT: apiPort,
    DEN_WORKER_PROXY_PORT: workerProxyPort,
    INFERENCE_PORT: inferencePort,
    INFERENCE_PROXY_BASE_URL: process.env.INFERENCE_PROXY_BASE_URL?.trim() || `http://127.0.0.1:${inferencePort}`,
    INFERENCE_ADMIN_TOKEN: process.env.INFERENCE_ADMIN_TOKEN?.trim() || "local-dev-admin-token",
    INFERENCE_WEBHOOK_SECRET: process.env.INFERENCE_WEBHOOK_SECRET?.trim() || "local-dev-webhook-secret",
    DEN_WEB_PORT: webPort,
    DEN_API_BASE: process.env.DEN_API_BASE?.trim() || `http://127.0.0.1:${apiPort}`,
    DEN_AUTH_ORIGIN: process.env.DEN_AUTH_ORIGIN?.trim() || `http://localhost:${webPort}`,
    DEN_AUTH_FALLBACK_BASE: process.env.DEN_AUTH_FALLBACK_BASE?.trim() || `http://127.0.0.1:${apiPort}`,
    PROVISIONER_MODE: process.env.PROVISIONER_MODE?.trim() || "stub",
  }

  const services = [
    { name: "@openwork-ee/den-api", cwd: path.join(rootDir, "ee", "apps", "den-api") },
    { name: "@openwork-ee/inference", cwd: path.join(rootDir, "ee", "apps", "inference") },
    { name: "@openwork-ee/den-worker-proxy", cwd: path.join(rootDir, "ee", "apps", "den-worker-proxy") },
    { name: "@openwork-ee/den-web", cwd: path.join(rootDir, "ee", "apps", "den-web") },
  ]

  const startService = (service) => {
    if (cleaningUp) return
    console.log(`[dev] Starting ${service.name}...`)
    const child = spawn("pnpm", ["run", "dev:local"], {
      cwd: service.cwd,
      env: serviceEnv,
    })

    activeChildren.set(service.name, child)

    child.stdout.on("data", (data) => {
      const lines = data.toString().split("\n")
      for (const line of lines) {
        if (line.trim()) console.log(`${service.name}: ${line}`)
      }
    })

    child.stderr.on("data", (data) => {
      const lines = data.toString().split("\n")
      for (const line of lines) {
        if (line.trim()) console.error(`${service.name} [ERR]: ${line}`)
      }
    })

    child.once("exit", (code, signal) => {
      activeChildren.delete(service.name)
      if (cleaningUp) return
      const detail = signal ? `signal ${signal}` : `exit code ${code ?? 1}`
      console.warn(`[dev] ${service.name} crashed or exited with ${detail}. Restarting in 2 seconds...`)
      setTimeout(() => startService(service), 2000)
    })
  }

  for (const service of services) {
    startService(service)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  void cleanup(1)
})
