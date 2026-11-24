/**
 * The `write_file` tool: save the conversation's text as a document inside the
 * session working directory.
 *
 * Writes go through `node:fs` rather than the `fs` service because three of the
 * supported formats are not UTF-8 text, and `ctx.fs` publishes text only. The
 * tool keeps its own boundary instead: the target must stay inside the session
 * working directory, and the content is bounded.
 *
 * @module dsh-pure-chat/write-file
 */

import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

import { buildDocument, FORMATS, formatOfPath } from './documents.js'

/** Largest content the tool accepts, in UTF-8 bytes. */
const MAX_CONTENT_BYTES = 4 * 1024 * 1024

/** Tool name; deliberately distinct from the fs plugin's own `write`. */
const TOOL_NAME = 'write_file'

const PARAMETERS = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'Target path inside the session working directory, for example "notes/报告.md". Missing parent directories are created.',
    },
    content: {
      type: 'string',
      description: 'Complete file content. For xls, write one row per line and separate cells with a tab (a comma is used when the line has no tab); the first row becomes the header.',
    },
    format: {
      type: 'string',
      enum: FORMATS,
      description: 'Output format. Omit it to infer the format from the path extension.',
    },
    title: {
      type: 'string',
      description: 'Optional document title: a heading in doc/pdf, the sheet name in xls.',
    },
  },
  required: ['path', 'content'],
  additionalProperties: false,
}

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    bytes: { type: 'number' },
    format: { type: 'string' },
  },
  required: ['path', 'bytes', 'format'],
  additionalProperties: false,
}

const DESCRIPTION = [
  'Save text as a file in the session working directory.',
  'Formats: txt and md keep the text as-is; doc writes an RTF document that Word, WPS and LibreOffice open; xls writes a SpreadsheetML workbook (first row is the header, cells separated by a tab or comma); pdf converts the same document through the DSH Office component.',
  'Use it when the user asks for a downloadable file, not for editing project sources.',
].join(' ')

/**
 * Resolve the session working directory, preferring the working-directory
 * service and falling back to the session header's recorded directory.
 * @param {import('@deepseek-ai/cordis').Context} ctx - preset composition scope.
 * @param {object} agent - the calling agent.
 * @param {AbortSignal | undefined} signal - the tool call's signal.
 * @returns {Promise<string>} the absolute directory.
 */
async function workingDirectory(ctx, agent, signal) {
  const service = ctx.get('workingDirectory')
  if (service !== undefined) {
    const directory = await service.ensure(agent, signal)
    if (typeof directory === 'string' && directory !== '') return directory
  }
  const recorded = agent?.session?.header?.cwd
  return typeof recorded === 'string' && recorded !== '' ? recorded : process.cwd()
}

/**
 * Reject a target that escapes the working directory.
 * @param {string} directory - absolute working directory.
 * @param {string} path - the model's requested path.
 * @returns {string} the absolute target path.
 */
export function resolveTarget(directory, path) {
  if (typeof path !== 'string' || path.trim() === '') throw new Error('path must be a non-empty string')
  const absolute = resolve(directory, path)
  const inside = relative(directory, absolute)
  if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
    throw new Error(`path "${path}" escapes the session working directory`)
  }
  return absolute
}

/**
 * Convert the document source to PDF through the DSH Office component.
 * @param {object} officeKit - the `officeKit` service.
 * @param {Buffer} source - RTF bytes to convert.
 * @param {AbortSignal | undefined} signal - cancellation.
 * @returns {Promise<Uint8Array>} PDF bytes.
 */
async function convertToPdf(officeKit, source, signal) {
  const version = `${source.length}-${Date.now()}`
  const result = await officeKit.convert({
    extension: 'doc',
    priority: 'foreground',
    source: {
      key: `pure-chat-${randomUUID()}`,
      version,
      bytes: source.length,
      read: async (_signal, maxBytes) => {
        if (source.length > maxBytes) throw new Error(`document is larger than the converter accepts (${source.length} > ${maxBytes} bytes)`)
        return { bytes: source, version }
      },
    },
  }, signal)
  return result.pdf
}

/**
 * Register the `write_file` tool in this preset's scope.
 * @param {import('@deepseek-ai/cordis').Context} ctx - preset composition scope.
 */
export function registerWriteFile(ctx) {
  ctx.effect(() => ctx.tools.register({
    name: TOOL_NAME,
    description: DESCRIPTION,
    parameters: PARAMETERS,
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => [{
        type: 'text',
        text: `Saved ${value.path} (${value.format}, ${value.bytes} bytes).`,
      }],
    },
    /**
     * @param {unknown} raw - model arguments.
     * @param {object} run - tool run context.
     * @returns {Promise<{path: string, bytes: number, format: string}>} the result value.
     */
    async execute(raw, run) {
      const args = raw ?? {}
      const content = args.content
      if (typeof content !== 'string') throw new Error('content must be a string')
      const bytes = Buffer.byteLength(content, 'utf8')
      if (bytes > MAX_CONTENT_BYTES) throw new Error(`content is too large (${bytes} bytes, the limit is ${MAX_CONTENT_BYTES})`)

      const format = typeof args.format === 'string' && args.format !== ''
        ? args.format.toLowerCase()
        : formatOfPath(String(args.path ?? ''))
      if (format === undefined) throw new Error(`cannot infer a format from "${String(args.path ?? '')}"; pass format as one of ${FORMATS.join(', ')}`)
      if (!FORMATS.includes(format)) throw new Error(`unsupported format "${format}"; use one of ${FORMATS.join(', ')}`)

      const directory = await workingDirectory(ctx, run.agent, run.signal)
      const target = resolveTarget(directory, String(args.path))
      const title = typeof args.title === 'string' ? args.title : undefined

      let payload
      if (format === 'pdf') {
        const officeKit = ctx.get('officeKit')
        if (officeKit === undefined) {
          throw new Error('PDF export needs the DSH Office component (office-kit), which this deployment does not provide; write doc or md instead')
        }
        payload = await convertToPdf(officeKit, buildDocument('doc', content, title), run.signal)
      } else {
        payload = buildDocument(format, content, title)
      }

      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, payload)
      return { path: target, bytes: payload.length, format }
    },
  }), 'pure-chat.writeFile()')
}
