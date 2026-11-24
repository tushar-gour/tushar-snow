import { clone } from '../utils/value.js';
import { NotFoundError } from '../errors.js';
export class Document {
  #collection; #snapshot; #fileId; #removed=false;
  constructor(data, collection, fileId) {
    this.#collection=collection; this.#fileId=fileId; this.#snapshot=clone(data);
    Object.defineProperty(this,'_id',{value:data._id,enumerable:true});
    this.#replace(data);
  }
  #replace(data) {
    for(const key of Object.keys(this)) if(key!=='_id') delete this[key];
    for(const [key,value] of Object.entries(data)) if(key!=='_id') Object.defineProperty(this,key,{value:clone(value),writable:true,enumerable:true,configurable:true});
  }
  async save() {
    if(this.#removed) throw new NotFoundError('Document has been removed');
    const data=await this.#collection.saveDocument(this.#fileId,this.#snapshot,this.toJSON());
    this.#snapshot=clone(data); this.#replace(data); return this;
  }
  async remove() {
    if(this.#removed) return false;
    const result=await this.#collection.removeDocument(this.#fileId,this._id); this.#removed=true; return result;
  }
  toJSON() {return Object.fromEntries(Object.keys(this).map(k=>[k,this[k]]));}
}
