import { ValidationError } from '../errors.js';
export const own = (obj, key) => Object.hasOwn(obj, key);
export const plain = value => value !== null && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
export const unsafe = key => ['__proto__', 'constructor', 'prototype'].includes(key);
export function clone(value, path = 'value', seen = new Set(), jsonDates = false) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value === 0 ? 0 : value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return jsonDates ? value.toISOString() : new Date(value.getTime());
  if (!Array.isArray(value) && !plain(value)) throw new ValidationError(`${path}: expected JSON-compatible data`);
  if (seen.has(value)) throw new ValidationError(`${path}: circular reference`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return Array.from({length: value.length}, (_, i) => {
        if (!own(value, i)) throw new ValidationError(`${path}[${i}]: sparse arrays are not supported`);
        return clone(value[i], `${path}[${i}]`, seen, jsonDates);
      });
    }
    const result = {};
    for (const key of Object.keys(value)) {
      if (unsafe(key)) throw new ValidationError(`${path}.${key}: unsafe field`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!('value' in descriptor)) throw new ValidationError(`${path}.${key}: accessors are not supported`);
      result[key] = clone(descriptor.value, `${path}.${key}`, seen, jsonDates);
    }
    return result;
  } finally { seen.delete(value); }
}
export function nameCheck(name, label = 'name') {
  if (typeof name !== 'string' || !name.trim() || /[\u0000-\u001f\u007f]/u.test(name)) throw new ValidationError(`${label} must be a non-empty string without control characters`);
  return name;
}
export function record(value, label) {
  if (!plain(value)) throw new ValidationError(`${label} must be a plain object`);
  for (const key of Object.keys(value)) {
    if (unsafe(key) || !('value' in Object.getOwnPropertyDescriptor(value, key))) throw new ValidationError(`${label}.${key}: unsafe field or accessor`);
  }
  return value;
}
