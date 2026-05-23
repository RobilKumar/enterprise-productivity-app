-- ============================================================
-- SQL Server 2022 — Complete Database Setup Script
-- Enterprise Productivity & Work Monitoring System
-- ============================================================

USE master;
GO

-- Create database if not exists
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'ProductivityDB')
BEGIN
  CREATE DATABASE ProductivityDB
    COLLATE SQL_Latin1_General_CP1_CI_AS;
END
GO

USE ProductivityDB;
GO

-- ─────────────────────────────────────────────
-- TABLES
-- ─────────────────────────────────────────────

-- Departments
CREATE TABLE Departments (
  id           UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  name         NVARCHAR(100) NOT NULL,
  description  NVARCHAR(500),
  managerId    UNIQUEIDENTIFIER,
  isActive     BIT NOT NULL DEFAULT 1,
  createdAt    DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  updatedAt    DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
CREATE INDEX IX_Departments_managerId ON Departments(managerId);
CREATE INDEX IX_Departments_isActive  ON Departments(isActive);
GO

-- Roles
CREATE TABLE Roles (
  id          UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  name        NVARCHAR(50) NOT NULL UNIQUE,
  displayName NVARCHAR(100) NOT NULL,
  permissions NVARCHAR(MAX) NOT NULL, -- JSON
  createdAt   DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  updatedAt   DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
GO

-- Users
CREATE TABLE Users (
  id                  UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  employeeId          NVARCHAR(20) NOT NULL UNIQUE,
  firstName           NVARCHAR(100) NOT NULL,
  lastName            NVARCHAR(100) NOT NULL,
  email               NVARCHAR(255) NOT NULL UNIQUE,
  phone               NVARCHAR(20),
  passwordHash        NVARCHAR(255) NOT NULL,
  roleId              UNIQUEIDENTIFIER NOT NULL,
  departmentId        UNIQUEIDENTIFIER,
  teamId              UNIQUEIDENTIFIER,
  status              NVARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  avatarUrl           NVARCHAR(500),
  address             NVARCHAR(500),
  dateOfBirth         DATE,
  joiningDate         DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  shiftType           NVARCHAR(20) NOT NULL DEFAULT 'FLEXIBLE',
  fcmToken            NVARCHAR(500),
  lastLoginAt         DATETIME2,
  lastActiveAt        DATETIME2,
  totalPoints         INT NOT NULL DEFAULT 0,
  badgesJson          NVARCHAR(MAX),
  isOnline            BIT NOT NULL DEFAULT 0,
  twoFactorEnabled    BIT NOT NULL DEFAULT 0,
  twoFactorSecret     NVARCHAR(255),
  passwordResetToken  NVARCHAR(255),
  passwordResetExpiry DATETIME2,
  createdAt           DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  updatedAt           DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  deletedAt           DATETIME2,
  CONSTRAINT FK_Users_roleId       FOREIGN KEY (roleId)       REFERENCES Roles(id),
  CONSTRAINT FK_Users_departmentId FOREIGN KEY (departmentId) REFERENCES Departments(id),
  CONSTRAINT CK_Users_status       CHECK (status IN ('ACTIVE','INACTIVE','SUSPENDED','ON_LEAVE'))
);
CREATE INDEX IX_Users_email        ON Users(email);
CREATE INDEX IX_Users_employeeId   ON Users(employeeId);
CREATE INDEX IX_Users_roleId       ON Users(roleId);
CREATE INDEX IX_Users_departmentId ON Users(departmentId);
CREATE INDEX IX_Users_teamId       ON Users(teamId);
CREATE INDEX IX_Users_status       ON Users(status);
CREATE INDEX IX_Users_deletedAt    ON Users(deletedAt);
GO

-- Teams
CREATE TABLE Teams (
  id           UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  name         NVARCHAR(100) NOT NULL,
  description  NVARCHAR(500),
  leaderId     UNIQUEIDENTIFIER,
  departmentId UNIQUEIDENTIFIER,
  isActive     BIT NOT NULL DEFAULT 1,
  createdAt    DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  updatedAt    DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT FK_Teams_leaderId     FOREIGN KEY (leaderId)     REFERENCES Users(id),
  CONSTRAINT FK_Teams_departmentId FOREIGN KEY (departmentId) REFERENCES Departments(id)
);
CREATE INDEX IX_Teams_leaderId     ON Teams(leaderId);
CREATE INDEX IX_Teams_departmentId ON Teams(departmentId);
GO

-- Add FK from Departments back to Users (manager)
ALTER TABLE Departments
  ADD CONSTRAINT FK_Departments_managerId FOREIGN KEY (managerId) REFERENCES Users(id);
ALTER TABLE Users
  ADD CONSTRAINT FK_Users_teamId FOREIGN KEY (teamId) REFERENCES Teams(id);
GO

-- Tasks
CREATE TABLE Tasks (
  id               UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  title            NVARCHAR(300) NOT NULL,
  description      NVARCHAR(MAX),
  assigneeId       UNIQUEIDENTIFIER NOT NULL,
  createdById      UNIQUEIDENTIFIER NOT NULL,
  teamId           UNIQUEIDENTIFIER,
  status           NVARCHAR(20) NOT NULL DEFAULT 'PENDING',
  priority         NVARCHAR(10) NOT NULL DEFAULT 'MEDIUM',
  category         NVARCHAR(100),
  dueDate          DATETIME2,
  estimatedHours   FLOAT,
  actualHours      FLOAT,
  startedAt        DATETIME2,
  completedAt      DATETIME2,
  rejectionReason  NVARCHAR(500),
  isRecurring      BIT NOT NULL DEFAULT 0,
  recurringPattern NVARCHAR(100),
  recurringEndDate DATETIME2,
  parentTaskId     UNIQUEIDENTIFIER,
  geoLat           FLOAT,
  geoLng           FLOAT,
  geoAddress       NVARCHAR(500),
  slaHours         FLOAT,
  isEscalated      BIT NOT NULL DEFAULT 0,
  escalatedAt      DATETIME2,
  escalatedTo      UNIQUEIDENTIFIER,
  proofRequired    BIT NOT NULL DEFAULT 0,
  calendarEventId  NVARCHAR(255),
  createdAt        DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  updatedAt        DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  deletedAt        DATETIME2,
  CONSTRAINT FK_Tasks_assigneeId  FOREIGN KEY (assigneeId)  REFERENCES Users(id),
  CONSTRAINT FK_Tasks_createdById FOREIGN KEY (createdById) REFERENCES Users(id),
  CONSTRAINT FK_Tasks_teamId      FOREIGN KEY (teamId)      REFERENCES Teams(id),
  CONSTRAINT FK_Tasks_parentTaskId FOREIGN KEY (parentTaskId) REFERENCES Tasks(id),
  CONSTRAINT CK_Tasks_status      CHECK (status IN ('PENDING','ACCEPTED','IN_PROGRESS','ON_HOLD','COMPLETED','REJECTED','REOPENED')),
  CONSTRAINT CK_Tasks_priority    CHECK (priority IN ('CRITICAL','HIGH','MEDIUM','LOW'))
);
CREATE INDEX IX_Tasks_assigneeId  ON Tasks(assigneeId);
CREATE INDEX IX_Tasks_createdById ON Tasks(createdById);
CREATE INDEX IX_Tasks_teamId      ON Tasks(teamId);
CREATE INDEX IX_Tasks_status      ON Tasks(status);
CREATE INDEX IX_Tasks_priority    ON Tasks(priority);
CREATE INDEX IX_Tasks_dueDate     ON Tasks(dueDate);
CREATE INDEX IX_Tasks_isEscalated ON Tasks(isEscalated);
CREATE INDEX IX_Tasks_deletedAt   ON Tasks(deletedAt);
GO

-- TaskDependencies
CREATE TABLE TaskDependencies (
  id           UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  taskId       UNIQUEIDENTIFIER NOT NULL,
  dependsOnId  UNIQUEIDENTIFIER NOT NULL,
  createdAt    DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT FK_TaskDep_taskId      FOREIGN KEY (taskId)      REFERENCES Tasks(id) ON DELETE CASCADE,
  CONSTRAINT FK_TaskDep_dependsOnId FOREIGN KEY (dependsOnId) REFERENCES Tasks(id),
  CONSTRAINT UQ_TaskDependencies    UNIQUE (taskId, dependsOnId)
);
GO

-- TaskComments
CREATE TABLE TaskComments (
  id         UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  taskId     UNIQUEIDENTIFIER NOT NULL,
  userId     UNIQUEIDENTIFIER NOT NULL,
  content    NVARCHAR(MAX) NOT NULL,
  isInternal BIT NOT NULL DEFAULT 0,
  createdAt  DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  updatedAt  DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  deletedAt  DATETIME2,
  CONSTRAINT FK_TaskComments_taskId FOREIGN KEY (taskId) REFERENCES Tasks(id) ON DELETE CASCADE,
  CONSTRAINT FK_TaskComments_userId FOREIGN KEY (userId) REFERENCES Users(id)
);
CREATE INDEX IX_TaskComments_taskId ON TaskComments(taskId);
CREATE INDEX IX_TaskComments_userId ON TaskComments(userId);
GO

-- TaskHistory
CREATE TABLE TaskHistory (
  id          UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  taskId      UNIQUEIDENTIFIER NOT NULL,
  changedById UNIQUEIDENTIFIER NOT NULL,
  field       NVARCHAR(100) NOT NULL,
  oldValue    NVARCHAR(MAX),
  newValue    NVARCHAR(MAX),
  createdAt   DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT FK_TaskHistory_taskId FOREIGN KEY (taskId) REFERENCES Tasks(id) ON DELETE CASCADE
);
CREATE INDEX IX_TaskHistory_taskId ON TaskHistory(taskId);
GO

-- Attachments
CREATE TABLE Attachments (
  id           UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  taskId       UNIQUEIDENTIFIER,
  uploadedById UNIQUEIDENTIFIER NOT NULL,
  type         NVARCHAR(20) NOT NULL,
  fileName     NVARCHAR(255) NOT NULL,
  fileSize     INT NOT NULL,
  mimeType     NVARCHAR(100) NOT NULL,
  storageKey   NVARCHAR(500) NOT NULL,
  url          NVARCHAR(1000),
  thumbnailUrl NVARCHAR(1000),
  metadata     NVARCHAR(MAX),
  createdAt    DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT FK_Attachments_taskId FOREIGN KEY (taskId) REFERENCES Tasks(id) ON DELETE SET NULL
);
CREATE INDEX IX_Attachments_taskId ON Attachments(taskId);
GO

-- WorkTimeLogs
CREATE TABLE WorkTimeLogs (
  id         UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  userId     UNIQUEIDENTIFIER NOT NULL,
  taskId     UNIQUEIDENTIFIER,
  startTime  DATETIME2 NOT NULL,
  endTime    DATETIME2,
  durationMs BIGINT,
  isIdle     BIT NOT NULL DEFAULT 0,
  notes      NVARCHAR(500),
  createdAt  DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT FK_WorkTimeLogs_userId FOREIGN KEY (userId) REFERENCES Users(id),
  CONSTRAINT FK_WorkTimeLogs_taskId FOREIGN KEY (taskId) REFERENCES Tasks(id)
);
CREATE INDEX IX_WorkTimeLogs_userId    ON WorkTimeLogs(userId);
CREATE INDEX IX_WorkTimeLogs_taskId    ON WorkTimeLogs(taskId);
CREATE INDEX IX_WorkTimeLogs_startTime ON WorkTimeLogs(startTime);
GO

-- Attendance
CREATE TABLE Attendance (
  id        UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  userId    UNIQUEIDENTIFIER NOT NULL,
  date      DATE NOT NULL,
  checkIn   DATETIME2,
  checkOut  DATETIME2,
  workHours FLOAT,
  status    NVARCHAR(20) NOT NULL DEFAULT 'PRESENT',
  notes     NVARCHAR(500),
  geoLat    FLOAT,
  geoLng    FLOAT,
  createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  updatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT FK_Attendance_userId FOREIGN KEY (userId) REFERENCES Users(id),
  CONSTRAINT UQ_Attendance_user_date   UNIQUE (userId, date),
  CONSTRAINT CK_Attendance_status CHECK (status IN ('PRESENT','ABSENT','HALF_DAY','ON_LEAVE','HOLIDAY','REMOTE'))
);
CREATE INDEX IX_Attendance_userId ON Attendance(userId);
CREATE INDEX IX_Attendance_date   ON Attendance(date);
CREATE INDEX IX_Attendance_status ON Attendance(status);
GO

-- LeaveRequests
CREATE TABLE LeaveRequests (
  id           UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  userId       UNIQUEIDENTIFIER NOT NULL,
  type         NVARCHAR(20) NOT NULL,
  startDate    DATE NOT NULL,
  endDate      DATE NOT NULL,
  reason       NVARCHAR(1000) NOT NULL,
  status       NVARCHAR(20) NOT NULL DEFAULT 'PENDING',
  reviewedById UNIQUEIDENTIFIER,
  reviewedAt   DATETIME2,
  reviewNotes  NVARCHAR(500),
  createdAt    DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  updatedAt    DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT FK_LeaveRequests_userId FOREIGN KEY (userId) REFERENCES Users(id),
  CONSTRAINT CK_LeaveRequests_status CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  CONSTRAINT CK_LeaveRequests_type   CHECK (type IN ('ANNUAL','SICK','CASUAL','MATERNITY','PATERNITY','UNPAID'))
);
CREATE INDEX IX_LeaveRequests_userId    ON LeaveRequests(userId);
CREATE INDEX IX_LeaveRequests_status    ON LeaveRequests(status);
GO

-- Notifications
CREATE TABLE Notifications (
  id          UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  userId      UNIQUEIDENTIFIER NOT NULL,
  type        NVARCHAR(30) NOT NULL,
  title       NVARCHAR(255) NOT NULL,
  body        NVARCHAR(1000) NOT NULL,
  data        NVARCHAR(MAX),
  isRead      BIT NOT NULL DEFAULT 0,
  readAt      DATETIME2,
  sentViaPush BIT NOT NULL DEFAULT 0,
  createdAt   DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT FK_Notifications_userId FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
);
CREATE INDEX IX_Notifications_userId ON Notifications(userId);
CREATE INDEX IX_Notifications_isRead ON Notifications(isRead);
GO

-- ProductivityMetrics
CREATE TABLE ProductivityMetrics (
  id                  UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  userId              UNIQUEIDENTIFIER NOT NULL,
  date                DATE NOT NULL,
  tasksCompleted      INT NOT NULL DEFAULT 0,
  tasksPending        INT NOT NULL DEFAULT 0,
  tasksOverdue        INT NOT NULL DEFAULT 0,
  totalWorkHours      FLOAT NOT NULL DEFAULT 0,
  productivityScore   FLOAT NOT NULL DEFAULT 0,
  avgCompletionHours  FLOAT,
  delayPercentage     FLOAT NOT NULL DEFAULT 0,
  onTimeDeliveryRate  FLOAT NOT NULL DEFAULT 0,
  slaBreaches         INT NOT NULL DEFAULT 0,
  createdAt           DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT FK_ProductivityMetrics_userId FOREIGN KEY (userId) REFERENCES Users(id),
  CONSTRAINT UQ_Productivity_user_date     UNIQUE (userId, date)
);
CREATE INDEX IX_Productivity_userId ON ProductivityMetrics(userId);
CREATE INDEX IX_Productivity_date   ON ProductivityMetrics(date);
GO

-- KpiReports
CREATE TABLE KpiReports (
  id            UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  reportType    NVARCHAR(50) NOT NULL,
  periodStart   DATETIME2 NOT NULL,
  periodEnd     DATETIME2 NOT NULL,
  scopeType     NVARCHAR(20) NOT NULL,
  scopeId       UNIQUEIDENTIFIER,
  data          NVARCHAR(MAX) NOT NULL,
  generatedById UNIQUEIDENTIFIER,
  createdAt     DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
CREATE INDEX IX_KpiReports_reportType ON KpiReports(reportType);
CREATE INDEX IX_KpiReports_period     ON KpiReports(periodStart, periodEnd);
GO

-- PerformanceReviews
CREATE TABLE PerformanceReviews (
  id             UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  subjectId      UNIQUEIDENTIFIER NOT NULL,
  reviewerId     UNIQUEIDENTIFIER NOT NULL,
  period         NVARCHAR(50) NOT NULL,
  overallRating  FLOAT,
  strengths      NVARCHAR(MAX),
  areasToImprove NVARCHAR(MAX),
  goals          NVARCHAR(MAX),
  kpiData        NVARCHAR(MAX),
  status         NVARCHAR(20) NOT NULL DEFAULT 'PENDING',
  completedAt    DATETIME2,
  createdAt      DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  updatedAt      DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT FK_Reviews_subjectId  FOREIGN KEY (subjectId)  REFERENCES Users(id),
  CONSTRAINT FK_Reviews_reviewerId FOREIGN KEY (reviewerId) REFERENCES Users(id)
);
CREATE INDEX IX_Reviews_subjectId  ON PerformanceReviews(subjectId);
CREATE INDEX IX_Reviews_reviewerId ON PerformanceReviews(reviewerId);
GO

-- DailySummaries
CREATE TABLE DailySummaries (
  id            UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  userId        UNIQUEIDENTIFIER NOT NULL,
  date          DATE NOT NULL,
  summary       NVARCHAR(MAX) NOT NULL,
  tasksWorkedOn NVARCHAR(MAX) NOT NULL,
  challenges    NVARCHAR(MAX),
  nextDayPlan   NVARCHAR(MAX),
  hoursWorked   FLOAT,
  createdAt     DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT FK_DailySummaries_userId FOREIGN KEY (userId) REFERENCES Users(id),
  CONSTRAINT UQ_DailySummaries_user_date UNIQUE (userId, date)
);
CREATE INDEX IX_DailySummaries_userId ON DailySummaries(userId);
CREATE INDEX IX_DailySummaries_date   ON DailySummaries(date);
GO

-- ChatRooms, ChatRoomMembers, ChatMessages
CREATE TABLE ChatRooms (
  id          UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  name        NVARCHAR(100),
  isGroupChat BIT NOT NULL DEFAULT 0,
  teamId      UNIQUEIDENTIFIER UNIQUE,
  createdAt   DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT FK_ChatRooms_teamId FOREIGN KEY (teamId) REFERENCES Teams(id)
);

CREATE TABLE ChatRoomMembers (
  id         UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  roomId     UNIQUEIDENTIFIER NOT NULL,
  userId     UNIQUEIDENTIFIER NOT NULL,
  joinedAt   DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  lastReadAt DATETIME2,
  CONSTRAINT FK_ChatRoomMembers_roomId FOREIGN KEY (roomId) REFERENCES ChatRooms(id) ON DELETE CASCADE,
  CONSTRAINT FK_ChatRoomMembers_userId FOREIGN KEY (userId) REFERENCES Users(id),
  CONSTRAINT UQ_ChatRoomMembers        UNIQUE (roomId, userId)
);

CREATE TABLE ChatMessages (
  id        UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  roomId    UNIQUEIDENTIFIER NOT NULL,
  senderId  UNIQUEIDENTIFIER NOT NULL,
  content   NVARCHAR(MAX),
  mediaUrl  NVARCHAR(1000),
  mediaType NVARCHAR(50),
  isDeleted BIT NOT NULL DEFAULT 0,
  createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT FK_ChatMessages_roomId   FOREIGN KEY (roomId)   REFERENCES ChatRooms(id) ON DELETE CASCADE,
  CONSTRAINT FK_ChatMessages_senderId FOREIGN KEY (senderId) REFERENCES Users(id)
);
CREATE INDEX IX_ChatMessages_roomId    ON ChatMessages(roomId);
CREATE INDEX IX_ChatMessages_senderId  ON ChatMessages(senderId);
CREATE INDEX IX_ChatMessages_createdAt ON ChatMessages(createdAt);
GO

-- Announcements
CREATE TABLE Announcements (
  id          UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  authorId    UNIQUEIDENTIFIER NOT NULL,
  title       NVARCHAR(300) NOT NULL,
  content     NVARCHAR(MAX) NOT NULL,
  targetRoles NVARCHAR(MAX),
  targetTeams NVARCHAR(MAX),
  isPinned    BIT NOT NULL DEFAULT 0,
  expiresAt   DATETIME2,
  createdAt   DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  updatedAt   DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT FK_Announcements_authorId FOREIGN KEY (authorId) REFERENCES Users(id)
);
GO

-- Gamification
CREATE TABLE Badges (
  id          UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  name        NVARCHAR(100) NOT NULL,
  description NVARCHAR(300) NOT NULL,
  iconUrl     NVARCHAR(500) NOT NULL,
  condition   NVARCHAR(MAX) NOT NULL
);

CREATE TABLE UserBadges (
  id        UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  userId    UNIQUEIDENTIFIER NOT NULL,
  badgeId   UNIQUEIDENTIFIER NOT NULL,
  awardedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT FK_UserBadges_userId  FOREIGN KEY (userId)  REFERENCES Users(id),
  CONSTRAINT FK_UserBadges_badgeId FOREIGN KEY (badgeId) REFERENCES Badges(id),
  CONSTRAINT UQ_UserBadges         UNIQUE (userId, badgeId)
);

CREATE TABLE Leaderboard (
  id        UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  userId    UNIQUEIDENTIFIER NOT NULL,
  period    NVARCHAR(20) NOT NULL,
  periodKey NVARCHAR(20) NOT NULL,
  points    INT NOT NULL DEFAULT 0,
  rank      INT,
  createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  updatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT FK_Leaderboard_userId FOREIGN KEY (userId) REFERENCES Users(id),
  CONSTRAINT UQ_Leaderboard_user_period UNIQUE (userId, periodKey)
);
CREATE INDEX IX_Leaderboard_period ON Leaderboard(periodKey, points DESC);
GO

-- Audit & Activity Logs
CREATE TABLE AuditLogs (
  id        UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  userId    UNIQUEIDENTIFIER,
  action    NVARCHAR(100) NOT NULL,
  entity    NVARCHAR(50) NOT NULL,
  entityId  NVARCHAR(50),
  oldData   NVARCHAR(MAX),
  newData   NVARCHAR(MAX),
  ipAddress NVARCHAR(50),
  userAgent NVARCHAR(500),
  createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);
CREATE INDEX IX_AuditLogs_userId    ON AuditLogs(userId);
CREATE INDEX IX_AuditLogs_entity    ON AuditLogs(entity, entityId);
CREATE INDEX IX_AuditLogs_action    ON AuditLogs(action);
CREATE INDEX IX_AuditLogs_createdAt ON AuditLogs(createdAt);

CREATE TABLE ActivityLogs (
  id        UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  userId    UNIQUEIDENTIFIER NOT NULL,
  event     NVARCHAR(100) NOT NULL,
  metadata  NVARCHAR(MAX),
  createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT FK_ActivityLogs_userId FOREIGN KEY (userId) REFERENCES Users(id)
);
CREATE INDEX IX_ActivityLogs_userId    ON ActivityLogs(userId);
CREATE INDEX IX_ActivityLogs_event     ON ActivityLogs(event);
CREATE INDEX IX_ActivityLogs_createdAt ON ActivityLogs(createdAt);
GO

-- RefreshTokens
CREATE TABLE RefreshTokens (
  id        UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  userId    UNIQUEIDENTIFIER NOT NULL,
  token     NVARCHAR(500) NOT NULL,
  expiresAt DATETIME2 NOT NULL,
  isRevoked BIT NOT NULL DEFAULT 0,
  createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  ipAddress NVARCHAR(50),
  userAgent NVARCHAR(500),
  CONSTRAINT FK_RefreshTokens_userId FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
);
CREATE INDEX IX_RefreshTokens_token  ON RefreshTokens(token);
CREATE INDEX IX_RefreshTokens_userId ON RefreshTokens(userId);

-- OtpRecords
CREATE TABLE OtpRecords (
  id        UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  userId    UNIQUEIDENTIFIER NOT NULL,
  otp       NVARCHAR(10) NOT NULL,
  purpose   NVARCHAR(50) NOT NULL,
  expiresAt DATETIME2 NOT NULL,
  isUsed    BIT NOT NULL DEFAULT 0,
  createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT FK_OtpRecords_userId FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
);
CREATE INDEX IX_OtpRecords_userId ON OtpRecords(userId);
GO

-- ShiftAssignments
CREATE TABLE ShiftAssignments (
  id        UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
  userId    UNIQUEIDENTIFIER NOT NULL,
  shiftType NVARCHAR(20) NOT NULL,
  startTime NVARCHAR(5) NOT NULL,
  endTime   NVARCHAR(5) NOT NULL,
  date      DATE NOT NULL,
  notes     NVARCHAR(300),
  createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
  CONSTRAINT FK_ShiftAssignments_userId FOREIGN KEY (userId) REFERENCES Users(id)
);
CREATE INDEX IX_Shifts_userId ON ShiftAssignments(userId);
CREATE INDEX IX_Shifts_date   ON ShiftAssignments(date);
GO

-- ─────────────────────────────────────────────
-- STORED PROCEDURES
-- ─────────────────────────────────────────────

-- Calculate daily productivity metrics for a user
CREATE OR ALTER PROCEDURE sp_CalculateDailyProductivity
  @userId UNIQUEIDENTIFIER,
  @date DATE
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @tasksCompleted INT, @tasksPending INT, @tasksOverdue INT;
  DECLARE @totalWorkHours FLOAT, @avgCompletionHours FLOAT;
  DECLARE @delayPct FLOAT, @onTimePct FLOAT, @slaBreach INT;

  SELECT
    @tasksCompleted = COUNT(CASE WHEN status = 'COMPLETED' AND CAST(completedAt AS DATE) = @date THEN 1 END),
    @tasksPending   = COUNT(CASE WHEN status IN ('PENDING','ACCEPTED','IN_PROGRESS','ON_HOLD') THEN 1 END),
    @tasksOverdue   = COUNT(CASE WHEN dueDate < SYSDATETIME() AND status NOT IN ('COMPLETED','REJECTED') THEN 1 END)
  FROM Tasks WHERE assigneeId = @userId AND deletedAt IS NULL;

  SELECT @totalWorkHours = ISNULL(SUM(durationMs) / 3600000.0, 0)
  FROM WorkTimeLogs
  WHERE userId = @userId AND CAST(startTime AS DATE) = @date AND isIdle = 0;

  SELECT @avgCompletionHours = AVG(actualHours)
  FROM Tasks WHERE assigneeId = @userId AND status = 'COMPLETED'
    AND CAST(completedAt AS DATE) = @date AND actualHours IS NOT NULL;

  DECLARE @totalCompleted INT, @lateCompleted INT;
  SELECT @totalCompleted = COUNT(*), @lateCompleted = COUNT(CASE WHEN completedAt > dueDate THEN 1 END)
  FROM Tasks WHERE assigneeId = @userId AND status = 'COMPLETED' AND CAST(completedAt AS DATE) = @date;

  SET @delayPct  = CASE WHEN @totalCompleted > 0 THEN (@lateCompleted * 100.0 / @totalCompleted) ELSE 0 END;
  SET @onTimePct = 100 - @delayPct;

  SELECT @slaBreach = COUNT(*)
  FROM Tasks WHERE assigneeId = @userId AND isEscalated = 1 AND CAST(escalatedAt AS DATE) = @date;

  -- Compute score: weighted formula
  DECLARE @score FLOAT = CASE
    WHEN (@tasksCompleted + @tasksPending) = 0 THEN 0
    ELSE (@tasksCompleted * 100.0 / (@tasksCompleted + @tasksPending)) * (1 - @delayPct / 100.0)
  END;

  MERGE ProductivityMetrics AS target
  USING (SELECT @userId AS userId, @date AS date) AS source ON target.userId = source.userId AND target.date = source.date
  WHEN MATCHED THEN UPDATE SET
    tasksCompleted = @tasksCompleted, tasksPending = @tasksPending, tasksOverdue = @tasksOverdue,
    totalWorkHours = @totalWorkHours, productivityScore = @score, avgCompletionHours = @avgCompletionHours,
    delayPercentage = @delayPct, onTimeDeliveryRate = @onTimePct, slaBreaches = @slaBreach
  WHEN NOT MATCHED THEN INSERT
    (id, userId, date, tasksCompleted, tasksPending, tasksOverdue, totalWorkHours, productivityScore,
     avgCompletionHours, delayPercentage, onTimeDeliveryRate, slaBreaches)
    VALUES (NEWID(), @userId, @date, @tasksCompleted, @tasksPending, @tasksOverdue, @totalWorkHours,
            @score, @avgCompletionHours, @delayPct, @onTimePct, @slaBreach);
END;
GO

-- Get team KPI summary
CREATE OR ALTER PROCEDURE sp_GetTeamKPI
  @teamId    UNIQUEIDENTIFIER,
  @startDate DATE,
  @endDate   DATE
AS
BEGIN
  SET NOCOUNT ON;

  SELECT
    u.id AS userId,
    u.firstName + ' ' + u.lastName AS fullName,
    u.employeeId,
    ISNULL(AVG(pm.productivityScore), 0) AS avgProductivity,
    ISNULL(SUM(pm.tasksCompleted), 0)    AS totalCompleted,
    ISNULL(AVG(pm.onTimeDeliveryRate), 0) AS onTimeRate,
    ISNULL(SUM(pm.totalWorkHours), 0)    AS totalHours,
    ISNULL(AVG(pm.delayPercentage), 0)   AS avgDelay,
    u.totalPoints
  FROM Users u
  LEFT JOIN ProductivityMetrics pm ON pm.userId = u.id AND pm.date BETWEEN @startDate AND @endDate
  WHERE u.teamId = @teamId AND u.deletedAt IS NULL
  GROUP BY u.id, u.firstName, u.lastName, u.employeeId, u.totalPoints
  ORDER BY avgProductivity DESC;
END;
GO

-- Auto-escalate overdue tasks
CREATE OR ALTER PROCEDURE sp_EscalateOverdueTasks
  @gracePeriodHours INT = 2
AS
BEGIN
  SET NOCOUNT ON;

  DECLARE @escalated TABLE (taskId UNIQUEIDENTIFIER, assigneeId UNIQUEIDENTIFIER, title NVARCHAR(300));

  UPDATE Tasks SET isEscalated = 1, escalatedAt = SYSDATETIME()
  OUTPUT inserted.id, inserted.assigneeId, inserted.title INTO @escalated
  WHERE dueDate < DATEADD(HOUR, -@gracePeriodHours, SYSDATETIME())
    AND status NOT IN ('COMPLETED', 'REJECTED', 'ON_HOLD')
    AND isEscalated = 0
    AND deletedAt IS NULL;

  -- Insert notifications for escalated tasks
  INSERT INTO Notifications (id, userId, type, title, body, data, createdAt)
  SELECT NEWID(), e.assigneeId, 'ESCALATION',
    'Task Escalated',
    'Your task "' + LEFT(e.title, 80) + '..." has been escalated due to missed deadline.',
    '{"taskId":"' + CAST(e.taskId AS NVARCHAR(36)) + '"}',
    SYSDATETIME()
  FROM @escalated e;

  SELECT COUNT(*) AS escalatedCount FROM @escalated;
END;
GO

-- ─────────────────────────────────────────────
-- TRIGGERS
-- ─────────────────────────────────────────────

-- Track task history on status change
CREATE OR ALTER TRIGGER trg_Tasks_StatusHistory
ON Tasks AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;

  INSERT INTO TaskHistory (id, taskId, changedById, field, oldValue, newValue, createdAt)
  SELECT NEWID(), i.id, i.createdById, 'status', d.status, i.status, SYSDATETIME()
  FROM inserted i JOIN deleted d ON i.id = d.id
  WHERE i.status <> d.status;

  -- Update actualHours when completed
  UPDATE Tasks SET actualHours = DATEDIFF(MINUTE, startedAt, completedAt) / 60.0
  FROM inserted i
  WHERE Tasks.id = i.id AND i.status = 'COMPLETED' AND i.startedAt IS NOT NULL AND i.completedAt IS NOT NULL;
END;
GO

-- Auto-set startedAt when task moves to IN_PROGRESS
CREATE OR ALTER TRIGGER trg_Tasks_StartTime
ON Tasks AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  UPDATE Tasks SET startedAt = SYSDATETIME()
  FROM inserted i JOIN deleted d ON i.id = d.id
  WHERE Tasks.id = i.id AND i.status = 'IN_PROGRESS' AND d.status <> 'IN_PROGRESS' AND i.startedAt IS NULL;
END;
GO

-- Audit log on user changes
CREATE OR ALTER TRIGGER trg_Users_AuditLog
ON Users AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  INSERT INTO AuditLogs (id, entity, entityId, action, createdAt)
  SELECT NEWID(), 'User', CAST(i.id AS NVARCHAR(36)), 'UPDATE', SYSDATETIME()
  FROM inserted i;
END;
GO

-- ─────────────────────────────────────────────
-- SEED DATA
-- ─────────────────────────────────────────────

-- Seed roles
INSERT INTO Roles (id, name, displayName, permissions) VALUES
(NEWID(), 'SUPER_ADMIN', 'Super Admin',  '["*"]'),
(NEWID(), 'ADMIN',       'Admin',        '["users.*","tasks.*","teams.*","reports.*","kpi.*","announcements.*","leaves.*","shifts.*"]'),
(NEWID(), 'MANAGER',     'Manager',      '["users.read","tasks.*","teams.read","reports.read","kpi.read","leaves.review"]'),
(NEWID(), 'TEAM_LEADER', 'Team Leader',  '["tasks.*","teams.read","kpi.team","leaves.read"]'),
(NEWID(), 'EMPLOYEE',    'Employee',     '["tasks.read","tasks.update.own","profile.*","timer.*","chat.*","summary.*"]');
GO

-- Seed badges
INSERT INTO Badges (id, name, description, iconUrl, condition) VALUES
(NEWID(), 'First Task',      'Completed your first task',           '/badges/first-task.svg',    '{"type":"tasks_completed","count":1}'),
(NEWID(), 'Speed Demon',     'Completed 5 tasks ahead of deadline', '/badges/speed.svg',          '{"type":"early_completion","count":5}'),
(NEWID(), 'Century Club',    'Completed 100 tasks',                 '/badges/century.svg',        '{"type":"tasks_completed","count":100}'),
(NEWID(), 'Perfect Week',    '100% productivity for 7 days',        '/badges/perfect-week.svg',   '{"type":"perfect_productivity","days":7}'),
(NEWID(), 'Team Player',     'Collaborated on 20+ tasks',           '/badges/team-player.svg',    '{"type":"collaborations","count":20}'),
(NEWID(), 'Early Bird',      'Logged in before 8am for 10 days',    '/badges/early-bird.svg',     '{"type":"early_login","days":10}'),
(NEWID(), 'Streak Master',   '30-day task completion streak',       '/badges/streak.svg',         '{"type":"daily_streak","days":30}');
GO

PRINT 'Database setup completed successfully.';
GO
