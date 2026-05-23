describe('Productivity score calculation', () => {
  function calcScore(completed: number, total: number, onTimeRate: number, attendanceRate: number): number {
    if (total === 0) return 0;
    const completionRate = (completed / total) * 100;
    return Math.round(completionRate * 0.5 + onTimeRate * 0.3 + attendanceRate * 0.2);
  }

  it('returns 0 for zero tasks', () => expect(calcScore(0, 0, 100, 100)).toBe(0));
  it('returns 100 for perfect performance', () => expect(calcScore(10, 10, 100, 100)).toBe(100));
  it('calculates correctly for partial completion', () => {
    const score = calcScore(5, 10, 80, 90);
    expect(score).toBe(Math.round(50 * 0.5 + 80 * 0.3 + 90 * 0.2));
  });
  it('score stays within 0-100', () => {
    const score = calcScore(10, 10, 100, 100);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});
