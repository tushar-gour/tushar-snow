export class SnowError extends Error {
  constructor(message, options) { super(message, options); this.name = new.target.name; }
}
export class ValidationError extends SnowError {}
export class QueryError extends SnowError {}
export class StorageError extends SnowError {}
export class ConflictError extends SnowError {}
export class NotFoundError extends SnowError {}
