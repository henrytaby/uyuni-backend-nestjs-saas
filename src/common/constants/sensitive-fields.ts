/**
 * Registry of sensitive fields that should be redacted from audit logs and change records.
 * Format: 'ModelName.fieldName'
 */
export const SENSITIVE_FIELDS = ['User.passwordHash', 'RefreshToken.tokenHash'];
