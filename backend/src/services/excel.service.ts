import xlsx from 'xlsx';

export async function generateExcel(tasks: any[], csv = false): Promise<Buffer> {
  const rows = tasks.map((t) => ({
    'Task ID':        t.id,
    'Title':          t.title,
    'Assignee':       `${t.assignee?.firstName || ''} ${t.assignee?.lastName || ''}`.trim(),
    'Employee ID':    t.assignee?.employeeId || '',
    'Department':     t.assignee?.department?.name || '',
    'Team':           t.team?.name || '',
    'Status':         t.status,
    'Priority':       t.priority,
    'Category':       t.category || '',
    'Due Date':       t.dueDate       ? new Date(t.dueDate).toLocaleDateString()       : '',
    'Completed At':   t.completedAt   ? new Date(t.completedAt).toLocaleDateString()   : '',
    'Est. Hours':     t.estimatedHours ?? '',
    'Actual Hours':   t.actualHours   ?? '',
    'SLA Hours':      t.slaHours      ?? '',
    'Escalated':      t.isEscalated   ? 'Yes' : 'No',
    'Escalated At':   t.escalatedAt   ? new Date(t.escalatedAt).toLocaleString() : '',
    'Created At':     new Date(t.createdAt).toLocaleDateString(),
    'Created By':     `${t.createdBy?.firstName || ''} ${t.createdBy?.lastName || ''}`.trim(),
    'Comments':       t._count?.comments  || 0,
    'Attachments':    t._count?.attachments || 0,
  }));

  const ws = xlsx.utils.json_to_sheet(rows);

  // Column widths
  ws['!cols'] = [
    { wch: 36 }, { wch: 45 }, { wch: 22 }, { wch: 12 }, { wch: 18 },
    { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 12 },
    { wch: 13 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 8  },
    { wch: 14 }, { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 12 },
  ];

  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'Tasks');
  return xlsx.write(wb, { type: 'buffer', bookType: csv ? 'csv' : 'xlsx' }) as Buffer;
}
