# Public Task Creation — Email Override

How to override the default **task-assignment** email when creating a task through the
**public API** (`POST /api/tasks/public`).

By default, an assigned task sends a system-generated email ("A task was assigned to you").
Callers can supply an optional `email` object to replace that copy with their own subject,
header, body, and CTA button label.

---

## At a glance

|                     |                                                         |
| ------------------- | ------------------------------------------------------- |
| **Endpoint**        | `POST /api/tasks/public`                                |
| **Field**           | optional `email` object on the create payload           |
| **Applies to**      | the assignment email (`Assigned` / `AssignedToCompany`) |
| **Omitted fields**  | fall back to the default system copy                    |
| **`email` omitted** | behavior unchanged (default notification)               |

---

## Payload

```jsonc
{
  "name": "Review evaluation",
  "status": "todo",
  "clientId": "…",
  "companyId": "…",
  "email": {
    "subject": "Action Required: Collection Mystery Shop",
    "header": "A new evaluation is ready",
    "body": "<p>Please review the attached evaluation.</p>",
    "title": "Review Evaluations",
  },
}
```

## `email` object

| Field     | Type   | Description                                            |
| --------- | ------ | ------------------------------------------------------ |
| `subject` | string | Subject of the email notification.                     |
| `header`  | string | Header of the email notification.                      |
| `body`    | string | Body of the email notification.                        |
| `title`   | string | Call-to-action button title in the email notification. |

All fields are optional. Any field you provide replaces the default; any field you omit keeps
the system default copy. The email shell (branding + CTA linking to the task) is unchanged, and
task attachments are never attached to the email.

---

## How it works

The override rides the create request down to the async notification job:

```
POST /api/tasks/public  (controller: email pulled off the parsed DTO)
  → PublicTasksService.createTask(payload, { emailOverride })
      → sendTaskCreateNotifications.trigger({ user, task, emailOverride })   [trigger.dev]
          → TaskNotificationsService.sendTaskCreateNotifications(task, false, emailOverride)
              → NotificationService.create / createBulkNotification
                  → email = { ...getEmailDetails(...)[action], ...emailOverride }
```

The merge (`{ ...default, ...override }`) is why omitted fields fall back to the default copy.

## Known limitation

The override is **not** respected if multiple notifications trigger for the same recipient and
Copilot sends a single grouped email instead of the per-task email.
