import { DriveAdapter } from './drive/drive.adapter.js';
import { Collection } from './core/collection.js';
import { Model } from './core/model.js';
import { Schema } from './core/schema.js';
import { ValidationError, ConflictError } from './errors.js';
import { nameCheck, record } from './utils/value.js';
import { isDeepStrictEqual } from 'node:util';
export class Snow {
  #models=new Map(); #pending; #config;
  constructor(){this.connected=false;}
  async connect(config) {
    record(config,'connection config');const {name,credentials,auth,driveId,parentId,rootId,adapter}=config;
    if(!rootId || name!==undefined)nameCheck(name,'database name');
    for(const [key,value] of Object.entries({driveId,parentId,rootId}))if(value!==undefined)nameCheck(value,key);
    if(rootId&&parentId)throw new ValidationError('rootId and parentId cannot be combined');
    if(adapter && ['ensureFolder','listFiles','readFile','writeFile','updateFile','deleteFile'].some(key=>typeof adapter[key]!=='function'))throw new ValidationError('Invalid storage adapter');
    if(adapter&&(credentials||auth))throw new ValidationError('adapter cannot be combined with credentials or auth');
    if(credentials&&auth)throw new ValidationError('Use credentials or auth, not both');
    const identity={name,driveId,parentId,rootId,adapter,auth,credentials};
    if(this.connected||this.#pending){
      if(!isDeepStrictEqual(this.#config,identity)||this.#config.adapter!==adapter||this.#config.auth!==auth)throw new ConflictError('Snow instance already connected or connecting to a different database; create a new Snow()');
      return this.#pending??this;
    }
    this.#config=identity;
    this.#pending=(async()=>{
      const drive=adapter??await DriveAdapter.connect({credentials,auth,driveId});
      const id=rootId ? (typeof drive.verifyFolder==='function'?await drive.verifyFolder(rootId):rootId) : await drive.ensureFolder(name,parentId??driveId??'root');
      nameCheck(id,'root folder ID');this.drive=drive;this.rootId=id;this.dbName=name;this.connected=true;return this;
    })();
    try{return await this.#pending;}finally{this.#pending=undefined;if(!this.connected)this.#config=undefined;}
  }
  model(name,definition) {
    if(!this.connected)throw new Error('Snow is not connected. Call and await snow.connect() first.');nameCheck(name,'model name');
    const existing=this.#models.get(name);
    if(existing){if(definition!==undefined){const schema=definition instanceof Schema?definition:new Schema(definition);if(!isDeepStrictEqual(existing.collection.schema.definition,schema.definition))throw new ConflictError(`Model ${name} already has a different schema`);}return existing;}
    const model=new Model(new Collection(name,this.rootId,this.drive,definition));this.#models.set(name,model);return model;
  }
}
export default new Snow();
