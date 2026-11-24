import { ValidationError } from '../errors.js';
const byId=id=>{if(typeof id!=='string'||!id)throw new ValidationError('ID must be a non-empty string');return {_id:id};};
export class Model {
  constructor(collection) {this.collection=collection;}
  create(data){return this.collection.create(data);}
  find(query){return this.collection.find(query);}
  findOne(query){return this.collection.findOne(query);}
  async findById(id){return this.findOne(byId(id));}
  countDocuments(query){return this.collection.countDocuments(query);}
  updateOne(query,update){return this.collection.updateOne(query,update);}
  updateMany(query,update){return this.collection.updateMany(query,update);}
  async findByIdAndUpdate(id,update){return this.updateOne(byId(id),update);}
  deleteOne(query){return this.collection.deleteOne(query);}
  deleteMany(query){return this.collection.deleteMany(query);}
  async findByIdAndDelete(id){return this.deleteOne(byId(id));}
}
