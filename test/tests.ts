import { resolve } from 'pathe'
import { listen, Listener } from 'listhen'
import destr from 'destr'
import { fetch } from 'ohmyfetch'
import { expect, it, afterAll } from 'vitest'
import { fileURLToPath } from 'mlly'
import { joinURL } from 'ufo'
import * as _nitro from '../src'
import type { Nitro } from '../src'

const { createNitro, build, prepare, copyPublicAssets, prerender } = (_nitro as any as { default: typeof _nitro }).default || _nitro

interface Context {
  preset: string
  nitro?: Nitro,
  rootDir: string
  outDir: string
  fetch: (url:string) => Promise<any>
  server?: Listener
}

export async function setupTest (preset) {
  const fixtureDir = fileURLToPath(new URL('./fixture', import.meta.url).href)

  const ctx: Context = {
    preset,
    rootDir: fixtureDir,
    outDir: resolve(fixtureDir, '.output', preset),
    fetch: url => fetch(joinURL(ctx.server!.url, url.slice(1)))
  }

  const nitro = ctx.nitro = await createNitro({
    preset: ctx.preset,
    rootDir: ctx.rootDir,
    serveStatic: preset !== 'cloudflare' && preset !== 'vercel-edge',
    output: { dir: ctx.outDir }
  })
  await prepare(nitro)
  await copyPublicAssets(nitro)
  await prerender(nitro)
  await build(nitro)

  afterAll(async () => {
    if (ctx.server) {
      await ctx.server.close()
    }
    if (ctx.nitro) {
      await ctx.nitro.close()
    }
  })

  return ctx
}

export async function startServer (ctx, handle) {
  ctx.server = await listen(handle)
  console.log('>', ctx.server!.url)
}

type TestHandlerResult = { data: any, status: number, headers: Record<string, string>}
type TestHandler = (options: any) => Promise<TestHandlerResult | Response>

export function testNitro (ctx: Context, getHandler: () => TestHandler | Promise<TestHandler>) {
  let _handler: TestHandler

  async function callHandler (options): Promise<TestHandlerResult> {
    const result = await _handler(options)
    if (result.constructor.name !== 'Response') {
      return result as TestHandlerResult
    }
    return {
      data: destr(await (result as Response).text()),
      status: result.status,
      headers: Object.fromEntries((result as Response).headers.entries())
    }
  }

  it('setup handler', async () => {
    _handler = await getHandler()
  })

  it('API Works', async () => {
    const { data: helloData } = await callHandler({ url: '/api/hello' })
    expect(helloData).to.toMatchObject({ message: 'Hello API' })

    const { data: heyData } = await callHandler({ url: '/api/hey' })
    expect(heyData).to.have.string('Hey API')

    const { data: kebabData } = await callHandler({ url: '/api/kebab' })
    expect(kebabData).to.have.string('hello-world')

    const { data: paramsData } = await callHandler({ url: '/api/param/test_param' })
    expect(paramsData).toBe('test_param')

    const { data: paramsData2 } = await callHandler({ url: '/api/wildcard/foo/bar/baz' })
    expect(paramsData2).toBe('foo/bar/baz')
  })

  it('handles errors', async () => {
    const { status } = await callHandler({
      url: '/api/error',
      headers: {
        Accept: 'application/json'
      }
    })
    expect(status).toBe(503)
    const { data: heyData } = await callHandler({ url: '/api/hey' })
    expect(heyData).to.have.string('Hey API')
  })

  it('universal import.meta', async () => {
    const { status, data } = await callHandler({ url: '/api/import-meta' })
    expect(status).toBe(200)
    expect(data.testFile).toMatch(/\/test.txt$/)
    expect(data.hasEnv).toBe(true)
  })

  if (ctx.nitro!.options.serveStatic) {
    it('serve static asset /favicon.ico', async () => {
      const { status, headers } = await callHandler({ url: '/favicon.ico' })
      expect(status).toBe(200)
      expect(headers.etag).toBeDefined()
      expect(headers['content-type']).toMatchInlineSnapshot('"image/vnd.microsoft.icon"')
    })

    it('serve static asset /build/test.txt', async () => {
      const { status, headers } = await callHandler({ url: '/build/test.txt' })
      expect(status).toBe(200)
      expect(headers.etag).toMatchInlineSnapshot('"\\"7-vxGfAKTuGVGhpDZqQLqV60dnKPw\\""')
      expect(headers['content-type']).toMatchInlineSnapshot('"text/plain; charset=utf-8"')
    })

    it('shows 404 for /build/non-file', async () => {
      const { status } = await callHandler({ url: '/build/non-file' })
      expect(status).toBe(404)
    })

    it('resolve module version conflicts', async () => {
      const { data } = await callHandler({ url: '/modules' })
      expect(data).toMatchObject({ depA: '2.0.1', depB: '2.0.1', depLib: '2.0.1' })
    })
  }
}
