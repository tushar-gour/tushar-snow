export class MemoryDrive {
  folders=new Map(); files=new Map(); next=0; calls=[];
  async ensureFolder(name,parent){this.calls.push(['folder',name,parent]);const key=JSON.stringify([name,parent]);if(!this.folders.has(key))this.folders.set(key,`folder-${++this.next}`);return this.folders.get(key);}
  async listFiles(folder){return [...this.files].filter(([,f])=>f.folder===folder).map(([id,f])=>({id,name:f.name}));}
  async readFile(id){if(!this.files.has(id))throw Error('missing');return JSON.parse(this.files.get(id).body);}
  async writeFile(name,data,folder){const id=`file-${++this.next}`;this.files.set(id,{name,folder,body:JSON.stringify(data)});return id;}
  async updateFile(id,data){if(!this.files.has(id))throw Error('missing');this.files.get(id).body=JSON.stringify(data);}
  async deleteFile(id){if(!this.files.delete(id))throw Error('missing');}
}
