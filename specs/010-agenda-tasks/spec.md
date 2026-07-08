# Feature Specification: Agenda & Tasks (Productivity)

**Feature Branch**: `010-agenda-tasks`

**Created**: 2026-07-07

**Status**: Draft

**Input**: User description: "Implement a productivity module with calendar appointments/meetings, task management with assignments, conflict detection, and reminders — essential for service businesses like clinics."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Appointment Scheduling (Priority: P1)

A team member schedules an appointment with a date/time, duration, assigned
team member, associated client/contact, and notes. The system detects
conflicts (double-booking) for the same team member and warns before
confirming. Appointments have statuses: Scheduled, Confirmed, Completed,
Cancelled.

**Why this priority**: Appointment scheduling is the core use case for
service businesses (clinics, consultancies). Without it, the agenda module
has no primary function.

**Independent Test**: Schedule an appointment, verify it appears on the
calendar. Attempt to schedule a conflicting appointment for the same
assignee and time — verify a conflict warning is returned.

**Acceptance Scenarios**:

1. **Given** a team member, **When** they schedule an appointment with
   date, time, duration, assignee, and optional client, **Then** the
   appointment is created with status "Scheduled."
2. **Given** an existing appointment for a team member on a specific date
   and time, **When** another appointment is scheduled for the same
   assignee with an overlapping time, **Then** the system returns a
   conflict warning with details of the existing appointment.
3. **Given** a scheduled appointment, **When** the assignee marks it as
   "Completed," **Then** the appointment status is updated and it is
  removed from the upcoming schedule.

---

### User Story 2 - Task Management & Assignment (Priority: P2)

A team member creates a task with a title, description, due date, priority
(Low, Medium, High), and status (Pending, In Progress, Done). Tasks can be
assigned to another team member within the same tenant. The assignee can
update the task status. Tasks are filterable by assignee, status, and
priority.

**Why this priority**: Task management supports operational coordination
within a tenant. Assignment enables delegation — a core need for teams.

**Independent Test**: Create a task, assign it to a team member, update its
status to "In Progress" then "Done." Filter tasks by assignee and verify.

**Acceptance Scenarios**:

1. **Given** a team member, **When** they create a task with title,
   description, due date, priority, and assignee, **Then** the task is
   stored and visible to the assignee.
2. **Given** a task assigned to a team member, **When** the assignee
   updates its status to "In Progress," **Then** the task reflects the
   new status in the task list.
3. **Given** multiple tasks with different priorities and assignees,
   **When** the team member filters by a specific assignee, **Then** only
   that assignee's tasks are returned.

---

### User Story 3 - Calendar Views & Reminders (Priority: P3)

A user views their schedule by day or week. Appointments and tasks with due
dates appear on the calendar. Upcoming appointments trigger reminders at a
configurable interval before the scheduled time.

**Why this priority**: Calendar views provide the visual interface for the
agenda. Reminders prevent missed appointments — critical for service
businesses.

**Independent Test**: View the weekly calendar with scheduled appointments
and tasks due. Verify a reminder is generated for an upcoming appointment.

**Acceptance Scenarios**:

1. **Given** appointments scheduled for the current week, **When** the
   user views the weekly calendar, **Then** all appointments for that week
   are displayed in their correct time slots.
2. **Given** tasks with due dates in the current week, **When** the user
   views the weekly calendar, **Then** tasks appear on their due dates.
3. **Given** an appointment scheduled for 1 hour from now with reminders
   enabled, **When** the reminder time is reached, **Then** a notification
  is generated for the assignee.

### Edge Cases

- An appointment spans midnight — MUST be displayed correctly across both
  days in the calendar view.
- A task is reassigned to a different team member — the original creator
  retains visibility; the new assignee gains edit access.
- An appointment is cancelled after reminders have been sent — the
  cancellation MUST generate a cancellation notification.
- All-day appointments (no specific time) — MUST be displayed at the top
  of the day view.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow creating, updating, and listing appointments
  with date, start time, duration, assignee, client/contact (optional),
  status, and notes.
- **FR-002**: System MUST detect scheduling conflicts (overlapping times
  for the same assignee) and return a warning before confirming.
- **FR-003**: Appointment statuses MUST include: Scheduled, Confirmed,
  Completed, Cancelled.
- **FR-004**: System MUST allow creating, updating, and listing tasks with
  title, description, due date, priority, status, and assignee.
- **FR-005**: Task statuses MUST include: Pending, In Progress, Done.
- **FR-006**: Task priorities MUST include: Low, Medium, High.
- **FR-007**: Tasks MUST be assignable to any team member within the same
  tenant.
- **FR-008**: System MUST provide calendar views (day and week) showing
  both appointments and task due dates.
- **FR-009**: System MUST generate reminders for upcoming appointments at
  a configurable interval before the scheduled time.
- **FR-010**: All agenda data MUST be tenant-scoped with RBAC enforcement
  (agenda:CREATE, agenda:READ, agenda:UPDATE, agenda:DELETE).
- **FR-011**: Appointments and tasks MUST follow the generic repository
  pagination/search/sort pattern.

### Key Entities

- **Appointment**: Scheduled event. Attributes: date, start time, duration,
  assignee (team member), linked client/contact (optional), status, notes.
- **Task**: Work item. Attributes: title, description, due date, priority,
  status, creator, assignee (team member).
- **Reminder**: Notification trigger. Attributes: linked appointment,
  remind_at timestamp, delivery status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A team member can schedule an appointment in under 30 seconds.
- **SC-002**: Conflict detection identifies 100% of overlapping appointments
  for the same assignee — verified by automated tests.
- **SC-003**: Calendar views load in under 2 seconds for a week with 50+
  appointments.
- **SC-004**: Reminders are delivered within 1 minute of the configured
  reminder time.

## Assumptions

- Reminders are initially delivered as in-app notifications; email/push
  notifications are a future enhancement.
- Duration is expressed in minutes (integer). Default: 60 minutes.
- Calendar views are API endpoints returning structured data; the visual
  rendering is handled by the frontend.
- Conflict detection is a soft warning (not a hard block) — the user can
  override and create the conflicting appointment after acknowledging the
  warning.
- All-day appointments are represented by a start date with no specific
  time and a duration of 0 or a special flag.
