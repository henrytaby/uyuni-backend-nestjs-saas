# Feature Specification: Agenda & Tasks (Productivity)

**Feature Branch**: `010-agenda-tasks`

**Created**: 2026-07-07  
**Updated**: 2026-07-23 (Enterprise Architect Review — v2)

**Status**: Ready

**Dependencies**:
- 002 (tenancy)
- 004 (RBAC with agenda:CRUD)
- 005 (audit)
- 006 (DataTable pattern)
- 007-dynamic-catalogs: Provides task_statuses catalog for visual label customization per tenant. Note: the core TaskStatus pipeline (PENDING/IN_PROGRESS/DONE/CANCELLED) is a fixed enum; the catalog provides additional tenant-customizable labels.
- 009 (CRM client/contact linking)

**Input**: User description: "Implement a productivity module with calendar appointments/meetings, task management with assignments, conflict detection, and reminders — essential for service businesses like clinics."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Appointment Scheduling (Priority: P1)

A team member schedules an appointment with a date/time (timezone handling: all times stored as UTC, displayed in tenant timezone), duration, an `isAllDay` flag, assigned team member, associated client/contact, and notes. The system detects conflicts (double-booking) for the same team member and warns before confirming (conflict detection is a soft warning, not hard block). Appointments have a validated status pipeline: SCHEDULED→CONFIRMED→COMPLETED, SCHEDULED→CANCELLED, CONFIRMED→CANCELLED.

**Why this priority**: Appointment scheduling is the core use case for service businesses (clinics, consultancies). Without it, the agenda module has no primary function.

**Independent Test**: Schedule an appointment, verify it appears on the calendar. Attempt to schedule a conflicting appointment for the same assignee and time — verify a conflict warning is returned.

**Acceptance Scenarios**:

1. **Given** a team member, **When** they schedule an appointment with date, time, duration, assignee, optional client, and `isAllDay` flag, **Then** the appointment is created with status "Scheduled".
2. **Given** an existing appointment for a team member on a specific date and time, **When** another appointment is scheduled for the same assignee with an overlapping time, **Then** the system returns a conflict warning with details of the existing appointment.
3. **Given** a scheduled appointment, **When** the assignee marks it as "Completed," **Then** the appointment status is updated following the validated pipeline and it is removed from the upcoming schedule.

---

### User Story 2 - Task Management & Assignment (Priority: P2)

A team member creates a task with a title, description, due date, priority (Low, Medium, High), and status. Tasks have a validated status pipeline: PENDING→IN_PROGRESS→DONE, and any status→CANCELLED. A catalog reference is used for `task_statuses` for visual labels only; the core pipeline is a fixed enum. Tasks can be assigned to another team member within the same tenant. Ownership scope provides visibility to both the creator and assignee. Tasks are filterable by assignee, status, and priority.

**Why this priority**: Task management supports operational coordination within a tenant. Assignment enables delegation — a core need for teams.

**Independent Test**: Create a task, assign it to a team member, update its status to "In Progress" then "Done." Filter tasks by assignee and verify.

**Acceptance Scenarios**:

1. **Given** a team member, **When** they create a task with title, description, due date, priority, and assignee, **Then** the task is stored and visible to both creator and assignee.
2. **Given** a task assigned to a team member, **When** the assignee updates its status to "In Progress," **Then** the task reflects the new status in the task list.
3. **Given** multiple tasks with different priorities and assignees, **When** the team member filters by a specific assignee, **Then** only that assignee's tasks are returned.

---

### User Story 3 - Calendar Views & Reminders (Priority: P3)

A user views their schedule by day or week. Calendar views are API endpoints returning structured data, not visual components. Appointments and tasks with due dates appear on the calendar. Upcoming appointments trigger reminders at a configurable interval before the scheduled time (reminders are in-app notifications initially).

**Why this priority**: Calendar views provide the visual interface for the agenda. Reminders prevent missed appointments — critical for service businesses.

**Independent Test**: View the weekly calendar with scheduled appointments and tasks due. Verify a reminder is generated for an upcoming appointment.

**Acceptance Scenarios**:

1. **Given** appointments scheduled for the current week, **When** the user hits the calendar endpoint, **Then** all appointments for that week are returned in their correct time slots.
2. **Given** tasks with due dates in the current week, **When** the user hits the calendar endpoint, **Then** tasks are returned on their due dates.
3. **Given** an appointment scheduled for 1 hour from now with reminders enabled, **When** the reminder time is reached, **Then** an in-app notification is generated for the assignee.

