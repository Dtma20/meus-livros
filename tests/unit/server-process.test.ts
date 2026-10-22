import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { stopServer, waitForServerPort } from '../integration/server-process'

describe('SSR child process lifecycle', () => {
  it('waits for a complete port announcement split across stdout chunks', async () => {
    const child = spawn(process.execPath, ['-e', "process.stdout.write('PO'); setTimeout(() => process.stdout.write('RT:12'), 10); setTimeout(() => process.stdout.write('345\\n'), 20); setInterval(() => {}, 1000)"])
    try { expect(await waitForServerPort(child)).toBe('http://127.0.0.1:12345') }
    finally { await stopServer(child) }
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
  })
  it('rejects early server exit rather than waiting for the hook timeout', async () => {
    const child = spawn(process.execPath, ['-e', 'process.exit(7)'])
    try { await expect(waitForServerPort(child)).rejects.toThrow(/código 7/) }
    finally { await stopServer(child) }
  })
  it('rejects missing announcements and still shuts down the process', async () => {
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'])
    try { await expect(waitForServerPort(child, 100)).rejects.toThrow(/100ms/) }
    finally { await stopServer(child) }
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
  })
})
