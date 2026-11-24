import { ValidationError } from '../errors.js';
import { clone, own, plain, record, unsafe } from '../utils/value.js';
const TYPES = new Set([String, Number, Boolean, Date, Array, Object]);
const RESERVED = new Set(['_id', 'save', 'remove', 'toJSON', '__collection', 'then']);
const fail = (path, msg) => { throw new ValidationError(`${path}: ${msg}`); };
function parseType(type, path, seen) {
  if (TYPES.has(type)) return type;
  if (Array.isArray(type)) {
    if (type.length > 1 || seen.has(type)) fail(path, 'array schema must contain at most one item type and cannot be circular');
    seen.add(type);
    try { return Object.freeze(type.length ? [parseType(type[0], `${path}[]`, seen)] : []); }
    finally { seen.delete(type); }
  }
  fail(path, 'unsupported schema type');
}
function cast(value, type, path) {
  if (type === String) {
    if (typeof value === 'string') return value;
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return String(value);
    fail(path, 'must be a string');
  }
  if (type === Number) {
    if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) fail(path, 'must be a finite number');
    const n = Number(value); if (!Number.isFinite(n)) fail(path, 'must be a finite number'); return n === 0 ? 0 : n;
  }
  if (type === Boolean) {
    if ([true, 'true', 1, '1'].includes(value)) return true;
    if ([false, 'false', 0, '0'].includes(value)) return false;
    fail(path, 'must be a boolean');
  }
  if (type === Date) {
    if (!(value instanceof Date) && typeof value !== 'string' && typeof value !== 'number') fail(path, 'must be a valid date');
    const d = new Date(value); if (!Number.isFinite(d.getTime())) fail(path, 'must be a valid date'); return d;
  }
  if (type === Array || Array.isArray(type)) {
    if (!Array.isArray(value)) fail(path, 'must be an array');
    if (!Array.isArray(type) || !type.length) return clone(value, path, new Set(), true);
    return Array.from({length: value.length}, (_, i) => {
      if (!own(value, i)) fail(`${path}[${i}]`, 'sparse arrays are not supported');
      return cast(value[i], type[0], `${path}[${i}]`);
    });
  }
  if (!plain(value)) fail(path, 'must be a plain object');
  return clone(value, path, new Set(), true);
}
export class Schema {
  #rules;
  constructor(definition) {
    record(definition, 'schema');
    const rules = [];
    for (const [key, input] of Object.entries(definition)) {
      if (RESERVED.has(key) || unsafe(key) || !key || key.includes('.') || key.startsWith('$')) fail(key, 'reserved or invalid schema field');
      const rule = plain(input) ? record(input, key) : {type: input};
      for (const option of Object.keys(rule)) if (!['type', 'required', 'default'].includes(option)) fail(key, `unknown schema option ${option}`);
      if (own(rule, 'required') && typeof rule.required !== 'boolean') fail(key, 'required must be boolean');
      const type = parseType(rule.type, key, new Set());
      const normalized = {type, required: rule.required === true};
      if (own(rule, 'default') && rule.default !== undefined) {
        normalized.default = typeof rule.default === 'function' ? rule.default : rule.default === null && !normalized.required ? null : cast(rule.default, type, key);
      }
      rules.push([key, Object.freeze(normalized)]);
    }
    this.#rules = rules;
  }
  get definition() { return Object.fromEntries(this.#rules.map(([key, rule]) => [key, {...rule, ...(own(rule, 'default') && typeof rule.default !== 'function' ? {default: clone(rule.default)} : {})}])); }
  validate(data, {defaults = true} = {}) {
    record(data, 'document');
    const out = {};
    for (const [key, rule] of this.#rules) {
      let value = own(data, key) ? data[key] : undefined;
      if (value === undefined && defaults && own(rule, 'default')) value = typeof rule.default === 'function' ? rule.default() : clone(rule.default);
      if (value === undefined || value === null) {
        if (rule.required) fail(key, 'is required');
        if (value === null) out[key] = null;
        continue;
      }
      const v = cast(value, rule.type, key);
      if (rule.required && rule.type === String && v.length === 0) fail(key, 'is required');
      out[key] = v;
    }
    return out;
  }
}
