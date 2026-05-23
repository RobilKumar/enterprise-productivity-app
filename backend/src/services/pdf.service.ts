import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';

interface ReportData {
  title:       string;
  period:      string;
  generatedAt: string;
  tasks:       any[];
  [key: string]: any;
}

export async function generatePDF(template: string, data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    const chunks: Buffer[] = [];
    const stream = new PassThrough();

    doc.pipe(stream);
    stream.on('data',  (c) => chunks.push(Buffer.from(c)));
    stream.on('end',   () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);

    // ── Header ──────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 80).fill('#6366F1');
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold')
       .text(data.title, 50, 25, { align: 'left' });
    doc.fontSize(10).font('Helvetica')
       .text(`Period: ${data.period}`, 50, 52)
       .text(`Generated: ${new Date(data.generatedAt).toLocaleString()}`, 350, 52, { align: 'right' });

    doc.fillColor('#111827').moveDown(3);

    // ── Summary stats ────────────────────────────────────────
    const total     = data.tasks.length;
    const completed = data.tasks.filter((t) => t.status === 'COMPLETED').length;
    const overdue   = data.tasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'COMPLETED').length;

    doc.fontSize(11).font('Helvetica-Bold').text('Summary', 50, doc.y);
    doc.fontSize(10).font('Helvetica')
       .text(`Total Tasks: ${total}   Completed: ${completed}   Overdue: ${overdue}   Completion Rate: ${total ? Math.round(completed / total * 100) : 0}%`, 50, doc.y + 6);

    doc.moveDown(1.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#E5E7EB').lineWidth(1).stroke();
    doc.moveDown(0.5);

    // ── Table header ─────────────────────────────────────────
    const cols = { title: 50, assignee: 195, status: 315, priority: 390, due: 460 };
    const headerY = doc.y;
    doc.rect(50, headerY - 4, 495, 20).fill('#F3F4F6');
    doc.fillColor('#374151').fontSize(9).font('Helvetica-Bold');
    doc.text('Task Title',  cols.title,    headerY, { width: 140 });
    doc.text('Assignee',    cols.assignee, headerY, { width: 115 });
    doc.text('Status',      cols.status,   headerY, { width: 70  });
    doc.text('Priority',    cols.priority, headerY, { width: 65  });
    doc.text('Due Date',    cols.due,      headerY, { width: 85  });
    doc.moveDown(0.8);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#D1D5DB').stroke();
    doc.moveDown(0.3);

    // ── Table rows ───────────────────────────────────────────
    doc.font('Helvetica').fontSize(8.5);
    const statusColors: Record<string, string> = {
      COMPLETED: '#059669', REJECTED: '#DC2626', IN_PROGRESS: '#D97706',
      PENDING: '#6B7280', ON_HOLD: '#9333EA',
    };

    for (const task of data.tasks) {
      if (doc.y > 740) {
        doc.addPage();
        doc.moveDown(0.5);
      }
      const y = doc.y;
      doc.fillColor('#111827');
      doc.text((task.title || '').substring(0, 35),                          cols.title,    y, { width: 140 });
      doc.text(`${task.assignee?.firstName || ''} ${task.assignee?.lastName || ''}`, cols.assignee, y, { width: 115 });
      doc.fillColor(statusColors[task.status] || '#6B7280');
      doc.text(task.status.replace('_', ' '),                                cols.status,   y, { width: 70 });
      doc.fillColor('#111827');
      doc.text(task.priority  || '',                                          cols.priority, y, { width: 65 });
      doc.text(task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—', cols.due, y, { width: 85 });
      doc.moveDown(0.55);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#F3F4F6').lineWidth(0.5).stroke();
      doc.moveDown(0.1);
    }

    // ── Footer on each page ──────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.fontSize(8).fillColor('#9CA3AF')
         .text(`Page ${i + 1} of ${range.count}`, 50, 820, { align: 'center', width: 495 });
    }

    doc.end();
  });
}
