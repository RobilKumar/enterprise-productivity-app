describe('Task status transitions', () => {
  const ALLOWED: Record<string, string[]> = {
    PENDING:     ['ACCEPTED', 'REJECTED'],
    ACCEPTED:    ['IN_PROGRESS', 'REJECTED'],
    IN_PROGRESS: ['ON_HOLD', 'COMPLETED', 'REJECTED'],
    ON_HOLD:     ['IN_PROGRESS', 'REJECTED'],
    COMPLETED:   ['REOPENED'],
    REJECTED:    ['REOPENED'],
    REOPENED:    ['ACCEPTED', 'IN_PROGRESS'],
  };

  const canTransition = (from: string, to: string) => ALLOWED[from]?.includes(to) ?? false;

  it('PENDING → ACCEPTED is allowed',    () => expect(canTransition('PENDING',     'ACCEPTED')).toBe(true));
  it('PENDING → IN_PROGRESS is blocked', () => expect(canTransition('PENDING',     'IN_PROGRESS')).toBe(false));
  it('IN_PROGRESS → COMPLETED is allowed', () => expect(canTransition('IN_PROGRESS','COMPLETED')).toBe(true));
  it('COMPLETED → IN_PROGRESS is blocked', () => expect(canTransition('COMPLETED',  'IN_PROGRESS')).toBe(false));
  it('COMPLETED → REOPENED is allowed',    () => expect(canTransition('COMPLETED',  'REOPENED')).toBe(true));
  it('REJECTED → REOPENED is allowed',     () => expect(canTransition('REJECTED',   'REOPENED')).toBe(true));
});
