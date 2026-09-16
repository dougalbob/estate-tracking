export const minimumBackupPasswordLength = 12;

export function validateBackupPassword(value: unknown) {
  if (typeof value !== "string" || value.length < minimumBackupPasswordLength) {
    return `Use a recovery password with at least ${minimumBackupPasswordLength} characters.`;
  }
  return null;
}
