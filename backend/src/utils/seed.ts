/**
 * Database seeder — run with: npm run seed
 * Creates: roles, departments, teams, super admin user, sample employees, badges
 */
import { PrismaClient } from '@prisma/client';
import bcrypt           from 'bcryptjs';

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Starting database seed...');

  // ─── Roles ──────────────────────────────────────────────────
  const roles = await Promise.all([
    prisma.role.upsert({ where: { name: 'SUPER_ADMIN' }, update: {}, create: { name: 'SUPER_ADMIN', displayName: 'Super Administrator', permissions: JSON.stringify(['*']) } }),
    prisma.role.upsert({ where: { name: 'ADMIN'       }, update: {}, create: { name: 'ADMIN',       displayName: 'Administrator',        permissions: JSON.stringify(['users.*','tasks.*','reports.*','teams.*']) } }),
    prisma.role.upsert({ where: { name: 'MANAGER'     }, update: {}, create: { name: 'MANAGER',     displayName: 'Manager',              permissions: JSON.stringify(['tasks.*','users.view','reports.view']) } }),
    prisma.role.upsert({ where: { name: 'TEAM_LEADER' }, update: {}, create: { name: 'TEAM_LEADER', displayName: 'Team Leader',          permissions: JSON.stringify(['tasks.*','users.view']) } }),
    prisma.role.upsert({ where: { name: 'EMPLOYEE'    }, update: {}, create: { name: 'EMPLOYEE',    displayName: 'Employee',             permissions: JSON.stringify(['tasks.own','profile.own']) } }),
  ]);
  console.log('✅ Roles seeded:', roles.map((r) => r.name).join(', '));

  // ─── Departments ─────────────────────────────────────────────
  const [engDept, hrDept, salesDept] = await Promise.all([
    prisma.department.upsert({ where: { name: 'Engineering'}, update: {}, create: { name: 'Engineering', code: 'ENG', description: 'Software Engineering & Development' } }),
    prisma.department.upsert({ where: { name: 'Human Resources'}, update: {}, create: { name: 'Human Resources', code: 'HR', description: 'HR & People Operations' } }),
    prisma.department.upsert({ where: { name: 'Sales'}, update: {}, create: { name: 'Sales', code: 'SALES', description: 'Sales & Business Development' } }),
  ]);
  console.log('✅ Departments seeded');

  // ─── Shifts ──────────────────────────────────────────────────
  await Promise.all([
    prisma.shift.upsert({ where: { name: 'Morning' }, update: {}, create: { name: 'Morning', startTime: '09:00', endTime: '18:00', workingDays: JSON.stringify([1,2,3,4,5]), gracePeriodMins: 15 } }),
    prisma.shift.upsert({ where: { name: 'Evening' }, update: {}, create: { name: 'Evening', startTime: '14:00', endTime: '23:00', workingDays: JSON.stringify([1,2,3,4,5]), gracePeriodMins: 15 } }),
    prisma.shift.upsert({ where: { name: 'Night'   }, update: {}, create: { name: 'Night',   startTime: '22:00', endTime: '07:00', workingDays: JSON.stringify([1,2,3,4,5]), gracePeriodMins: 15 } }),
  ]);
  console.log('✅ Shifts seeded');

  // ─── Super Admin user ────────────────────────────────────────
  const superAdminRole = roles.find((r) => r.name === 'SUPER_ADMIN')!;
  const adminRole      = roles.find((r) => r.name === 'ADMIN')!;
  const empRole        = roles.find((r) => r.name === 'EMPLOYEE')!;
  const leaderRole     = roles.find((r) => r.name === 'TEAM_LEADER')!;

  const superAdmin = await prisma.user.upsert({
    where:  { email: 'superadmin@company.com' },
    update: {},
    create: {
      employeeId: 'EMP00001',
      firstName:  'Super',
      lastName:   'Admin',
      email:      'superadmin@company.com',
      passwordHash: await bcrypt.hash('Admin@123456', 12),
      roleId:       superAdminRole.id,
      departmentId: engDept.id,
      status:       'ACTIVE',
      joiningDate:  new Date('2020-01-01'),
    },
  });
  console.log('✅ Super admin:', superAdmin.email, '/ Admin@123456');

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
  console.log('✅ Teams seeded');

  // Create team chat rooms
  await Promise.all([
    prisma.chatRoom.upsert({ where: { teamId: engTeam.id },      update: {}, create: { name: 'Backend Team Chat',  isGroupChat: true, teamId: engTeam.id      } }),
    prisma.chatRoom.upsert({ where: { teamId: frontendTeam.id }, update: {}, create: { name: 'Frontend Team Chat', isGroupChat: true, teamId: frontendTeam.id } }),
  ]);

  // ─── Sample employees ────────────────────────────────────────
  const employees = [
    { email: 'alice@company.com',   firstName: 'Alice',   lastName: 'Johnson',  roleId: leaderRole.id, teamId: engTeam.id,     deptId: engDept.id },
    { email: 'bob@company.com',     firstName: 'Bob',     lastName: 'Smith',    roleId: empRole.id,    teamId: engTeam.id,     deptId: engDept.id },
    { email: 'charlie@company.com', firstName: 'Charlie', lastName: 'Davis',    roleId: empRole.id,    teamId: frontendTeam.id, deptId: engDept.id },
    { email: 'diana@company.com',   firstName: 'Diana',   lastName: 'Wilson',   roleId: empRole.id,    teamId: frontendTeam.id, deptId: engDept.id },
    { email: 'evan@company.com',    firstName: 'Evan',    lastName: 'Martinez', roleId: empRole.id,    teamId: engTeam.id,     deptId: engDept.id },
  ];

  for (let i = 0; i < employees.length; i++) {
    const e = employees[i];
    await prisma.user.upsert({
      where:  { email: e.email },
      update: {},
      create: {
        employeeId:  `EMP${String(i + 2).padStart(5, '0')}`,
        firstName:    e.firstName,
        lastName:     e.lastName,
        email:        e.email,
        passwordHash: await bcrypt.hash('Password@123', 12),
        roleId:       e.roleId,
        departmentId: e.deptId,
        teamId:       e.teamId,
        status:       'ACTIVE',
        joiningDate:  new Date(2022, Math.floor(Math.random() * 12), 1),
        totalPoints:  Math.floor(Math.random() * 500),
      },
    });
  }
  console.log('✅ Sample employees seeded (password: Password@123)');

  // ─── Badges ──────────────────────────────────────────────────
  await Promise.all([
    prisma.badge.upsert({ where: { name: 'First Task' },     update: {}, create: { name: 'First Task',      description: 'Completed your first task',       icon: '🎯', color: '#6366F1', condition: JSON.stringify({ type: 'tasks_completed', count: 1  }) } }),
    prisma.badge.upsert({ where: { name: 'Task Champion' },  update: {}, create: { name: 'Task Champion',   description: 'Completed 10 tasks',              icon: '⭐', color: '#F59E0B', condition: JSON.stringify({ type: 'tasks_completed', count: 10 }) } }),
    prisma.badge.upsert({ where: { name: 'Productivity Pro'},update: {}, create: { name: 'Productivity Pro',description: 'Completed 50 tasks',              icon: '🚀', color: '#10B981', condition: JSON.stringify({ type: 'tasks_completed', count: 50 }) } }),
    prisma.badge.upsert({ where: { name: 'Century Club' },   update: {}, create: { name: 'Century Club',    description: 'Completed 100 tasks',             icon: '💯', color: '#EF4444', condition: JSON.stringify({ type: 'tasks_completed', count: 100}) } }),
    prisma.badge.upsert({ where: { name: 'Early Bird' },     update: {}, create: { name: 'Early Bird',      description: 'Consistently completes tasks early',icon:'🐦', color: '#3B82F6', condition: JSON.stringify({ type: 'early_completion', streak: 5  }) } }),
  ]);
  console.log('✅ Badges seeded');

  // ─── Sample tasks ────────────────────────────────────────────
  const alice = await prisma.user.findUnique({ where: { email: 'alice@company.com' } });
  const bob   = await prisma.user.findUnique({ where: { email: 'bob@company.com'   } });

  if (alice && bob) {
    await prisma.task.createMany({
      data: [
        { title: 'Setup CI/CD Pipeline',       description: 'Configure GitHub Actions for automated testing and deployment', assigneeId: bob.id,  createdById: alice.id, teamId: engTeam.id, priority: 'HIGH',   status: 'IN_PROGRESS', dueDate: new Date(Date.now() + 7  * 86400000), estimatedHours: 8  },
        { title: 'Implement User Auth Module',  description: 'JWT authentication with refresh token rotation',               assigneeId: bob.id,  createdById: alice.id, teamId: engTeam.id, priority: 'CRITICAL',status: 'COMPLETED',   dueDate: new Date(Date.now() - 3  * 86400000), estimatedHours: 16 },
        { title: 'Database Schema Review',      description: 'Review and optimize database indexes for performance',         assigneeId: alice.id,createdById: superAdmin.id, teamId: engTeam.id, priority: 'MEDIUM', status: 'PENDING',  dueDate: new Date(Date.now() + 14 * 86400000), estimatedHours: 4  },
        { title: 'API Documentation',           description: 'Complete Swagger documentation for all endpoints',              assigneeId: bob.id,  createdById: alice.id, teamId: engTeam.id, priority: 'LOW',    status: 'ACCEPTED',    dueDate: new Date(Date.now() + 10 * 86400000), estimatedHours: 6  },
        { title: 'Performance Testing',         description: 'Load test the API with k6 and document results',               assigneeId: alice.id,createdById: superAdmin.id, teamId: engTeam.id, priority: 'HIGH', status: 'PENDING',   dueDate: new Date(Date.now() + 5  * 86400000), estimatedHours: 8  },
      ],
    });
  }
  console.log('✅ Sample tasks seeded');

  // ─── Announcements ────────────────────────────────────────────
  await prisma.announcement.createMany({
    data: [
      { title: 'Welcome to Enterprise Productivity!', content: 'We are excited to launch our new productivity tracking system. Please explore the features and reach out to HR for any questions.', type: 'GENERAL', targetType: 'COMPANY', authorId: superAdmin.id, isPinned: true },
      { title: 'Q3 Performance Reviews',  content: 'Q3 performance reviews will begin next week. Managers, please schedule 1:1 meetings with your team members.', type: 'POLICY', targetType: 'COMPANY', authorId: superAdmin.id },
    ],
  });
  console.log('✅ Announcements seeded');

  console.log('\n🎉 Database seed completed!');
  console.log('─────────────────────────────────');
  console.log('Super Admin:  superadmin@company.com / Admin@123456');
  console.log('Employees:    alice@company.com, bob@company.com, charlie@company.com (Password@123)');
  console.log('─────────────────────────────────');
}

seed()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
