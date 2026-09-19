import http from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const serverPath = path.resolve('.vercel/output/functions/__fallback.func/index.mjs')
const { default: handler } = await import(pathToFileURL(serverPath).href)
const server = http.createServer(handler)

server.listen(0, '127.0.0.1', () => {
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  if (process.send) {
    process.send({ port })
  } else {
    console.log(`PORT:${port}`)
  }
})
