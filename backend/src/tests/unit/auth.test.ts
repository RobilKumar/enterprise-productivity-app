import bcrypt from 'bcryptjs';
import jwt    from 'jsonwebtoken';

process.env.JWT_SECRET         = 'test-secret-minimum-32-chars-long!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-minimum-32-chars-long!';
process.env.JWT_EXPIRES_IN     = '15m';

describe('Auth utilities', () => {
  describe('Password hashing', () => {
    it('should hash password securely', async () => {
      const plain  = 'MyPassword@123';
      const hash   = await bcrypt.hash(plain, 12);
      expect(hash).not.toBe(plain);
      expect(hash.length).toBeGreaterThan(50);
    });

    it('should verify correct password', async () => {
      const plain = 'MyPassword@123';
      const hash  = await bcrypt.hash(plain, 10);
      const valid = await bcrypt.compare(plain, hash);
      expect(valid).toBe(true);
    });

    it('should reject wrong password', async () => {
      const hash  = await bcrypt.hash('correct', 10);
      const valid = await bcrypt.compare('wrong', hash);
      expect(valid).toBe(false);
    });
  });

  describe('JWT tokens', () => {
    it('should create and verify access token', () => {
      const payload = { userId: 'u1', role: 'EMPLOYEE', email: 'test@test.com' };
      const token   = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '15m' });
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      expect(decoded.userId).toBe('u1');
      expect(decoded.role).toBe('EMPLOYEE');
    });

    it('should reject tampered token', () => {
      const token    = jwt.sign({ userId: 'u1' }, process.env.JWT_SECRET!, { expiresIn: '15m' });
      const tampered = token.slice(0, -5) + 'XXXXX';
      expect(() => jwt.verify(tampered, process.env.JWT_SECRET!)).toThrow();
    });

    it('should reject expired token', async () => {
      const token = jwt.sign({ userId: 'u1' }, process.env.JWT_SECRET!, { expiresIn: '0s' });
      await new Promise(r => setTimeout(r, 100));
      expect(() => jwt.verify(token, process.env.JWT_SECRET!)).toThrow('jwt expired');
    });
  });
});
