import { QueryError } from '../errors.js';
import { own, plain, unsafe } from './value.js';
const MISSING = Symbol('missing');
const fail = message => { throw new QueryError(message); };
const ops = new Set(['$eq','$ne','$gt','$gte','$lt','$lte','$in','$nin','$exists','$not']);
function equal(a, b) {
  if (a === MISSING || b === MISSING) return a === b;
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v,i) => equal(v,b[i]));
  if (plain(a) && plain(b)) return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => own(b,k) && equal(a[k],b[k]));
  return false;
}
function operand(v, seen = new Set()) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) return v;
  if (v instanceof Date && Number.isFinite(v.getTime())) return new Date(v.getTime());
  if (!plain(v) && !Array.isArray(v)) fail('Invalid query operand');
  if (seen.has(v)) fail('Circular query operand'); seen.add(v);
  try {
    if (Array.isArray(v)) return Array.from({length:v.length}, (_,i) => { if (!own(v,i)) fail('Sparse query array'); return operand(v[i],seen); });
    return Object.fromEntries(entries(v).map(([k,val])=>[k,operand(val,seen)]));
  } finally { seen.delete(v); }
}
function entries(v) {
  if (!plain(v)) fail('Query must be a plain object');
  return Object.keys(v).map(k => {const d=Object.getOwnPropertyDescriptor(v,k); if (unsafe(k) || !('value' in d)) fail(`Unsafe query key: ${k}`); return [k,d.value];});
}
function pathValue(doc, path) {
  let v=doc;
  for (const k of path) { if (v === null || typeof v !== 'object' || !own(v,k)) return MISSING; v=v[k]; }
  return v;
}
function comparison(a,b,op) {
  if (a instanceof Date && b instanceof Date) { a=a.getTime(); b=b.getTime(); }
  else if (typeof a !== typeof b || !['string','number'].includes(typeof a)) return false;
  return op==='$gt'?a>b:op==='$gte'?a>=b:op==='$lt'?a<b:a<=b;
}
function condition(input, stack) {
  if (!plain(input) || !Object.keys(input).some(k=>k.startsWith('$'))) { const val=operand(input); return v=>equal(v,val); }
  if (stack.has(input)) fail('Circular query'); stack.add(input);
  try {
    const tests=entries(input).map(([op,raw])=>{
      if (!ops.has(op)) fail(`Unknown query operator: ${op}`);
      if (op==='$not') { const test=condition(raw,stack); return v=>!test(v); }
      const val=operand(raw);
      if (op==='$exists') { if(typeof val!=='boolean') fail('$exists requires a boolean'); return v=>(v!==MISSING)===val; }
      if (op==='$in'||op==='$nin') { if(!Array.isArray(val)) fail(`${op} requires an array`); return v=>{const found=val.some(x=>equal(v,x)||(Array.isArray(v)&&v.some(item=>equal(item,x))));return op==='$in'?found:!found;}; }
      if (op==='$eq') return v=>equal(v,val);
      if (op==='$ne') return v=>!equal(v,val);
      if (!(val instanceof Date) && !['number','string'].includes(typeof val)) fail(`${op} requires a number, string or Date`);
      return v=>comparison(v,val,op);
    });
    return v=>tests.every(test=>test(v));
  } finally {stack.delete(input);}
}
function compile(query, stack) {
  if (stack.has(query)) fail('Circular query'); stack.add(query);
  try {
    const tests=entries(query).map(([key,val])=>{
      if (key.startsWith('$')) {
        if (!['$and','$or','$nor'].includes(key)) fail(`Unknown logical operator: ${key}`);
        if (!Array.isArray(val)||!val.length) fail(`${key} requires a non-empty array`);
        const children=Array.from(val, v=>compile(v,stack));
        return doc=>key==='$and'?children.every(t=>t(doc)):key==='$or'?children.some(t=>t(doc)):!children.some(t=>t(doc));
      }
      const path=key.split('.'); if(path.some(k=>!k||unsafe(k)||k.startsWith('$'))) fail(`Invalid query path: ${key}`);
      const test=condition(val,stack); return doc=>test(pathValue(doc,path));
    });
    return doc=>tests.every(t=>t(doc));
  } finally { stack.delete(query); }
}
export function compileQuery(query) { return compile(query,new Set()); }
export function match(doc,query) { return compileQuery(query)(doc); }
