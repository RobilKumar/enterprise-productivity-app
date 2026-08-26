/**
 * Auto-seed: runs only when the database is empty (userCount === 0).
 * Called from bootstrap() in server.ts on every startup.
 * Safe to run multiple times — uses upsert everywhere.
 */
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { logger } from './logger';

// Emails of the 6 seeded users that must always be kept
const SEEDED_EMAILS = [
  'superadmin@company.com',
  'alice@company.com',
  'bob@company.com',
  'charlie@company.com',
  'diana@company.com',
  'evan@company.com',
];

/** Soft-delete any users that were not part of the initial seed (e.g. bulk-uploaded test users). */
export async function cleanupExtraUsers(): Promise<void> {
  const deleted = await prisma.user.updateMany({
    where: {
      email:     { notIn: SEEDED_EMAILS },
      deletedAt: null,
    },
    data: { deletedAt: new Date() },
  });
  if (deleted.count > 0) {
    logger.info(`Cleanup: soft-deleted ${deleted.count} non-seeded user(s)`);
  }
}

export async function autoSeedIfEmpty(): Promise<void> {
  const userCount = await prisma.user.count({ where: { deletedAt: null } });
  if (userCount > 0) {
    logger.info(`Auto-seed skipped — ${userCount} users already exist`);
    return;
  }

  logger.info('Database is empty — running initial seed...');

  // ─── Roles ──────────────────────────────────────────────────
  const roles = await Promise.all([
    prisma.role.upsert({ where: { name: 'SUPER_ADMIN' }, update: {}, create: { name: 'SUPER_ADMIN', displayName: 'Super Administrator', permissions: JSON.stringify(['*']) } }),
    prisma.role.upsert({ where: { name: 'ADMIN'       }, update: {}, create: { name: 'ADMIN',       displayName: 'Administrator',       permissions: JSON.stringify(['users.*','tasks.*','reports.*','teams.*']) } }),
    prisma.role.upsert({ where: { name: 'MANAGER'     }, update: {}, create: { name: 'MANAGER',     displayName: 'Manager',             permissions: JSON.stringify(['tasks.*','users.view','reports.view']) } }),
    prisma.role.upsert({ where: { name: 'TEAM_LEADER' }, update: {}, create: { name: 'TEAM_LEADER', displayName: 'Team Leader',         permissions: JSON.stringify(['tasks.*','users.view']) } }),
    prisma.role.upsert({ where: { name: 'EMPLOYEE'    }, update: {}, create: { name: 'EMPLOYEE',    displayName: 'Employee',            permissions: JSON.stringify(['tasks.own','profile.own']) } }),
  ]);
  logger.info('Roles seeded: ' + roles.map(r => r.name).join(', '));

  // ─── Departments ─────────────────────────────────────────────
  const [engDept] = await Promise.all([
    prisma.department.upsert({ where: { name: 'Engineering'     }, update: {}, create: { name: 'Engineering',     code: 'ENG',   description: 'Software Engineering & Development' } }),
    prisma.department.upsert({ where: { name: 'Human Resources' }, update: {}, create: { name: 'Human Resources', code: 'HR',    description: 'HR & People Operations' } }),
    prisma.department.upsert({ where: { name: 'Sales'           }, update: {}, create: { name: 'Sales',           code: 'SALES', description: 'Sales & Business Development' } }),
  ]);
  logger.info('Departments seeded');

  // ─── Shifts ──────────────────────────────────────────────────
  await Promise.all([
    prisma.shift.upsert({ where: { name: 'Morning' }, update: {}, create: { name: 'Morning', startTime: '09:00', endTime: '18:00', workingDays: JSON.stringify([1,2,3,4,5]), gracePeriodMins: 15 } }),
    prisma.shift.upsert({ where: { name: 'Evening' }, update: {}, create: { name: 'Evening', startTime: '14:00', endTime: '23:00', workingDays: JSON.stringify([1,2,3,4,5]), gracePeriodMins: 15 } }),
    prisma.shift.upsert({ where: { name: 'Night'   }, update: {}, create: { name: 'Night',   startTime: '22:00', endTime: '07:00', workingDays: JSON.stringify([1,2,3,4,5]), gracePeriodMins: 15 } }),
  ]);
  logger.info('Shifts seeded');

  // ─── Super Admin ─────────────────────────────────────────────
  const superAdminRole = roles.find(r => r.name === 'SUPER_ADMIN')!;
  const adminRole      = roles.find(r => r.name === 'ADMIN')!;
  const empRole        = roles.find(r => r.name === 'EMPLOYEE')!;
  const leaderRole     = roles.find(r => r.name === 'TEAM_LEADER')!;

  const superAdmin = await prisma.user.upsert({
    where:  { email: 'superadmin@company.com' },
    update: {},
    create: {
      employeeId:   'EMP00001',
      firstName:    'Super',
      lastName:     'Admin',
      email:        'superadmin@company.com',
      passwordHash: await bcrypt.hash('Admin@123456', 10),
      roleId:       superAdminRole.id,
      departmentId: engDept.id,
      status:       'ACTIVE',
      joiningDate:  new Date('2020-01-01'),
    },
  });
  logger.info(`Super admin created: ${superAdmin.email}`);

  // ─── Teams ───────────────────────────────────────────────────
  const engTeam = await prisma.team.upsert({
    where:  { name: 'Backend Team' },
    update: {},
    create: { name: 'Backend Team', code: 'BE', departmentId: engDept.id, leaderId: superAdmin.id },
  });
  const frontendTeam = await prisma.team.upsert({
    where:  { name: 'Frontend Team' },
    update: {},
    create: { name: 'Frontend Team', code: 'FE', departmentId: engDept.id, leaderId: superAdmin.id },
  });
  logger.info('Teams seeded');

  // ─── Sample employees ────────────────────────────────────────
  const employees = [
    { emp: 'EMP00002', email: 'alice@company.com',   firstName: 'Alice',   lastName: 'Johnson',  roleId: leaderRole.id, teamId: engTeam.id,     deptId: engDept.id },
    { emp: 'EMP00003', email: 'bob@company.com',     firstName: 'Bob',     lastName: 'Smith',    roleId: empRole.id,    teamId: engTeam.id,     deptId: engDept.id },
    { emp: 'EMP00004', email: 'charlie@company.com', firstName: 'Charlie', lastName: 'Davis',    roleId: empRole.id,    teamId: frontendTeam.id, deptId: engDept.id },
    { emp: 'EMP00005', email: 'diana@company.com',   firstName: 'Diana',   lastName: 'Wilson',   roleId: empRole.id,    teamId: frontendTeam.id, deptId: engDept.id },
    { emp: 'EMP00006', email: 'evan@company.com',    firstName: 'Evan',    lastName: 'Martinez', roleId: empRole.id,    teamId: engTeam.id,     deptId: engDept.id },
  ];

  const pw = await bcrypt.hash('Password@123', 10);
  for (const e of employees) {
    await prisma.user.upsert({
      where:  { email: e.email },
      update: {},
      create: {
        employeeId:   e.emp,
        firstName:    e.firstName,
        lastName:     e.lastName,
        email:        e.email,
        passwordHash: pw,
        roleId:       e.roleId,
        departmentId: e.deptId,
        teamId:       e.teamId,
        status:       'ACTIVE',
        joiningDate:  new Date('2022-01-01'),
      },
    });
  }
  logger.info('Sample employees seeded (password: Password@123)');

  // ─── Badges ──────────────────────────────────────────────────
  await Promise.all([
    prisma.badge.upsert({ where: { name: 'First Task'      }, update: {}, create: { name: 'First Task',       description: 'Completed your first task',          icon: '🎯', color: '#6366F1', condition: JSON.stringify({ type: 'tasks_completed', count: 1   }) } }),
    prisma.badge.upsert({ where: { name: 'Task Champion'   }, update: {}, create: { name: 'Task Champion',    description: 'Completed 10 tasks',                 icon: '⭐', color: '#F59E0B', condition: JSON.stringify({ type: 'tasks_completed', count: 10  }) } }),
    prisma.badge.upsert({ where: { name: 'Productivity Pro'}, update: {}, create: { name: 'Productivity Pro', description: 'Completed 50 tasks',                 icon: '🚀', color: '#10B981', condition: JSON.stringify({ type: 'tasks_completed', count: 50  }) } }),
    prisma.badge.upsert({ where: { name: 'Century Club'    }, update: {}, create: { name: 'Century Club',     description: 'Completed 100 tasks',                icon: '💯', color: '#EF4444', condition: JSON.stringify({ type: 'tasks_completed', count: 100 }) } }),
    prisma.badge.upsert({ where: { name: 'Early Bird'      }, update: {}, create: { name: 'Early Bird',       description: 'Consistently completes tasks early', icon: '🐦', color: '#3B82F6', condition: JSON.stringify({ type: 'early_completion', streak: 5  }) } }),
  ]);
  logger.info('Badges seeded');

  logger.info('Auto-seed complete — 6 users ready (superadmin@company.com / Admin@123456)');
}
