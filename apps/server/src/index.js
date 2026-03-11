import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { Jimp } from 'jimp'
import { nanoid } from 'nanoid'
import { EXPIRY_OPTIONS, VISIBILITY_OPTIONS } from '@tmpprompt/shared'
import {
  buildDocumentExports,
  canEditDocument,
  createDocument,
  deleteDocument,
  getDocumentBySlug,
  listDocuments,
  updateDocument,
} from './repository.js'

const app = Fastify({ logger: true })
const port = Number(process.env.PORT || 3000)
const host = process.env.HOST || '0.0.0.0'
const uploadsDir = path.resolve(process.cwd(), 'uploads')
const tmpDir = path.resolve(process.cwd(), 'tmp')

fs.mkdirSync(uploadsDir, { recursive: true })
fs.mkdirSync(tmpDir, { recursive: true })

await app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-edit-token'],
})

await app.register(multipart, {
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 1,
  },
})

await app.register(fastifyStatic, {
  root: uploadsDir,
  prefix: '/uploads/',
})

app.get('/health', async () => ({ ok: true }))

app.get('/api/meta', async () => ({
  expiryOptions: EXPIRY_OPTIONS,
  visibilityOptions: VISIBILITY_OPTIONS,
}))

app.get('/api/documents', async () => ({
  items: listDocuments(),
}))

app.post('/api/documents', async (request, reply) => {
  const document = createDocument(request.body || {})
  return reply.code(201).send(document)
})

app.get('/api/documents/:slug', async (request, reply) => {
  const document = getDocumentBySlug(request.params.slug)
  if (!document) {
    return reply.code(404).send({ message: '文档不存在。' })
  }
  if (document.expired) {
    return reply.code(410).send({ message: '文档已过期。' })
  }

  return {
    ...document,
    canEdit: canEditDocument(request.params.slug, request.headers['x-edit-token']),
  }
})

app.put('/api/documents/:slug', async (request, reply) => {
  const result = updateDocument(request.params.slug, request.body || {})
  if (result.error === 'not_found') {
    return reply.code(404).send({ message: '文档不存在。' })
  }
  if (result.error === 'forbidden') {
    return reply.code(403).send({ message: '编辑凭证无效。' })
  }
  return result
})

app.delete('/api/documents/:slug', async (request, reply) => {
  const result = deleteDocument(request.params.slug, request.body?.editToken)
  if (result.error === 'not_found') {
    return reply.code(404).send({ message: '文档不存在。' })
  }
  if (result.error === 'forbidden') {
    return reply.code(403).send({ message: '编辑凭证无效。' })
  }
  return reply.code(204).send()
})

app.post('/api/uploads', async (request, reply) => {
  const part = await request.file()
  if (!part) {
    return reply.code(400).send({ message: '没有收到上传文件。' })
  }

  const tempPath = path.join(tmpDir, `${nanoid(12)}-${part.filename || 'upload'}`)
  await pipeline(part.file, fs.createWriteStream(tempPath))

  const image = await Jimp.read(tempPath)
  image.scaleToFit({ w: 1600, h: 1600 })

  const outputName = `${nanoid(16)}.jpg`
  const outputPath = path.join(uploadsDir, outputName)
  const outputBuffer = await image.getBuffer('image/jpeg', { quality: 82 })
  fs.writeFileSync(outputPath, outputBuffer)
  fs.rmSync(tempPath, { force: true })

  const stats = fs.statSync(outputPath)
  return reply.code(201).send({
    url: `/uploads/${outputName}`,
    width: image.bitmap.width,
    height: image.bitmap.height,
    mimeType: 'image/jpeg',
    size: stats.size,
  })
})

app.get('/p/:slug/raw', async (request, reply) => {
  const document = getDocumentBySlug(request.params.slug)
  if (!document || document.expired) {
    return reply.code(404).type('text/plain; charset=utf-8').send('文档不存在。')
  }

  const exports = buildDocumentExports(document)
  return reply.type('text/plain; charset=utf-8').send(exports.raw)
})

app.setErrorHandler((error, request, reply) => {
  request.log.error(error)
  const message = error.statusCode === 413 ? '文件太大了。' : error.message || '发生了意外错误。'
  reply.code(error.statusCode || 500).send({ message })
})

app.listen({ port, host }).then(() => {
  app.log.info(`server running at http://${host}:${port}`)
})
