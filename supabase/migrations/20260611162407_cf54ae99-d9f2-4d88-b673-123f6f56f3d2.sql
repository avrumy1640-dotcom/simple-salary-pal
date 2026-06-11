-- Extend notification_kind enum
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'pto_approved';
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'pto_denied';
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'expense_approved';
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'expense_denied';
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'request_answered';
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'payroll_paid';
