export const maxReferences = 3;
export const maxUploadBytes = 20 * 1024 * 1024;
export const referenceRoles = {
  face: 'Rosto',
  clothing: 'Roupa',
  style: 'Estilo',
} as const;

export type ReferenceRole = keyof typeof referenceRoles;
export type ReferencePhoto = {id: string; file: File; role: ReferenceRole};

export function validImage(value: unknown): value is Blob {
  return value instanceof Blob && value.size > 0 && value.size <= maxUploadBytes &&
    ['image/png', 'image/jpeg', 'image/webp'].includes(value.type);
}

export function isReferenceRole(value: unknown): value is ReferenceRole {
  return typeof value === 'string' && Object.hasOwn(referenceRoles, value);
}
