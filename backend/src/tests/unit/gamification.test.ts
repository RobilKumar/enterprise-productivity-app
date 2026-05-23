describe('Gamification points calculation', () => {
  const POINTS = { TASK_COMPLETE: 10, ON_TIME_BONUS: 5, EARLY_BONUS: 10 };

  function calcPoints(task: { dueDate?: Date; completedAt: Date }): number {
    let pts = POINTS.TASK_COMPLETE;
    if (task.dueDate) {
      const hoursEarly = (task.dueDate.getTime() - task.completedAt.getTime()) / 3600000;
      if (hoursEarly >= 24) pts += POINTS.EARLY_BONUS;
      else if (hoursEarly >= 0) pts += POINTS.ON_TIME_BONUS;
    }
    return pts;
  }

  it('awards base points for completion', () => {
    expect(calcPoints({ completedAt: new Date() })).toBe(10);
  });

  it('awards on-time bonus when completed before due date', () => {
    const due = new Date(Date.now() + 12 * 3600000);
    expect(calcPoints({ dueDate: due, completedAt: new Date() })).toBe(15);
  });

  it('awards early bonus when completed 24+ hours before due date', () => {
    const due = new Date(Date.now() + 48 * 3600000);
    expect(calcPoints({ dueDate: due, completedAt: new Date() })).toBe(20);
  });

  it('awards only base points when completed late', () => {
    const due = new Date(Date.now() - 2 * 3600000);
    expect(calcPoints({ dueDate: due, completedAt: new Date() })).toBe(10);
  });
});