---

### User Story 4 - CRM Integration (Priority: P2)

Appointments and tasks can be linked to CRM Clients/Contacts from 009. This enables viewing a client's appointments and tasks directly from the CRM detail view.

**Why this priority**: Ties agenda management directly to client records, enhancing business value.

**Independent Test**: Link a task and an appointment to a specific CRM client, and verify they appear when fetching the client details.

**Acceptance Scenarios**:

1. **Given** an existing CRM client, **When** scheduling an appointment linked to that client, **Then** the appointment references the client ID.
2. **Given** a CRM client with linked tasks/appointments, **When** viewing the client's details, **Then** all linked tasks and appointments are properly retrieved.

### Edge Cases

- An appointment spans midnight — MUST be displayed correctly across both days in the calendar view.
- A task is reassigned to a different team member — the original creator retains visibility; the new assignee gains edit access, and a reassignment notification is fired.
- An appointment is cancelled after reminders have been sent — the cancellation MUST generate a cancellation notification.
- All-day appointments (no specific time) — MUST be displayed at the top of the day view.
- Timezone edge case: An appointment scheduled in one timezone, viewed in another. Handled by storing UTC and applying frontend offsets.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow creating, updating, and listing appointments with date, start time, duration, assignee, client/contact (optional), status, and notes.
- **FR-002**: System MUST detect scheduling conflicts (overlapping times for the same assignee) and return a soft warning before confirming.
- **FR-003**: Appointment statuses MUST include: Scheduled, Confirmed, Completed, Cancelled.
- **FR-004**: System MUST allow creating, updating, and listing tasks with title, description, due date, priority, status, and assignee.
- **FR-005**: Task statuses MUST include: Pending, In Progress, Done, Cancelled.
- **FR-006**: Task priorities MUST include: Low, Medium, High.
- **FR-007**: Tasks MUST be assignable to any team member within the same tenant.
- **FR-008**: System MUST provide calendar API views (day and week) showing both appointments and task due dates.
- **FR-009**: System MUST generate reminders (in-app notifications) for upcoming appointments at a configurable interval before the scheduled time.
- **FR-010**: All agenda data MUST be tenant-scoped with RBAC enforcement (agenda:CREATE, agenda:READ, agenda:UPDATE, agenda:DELETE).
- **FR-011**: Appointments and tasks MUST follow the generic repository pagination/search/sort pattern.
- **FR-012**: Appointment and Task entities MUST include standard audit columns and tenant scoping via 002.
- **FR-013**: Calendar view endpoint MUST accept a date range (startDate, endDate) and return all appointments and tasks within that range, merged and sorted chronologically.
- **FR-014**: Tasks MUST support filtering by assignee, status, priority, and due date range using the DataTable column filter pattern from 006.

### Non-Functional Requirements

- **NFR-001**: Calendar view <500ms for week with 50+ items.
- **NFR-002**: Conflict detection validation <100ms.
- **NFR-003**: Reminder delivery <60s latency.

### Key Entities

- **Appointment**: Scheduled event. Attributes: tenantId, clientId (FK, optional from 009), contactId (FK, optional from 009), assigneeId (FK to TenantUser), createdById, date, start time, duration, isAllDay, status, notes. Standard audit columns.
- **Task**: Work item. Attributes: tenantId, clientId (FK, optional from 009), contactId (FK, optional from 009), assigneeId (FK to TenantUser), createdById, title, description, due date, priority, status. Standard audit columns.
- **Reminder**: Notification trigger. Attributes: linked appointment, remind_at timestamp, delivery status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A team member can schedule an appointment in under 30 seconds.
- **SC-002**: Conflict detection identifies 100% of overlapping appointments for the same assignee — verified by automated tests.
- **SC-003**: Calendar views load in under 500ms for a week with 50+ appointments.
- **SC-004**: Reminders are delivered within 60s of the configured reminder time.

## Assumptions

- Reminders are initially delivered as in-app notifications; email/push notifications are a future enhancement.
- Duration is expressed in minutes (integer). Default: 60 minutes.
- Calendar views are API endpoints returning structured data; the visual rendering is handled by the frontend.
- Conflict detection is a soft warning (not a hard block) — the user can override and create the conflicting appointment after acknowledging the warning.
- All-day appointments are represented by a start date with the `isAllDay` flag.
- Timezone assumption: Stored as UTC, tenant-level timezone config used for logic/display.
- Recurring appointments NOT in scope.
