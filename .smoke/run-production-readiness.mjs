import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const vite = join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const campaign = join(here, 'production-readiness.mjs')
const port = Number(process.env.SCROLL_RACE_READINESS_PORT ?? 20073)
const baseUrl = `http://127.0.0.1:${port}`

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      ...options,
    })

    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()

        return
      }

      reject(
        new Error(
          `${command} exited with ${code ?? `signal ${signal ?? 'unknown'}`}`,
        ),
      )
    })
  })
}

async function waitForPreview(child) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Production preview exited early with ${child.exitCode}`)
    }

    try {
      const response = await fetch(baseUrl)

      if (response.ok) {
        return
      }
    } catch {
      // The listener is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`Production preview did not become ready at ${baseUrl}`)
}

let preview

try {
  try {
    const occupied = await fetch(baseUrl)

    if (occupied) {
      throw new Error(
        `${baseUrl} is already in use. Set SCROLL_RACE_READINESS_PORT to a free local port.`,
      )
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith(`${baseUrl} is already in use`)
    ) {
      throw error
    }
  }

  await run(process.execPath, [vite, 'build'])
  preview = spawn(
    process.execPath,
    [
      vite,
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      cwd: root,
      stdio: 'inherit',
    },
  )
  await waitForPreview(preview)
  await run(process.execPath, [campaign], {
    env: {
      ...process.env,
      SCROLL_RACE_READINESS_URL: baseUrl,
    },
  })
} finally {
  if (preview && preview.exitCode === null) {
    preview.kill()
  }
}
