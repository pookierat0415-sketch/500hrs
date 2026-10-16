import Docxtemplater from 'docxtemplater'
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import PizZip from 'pizzip'

// Fills a school's own Word template with the trainee's logs, entirely offline.
//
// Templates use docxtemplater tags: {name} for a value, {#weeks}...{/weeks} to
// repeat a block once per week. The full list of tags is TEMPLATE_TAGS below and
// is shown to users in the Report tab.

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const MAX_TEMPLATE_BYTES = 10 * 1024 * 1024

export const TEMPLATE_TAGS = [
  {
    group: 'Trainee',
    tags: [
      ['{name}', 'Full name, e.g. Juan D. Dela Cruz'],
      ['{lastName}, {firstName} {middleInitial}', 'Name parts, e.g. Dela Cruz, Juan D.'],
      ['{course}', 'Course or program'],
      ['{company}', 'Host company'],
      ['{supervisor}', 'Supervisor'],
    ],
  },
  {
    group: 'Summary',
    tags: [
      ['{totalHours}', 'Hours rendered, e.g. 142.0'],
      ['{goalHours}', 'Required hours (500)'],
      ['{percent}', 'Percent complete'],
      ['{daysWorked}', 'Days with logged hours'],
      ['{periodStart} {periodEnd}', 'First and last dates covered'],
      ['{generatedDate}', 'Date the report was made'],
    ],
  },
  {
    group: 'Per week',
    tags: [
      ['{#weeks} … {/weeks}', 'Repeats once per week'],
      ['{weekNumber} {weekStart} {weekEnd}', 'Week number and dates'],
      ['{weekHours}', 'Hours that week'],
      ['{weekNarrative}', 'Auto-written summary sentence'],
      ['{#entries} … {/entries}', 'Inside a week: that week’s entries'],
    ],
  },
  {
    group: 'Per day (daily time record)',
    tags: [
      ['{#days} … {/days}', 'Repeats once per day worked'],
      ['{date} {weekday}', 'e.g. October 16, 2026 · Friday'],
      ['{timeIn} {timeOut} {hours}', 'From the shift timer'],
      ['{#tasks} … {/tasks}', 'Inside a day: that day’s entries'],
    ],
  },
  {
    group: 'Per entry',
    tags: [
      ['{#entries} … {/entries}', 'At top level: every entry, oldest first'],
      ['{date} {category} {text}', 'Text is the AI-polished version if there is one'],
      ['{notes}', 'Your original notes'],
    ],
  },
]

export class TemplateError extends Error {
  constructor(message) {
    super(message)
    this.name = 'TemplateError'
  }
}

// docxtemplater reports problems as a list; turn the first few into one sentence.
function describe(err) {
  const list = err?.properties?.errors
  const items = Array.isArray(list) && list.length ? list : [err]
  return items
    .slice(0, 3)
    .map((e) => {
      const explanation = e?.properties?.explanation ?? e?.message ?? 'Unknown problem'
      return explanation.replace(/\.$/, '')
    })
    .join('; ')
}

function compile(buffer) {
  let zip
  try {
    zip = new PizZip(buffer)
  } catch {
    throw new TemplateError('This file is not a Word (.docx) document.')
  }
  if (!zip.file('word/document.xml')) {
    throw new TemplateError(
      'This file is not a Word (.docx) document. If it is an old .doc file, open it in Word and save it as .docx.',
    )
  }
  try {
    return new Docxtemplater(zip, {
      paragraphLoop: true, // a loop tag alone on its line doesn't leave an empty line behind
      linebreaks: true, // keep line breaks inside notes
      nullGetter: () => '', // unknown tags become blank instead of "undefined"
      errorLogging: false, // we turn errors into a readable message instead
    })
  } catch (err) {
    throw new TemplateError(`The template has a placeholder problem: ${describe(err)}.`)
  }
}

/** Throws TemplateError if the file can't be used as a template. */
export async function validateTemplate(file) {
  if (file.size > MAX_TEMPLATE_BYTES) throw new TemplateError('Templates must be 10 MB or smaller.')
  compile(await file.arrayBuffer())
}

/** Fills the template with data and returns the finished .docx as a Blob. */
export async function fillTemplate(templateBlob, data) {
  const doc = compile(await templateBlob.arrayBuffer())
  try {
    doc.render(data)
  } catch (err) {
    throw new TemplateError(`Couldn't fill the template: ${describe(err)}.`)
  }
  return doc.getZip().generate({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' })
}

// ---------------------------------------------------------------------------
// Sample template, so students can see the tags working and adapt the layout.
// ---------------------------------------------------------------------------

const p = (text, opts = {}) =>
  new Paragraph({
    spacing: { after: opts.after ?? 120 },
    alignment: opts.align,
    children: [new TextRun({ text, font: 'Calibri', size: opts.size ?? 22, bold: opts.bold, italics: opts.italics })],
  })

const cell = (text, opts = {}) =>
  new TableCell({
    width: { size: opts.width ?? 25, type: WidthType.PERCENTAGE },
    shading: opts.header ? { fill: 'FDE68A' } : undefined,
    children: [p(text, { bold: opts.header, after: 0, size: 20 })],
  })

export async function buildSampleTemplate() {
  const line = { style: BorderStyle.SINGLE, size: 4, color: '94A3B8' }
  const doc = new Document({
    creator: '500 Hours',
    title: 'OJT Narrative Report Template',
    sections: [
      {
        properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
        children: [
          p('ON-THE-JOB TRAINING NARRATIVE REPORT', { bold: true, size: 32, align: AlignmentType.CENTER, after: 240 }),
          p('Name: {name}'),
          p('Course: {course}'),
          p('Host company: {company}'),
          p('Supervisor: {supervisor}'),
          p('Period covered: {periodStart} to {periodEnd}'),
          p('Hours rendered: {totalHours} of {goalHours} ({percent}%) over {daysWorked} days', { after: 360 }),

          p('WEEKLY NARRATIVE', { bold: true, size: 26 }),
          p('{#weeks}', { after: 0 }),
          p('Week {weekNumber}: {weekStart} to {weekEnd} ({weekHours})', { bold: true }),
          p('{weekNarrative}', { italics: true }),
          p('{#entries}', { after: 0 }),
          p('{date} ({category}): {text}'),
          p('{/entries}', { after: 0 }),
          p('{/weeks}', { after: 360 }),

          p('DAILY TIME RECORD', { bold: true, size: 26 }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line },
            rows: [
              new TableRow({
                tableHeader: true,
                children: [
                  cell('Date', { header: true, width: 40 }),
                  cell('Time in', { header: true, width: 20 }),
                  cell('Time out', { header: true, width: 20 }),
                  cell('Hours', { header: true, width: 20 }),
                ],
              }),
              // A loop that opens in the first cell and closes in the last repeats the row.
              new TableRow({
                children: [
                  cell('{#days}{date}', { width: 40 }),
                  cell('{timeIn}', { width: 20 }),
                  cell('{timeOut}', { width: 20 }),
                  cell('{hours}{/days}', { width: 20 }),
                ],
              }),
            ],
          }),

          p('', { after: 480 }),
          p('Prepared by: ______________________________', { after: 0 }),
          p('{name}, Trainee', { after: 360 }),
          p('Noted by: ______________________________', { after: 0 }),
          p('{supervisor}, Supervisor', { after: 360 }),
          p('Generated on {generatedDate}', { size: 16, italics: true }),
        ],
      },
    ],
  })
  return Packer.toBlob(doc)
}
