import type { ChildProcess } from 'node:child_process'

export function waitForServerPort(child: ChildProcess, timeoutMs = 30_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = ''
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`O servidor não anunciou a porta em ${timeoutMs}ms.`))
    }, timeoutMs)
    function cleanup() {
      clearTimeout(timer)
      child.stdout?.off('data', onData)
      child.off('error', onError)
      child.off('exit', onExit)
    }
    function onData(data: Buffer | string) {
      output += data.toString()
      const match = output.match(/PORT:(\d+)\r?\n/)
      if (match?.[1]) {
        cleanup()
        resolve(`http://127.0.0.1:${match[1]}`)
      }
    }
    function onError(error: Error) { cleanup(); reject(error) }
    function onExit(code: number | null) {
      cleanup()
      reject(new Error(`Servidor encerrou antes de anunciar a porta (código ${code ?? 'desconhecido'}).`))
    }
    child.stdout?.on('data', onData)
    child.on('error', onError)
    child.on('exit', onExit)
  })
}

export async function stopServer(child: ChildProcess | null | undefined): Promise<void> {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.off('close', onClose)
      reject(new Error('Servidor de teste não encerrou após kill.'))
    }, 5_000)
    function onClose() { clearTimeout(timer); resolve() }
    child.once('close', onClose)
    child.kill()
  })
}
