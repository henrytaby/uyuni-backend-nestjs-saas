import { SENSITIVE_FIELDS } from '../constants/sensitive-fields.js';

export function redactSensitiveFields(
  modelName: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  if (!data) return data;
  const redacted = { ...data };

  for (const key of Object.keys(redacted)) {
    if (SENSITIVE_FIELDS.includes(`${modelName}.${key}`)) {
      redacted[key] = '[REDACTED]';
    }
  }

  return redacted;
}
