/**
 * Document builders for the `write_file` tool: pure functions that turn the
 * model's text into the bytes of a supported file format.
 *
 * `txt` and `md` are UTF-8 text. `doc` is an RTF document (Word, WPS and
 * LibreOffice open it as a Word document) because RTF keeps Chinese text and
 * basic paragraph structure without a binary writer. `xls` is SpreadsheetML
 * 2003, the XML workbook format Excel and WPS open with the `.xls` extension.
 * `pdf` is produced elsewhere: the caller converts the RTF source through the
 * DSH Office component, which owns fonts and page layout.
 *
 * @module dsh-pure-chat/documents
 */

/** Formats this bundle can write, in the order the tool advertises them. */
export const FORMATS = ['txt', 'md', 'doc', 'xls', 'pdf']

/** Extension each format writes; `doc` and `xls` keep their requested names. */
export const EXTENSIONS = { txt: 'txt', md: 'md', doc: 'doc', xls: 'xls', pdf: 'pdf' }

/**
 * Infer a format from a filename's extension.
 * @param {string} path - the requested file path.
 * @returns {string | undefined} a supported format, or undefined.
 */
export function formatOfPath(path) {
  const match = /\.([A-Za-z0-9]+)$/.exec(path)
  if (match === null) return undefined
  const extension = match[1].toLowerCase()
  return FORMATS.includes(extension) ? extension : undefined
}

/**
 * Escape one RTF text run: braces, backslashes and non-ASCII characters.
 * Every character outside printable ASCII becomes a `\uN?` escape so the
 * document keeps CJK text in any viewer, and surrogate pairs are emitted as
 * their two UTF-16 code units (`\uN?` is a 16-bit escape).
 * @param {string} text - raw text.
 * @returns {string} RTF-safe text.
 */
export function escapeRtf(text) {
  let out = ''
  for (const character of text) {
    const code = character.codePointAt(0)
    if (character === '\\') out += '\\\\'
    else if (character === '{') out += '\\{'
    else if (character === '}') out += '\\}'
    else if (character === '\t') out += '\\tab '
    else if (character === '\n') continue
    else if (character === '\r') continue
    else if (code >= 0x20 && code < 0x7f) out += character
    else {
      for (let index = 0; index < character.length; index += 1) {
        const unit = character.charCodeAt(index)
        out += `\\u${unit > 0x7fff ? unit - 0x10000 : unit}?`
      }
    }
  }
  return out
}

/**
 * Build an RTF document from plain text.
 * @param {string} content - the body, one paragraph per line.
 * @param {string | undefined} title - optional heading paragraph.
 * @returns {Buffer} RTF bytes.
 */
export function buildRtf(content, title) {
  const body = content.replace(/\r\n/g, '\n').split('\n')
    .map(line => `${escapeRtf(line)}\\par`)
    .join('\n')
  const heading = title === undefined || title.trim() === ''
    ? ''
    : `\\pard\\sa240\\f0\\fs36\\b ${escapeRtf(title)}\\b0\\par\n`
  const rtf = '{\\rtf1\\ansi\\ansicpg936\\deff0\\uc1\n'
    + '{\\fonttbl{\\f0\\fnil\\fcharset134 Microsoft YaHei;}{\\f1\\fnil\\fcharset134 SimSun;}}\n'
    + '\\viewkind4\\pard\\sa120\n'
    + heading
    + body
    + '\n}\n'
  return Buffer.from(rtf, 'ascii')
}

/**
 * Escape one XML text node or attribute value.
 * @param {string} text - raw text.
 * @returns {string} XML-safe text.
 */
export function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Split one line into cells: tabs when present, commas otherwise.
 * @param {string} line - one row of the model's text.
 * @returns {string[]} the row's cells.
 */
export function splitCells(line) {
  return (line.includes('\t') ? line.split('\t') : line.split(','))
    .map(cell => cell.trim())
}

/**
 * Build a SpreadsheetML 2003 workbook: the first line is the header row, and
 * every other line is a data row. A cell that is exactly a number becomes a
 * numeric cell so Excel can sum it.
 * @param {string} content - rows of text.
 * @param {string | undefined} title - sheet name when it is a usable name.
 * @returns {Buffer} UTF-8 bytes of the workbook.
 */
export function buildXls(content, title) {
  const lines = content.replace(/\r\n/g, '\n').split('\n').filter(line => line.trim() !== '')
  const rows = lines.map((line, index) => {
    const cells = splitCells(line).map(cell => {
      const numeric = /^-?\d+(\.\d+)?$/.test(cell)
      const type = numeric ? 'Number' : 'String'
      return `<Cell><Data ss:Type="${type}">${escapeXml(cell)}</Data></Cell>`
    }).join('')
    const style = index === 0 ? ' ss:StyleID="header"' : ''
    return `<Row${style}>${cells}</Row>`
  }).join('\n')
  const sheet = title === undefined || title.trim() === ''
    ? 'Sheet1'
    : title.trim().replace(/[\\/:*?[\]]/g, ' ').slice(0, 31) || 'Sheet1'
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<?mso-application progid="Excel.Sheet"?>\n'
    + '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n'
    + ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n'
    + ' <Styles>\n'
    + '  <Style ss:ID="header"><Font ss:Bold="1"/></Style>\n'
    + ' </Styles>\n'
    + ` <Worksheet ss:Name="${escapeXml(sheet)}">\n`
    + '  <Table>\n'
    + `   ${rows}\n`
    + '  </Table>\n'
    + ' </Worksheet>\n'
    + '</Workbook>\n'
  return Buffer.from(xml, 'utf8')
}

/**
 * Build the bytes for one text-based format.
 * @param {string} format - `txt`, `md`, `doc` or `xls`.
 * @param {string} content - the model's text.
 * @param {string | undefined} title - optional document title.
 * @returns {Buffer} the file bytes.
 */
export function buildDocument(format, content, title) {
  switch (format) {
    case 'txt':
    case 'md':
      return Buffer.from(content, 'utf8')
    case 'doc':
      return buildRtf(content, title)
    case 'xls':
      return buildXls(content, title)
    default:
      throw new Error(`unsupported document format "${format}"`)
  }
}
