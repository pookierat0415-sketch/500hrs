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

// Builds the narrative report as a Word document. Takes the same pre-formatted
// data the on-screen preview renders, so both exports stay in sync.

const FONT = 'Calibri'
const SUN = 'B46907'
const MUTED = '64748B'
const INK = '0F172A'

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const NO_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
}

const text = (value, opts = {}) => new TextRun({ text: String(value), font: FONT, ...opts })

function twoColumnTable(rows, renderCell) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: NO_BORDERS,
    rows: rows.map(
      (pair) =>
        new TableRow({
          children: pair.map(
            (item) =>
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                borders: NO_BORDERS,
                children: renderCell(item),
              }),
          ),
        }),
    ),
  })
}

const chunk = (arr, size) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))

/**
 * @param {{
 *   profile: [string, string][],          // [label, value]
 *   summary: [string, string][],          // [label, value]
 *   period: string | null,
 *   weeks: { title: string, range: string, hours: string, narrative: string,
 *            entries: { day: string, category: string, color: string,
 *                       description: string, photos: number }[] }[],
 *   signatures: [string, string][],       // [name, role]
 * }} report
 * @returns {Promise<Blob>}
 */
export async function buildReportDocx(report) {
  const children = [
    new Paragraph({
      children: [text('ON-THE-JOB TRAINING', { bold: true, size: 18, color: SUN, characterSpacing: 40 })],
    }),
    new Paragraph({
      spacing: { after: 240 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: 'FBBF24', space: 6 } },
      children: [text('Narrative Report', { bold: true, size: 40, color: INK })],
    }),

    twoColumnTable(chunk(report.profile, 2), ([label, value]) => [
      new Paragraph({ children: [text(label, { size: 18, color: MUTED })] }),
      new Paragraph({
        spacing: { after: 120 },
        children: [text(value || '—', { bold: true, size: 22, color: INK })],
      }),
    ]),

    new Paragraph({
      spacing: { before: 240, after: 60 },
      children: report.summary.flatMap(([label, value], i) => [
        ...(i ? [text('     ')] : []),
        text(`${label}: `, { size: 20, color: MUTED }),
        text(value, { bold: true, size: 20, color: INK }),
      ]),
    }),
  ]

  if (report.period) {
    children.push(
      new Paragraph({
        spacing: { after: 240 },
        children: [text(report.period, { size: 18, color: MUTED })],
      }),
    )
  }

  for (const week of report.weeks) {
    children.push(
      new Paragraph({
        keepNext: true,
        spacing: { before: 280, after: 80 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1', space: 4 } },
        children: [
          text(week.title, { bold: true, size: 24, color: INK }),
          text(`   ${week.range}`, { size: 20, color: MUTED }),
          text(`   ·   ${week.hours}`, { bold: true, size: 20, color: SUN }),
        ],
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [text(week.narrative, { italics: true, size: 20, color: '475569' })],
      }),
      ...week.entries.map(
        (e) =>
          new Paragraph({
            spacing: { after: 80 },
            children: [
              text(`${e.day}   `, { bold: true, size: 20, color: MUTED }),
              text(e.category, { bold: true, size: 20, color: e.color }),
              text('  ·  ', { size: 20, color: '94A3B8' }),
              text(e.description, { size: 20, color: '334155' }),
              ...(e.photos
                ? [text(`  (${e.photos} photo${e.photos > 1 ? 's' : ''})`, { size: 18, color: '94A3B8' })]
                : []),
            ],
          }),
      ),
    )
  }

  children.push(
    new Paragraph({ spacing: { before: 720 }, children: [] }),
    twoColumnTable([report.signatures], ([name, role]) => [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '94A3B8', space: 2 } },
        children: [text(name || ' ', { bold: true, size: 20, color: INK })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [text(`${role} signature`, { size: 18, color: MUTED })],
      }),
    ]),
  )

  const doc = new Document({
    creator: '500 Hours',
    title: 'OJT Narrative Report',
    sections: [
      {
        properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
        children,
      },
    ],
  })

  return Packer.toBlob(doc)
}
