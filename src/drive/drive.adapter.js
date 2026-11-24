import { StorageError, ConflictError, ValidationError } from '../errors.js';
import { nameCheck, plain } from '../utils/value.js';
const FOLDER = 'application/vnd.google-apps.folder';
const escape = value => value.replaceAll('\\','\\\\').replaceAll("'", "\\'");
const quote = value => `'${escape(nameCheck(value))}'`;
export class DriveAdapter {
  constructor(drive, {driveId} = {}) {
    if (!drive?.files) throw new ValidationError('A Google Drive v3 client is required');
    this.drive = drive; this.driveId = driveId;
  }
  static async connect({credentials, auth, driveId} = {}) {
    const {google} = await import('googleapis');
    if (!auth) auth = new google.auth.GoogleAuth({credentials, scopes:['https://www.googleapis.com/auth/drive']});
    return new DriveAdapter(google.drive({version:'v3', auth}), {driveId});
  }
  async #request(operation, params) {
    try { return (await this.drive.files[operation](params, {retry: false})).data; }
    catch (cause) { throw new StorageError(`Drive files.${operation} failed${params.fileId ? ` (${params.fileId})` : ''}: ${cause.message}`, {cause}); }
  }
  async #list(q) {
    const result = new Map(), tokens = new Set(); let pageToken;
    do {
      const data = await this.#request('list', {q, spaces:'drive', pageSize:1000, fields:'nextPageToken,incompleteSearch,files(id,name,mimeType)', supportsAllDrives:true, includeItemsFromAllDrives:true, ...(this.driveId ? {corpora:'drive',driveId:this.driveId} : {corpora:'user'}), ...(pageToken ? {pageToken} : {})});
      if (data.incompleteSearch) throw new StorageError('Drive returned incomplete search results');
      for (const file of data.files ?? []) {
        if (!file.id || typeof file.name !== 'string') throw new StorageError('Invalid Drive listing metadata');
        result.set(file.id,file);
      }
      pageToken = data.nextPageToken;
      if (pageToken && tokens.has(pageToken)) throw new StorageError('Drive repeated a pagination token');
      if (pageToken) tokens.add(pageToken);
    } while(pageToken);
    return [...result.values()];
  }
  async ensureFolder(name, parentId = this.driveId ?? 'root') {
    const files = await this.#list(`name=${quote(name)} and ${quote(parentId)} in parents and mimeType='${FOLDER}' and trashed=false`);
    if (files.length > 1) throw new ConflictError(`Multiple folders named ${name} in ${parentId}; resolve duplicates or specify rootId`);
    if (files.length) return files[0].id;
    const folder = await this.#request('create',{requestBody:{name,mimeType:FOLDER,parents:[parentId]},fields:'id',supportsAllDrives:true});
    if (!folder.id) throw new StorageError('Drive did not return a folder ID');
    return folder.id;
  }
  async verifyFolder(id) {
    const file = await this.#request('get',{fileId:id, fields:'id,mimeType,trashed,driveId', supportsAllDrives:true});
    if (file.mimeType!==FOLDER || file.trashed || (this.driveId && file.driveId!==this.driveId && id!==this.driveId)) throw new StorageError(`${id} is not an accessible folder in the selected Drive`);
    return file.id;
  }
  async listFiles(folderId) {
    return (await this.#list(`${quote(folderId)} in parents and trashed=false`)).filter(f => f.name.endsWith('.json') && !f.mimeType?.startsWith('application/vnd.google-apps.'));
  }
  async readFile(fileId) {
    const data = await this.#request('get',{fileId,alt:'media',supportsAllDrives:true});
    try {
      const parsed = typeof data==='string' || Buffer.isBuffer(data) || data instanceof ArrayBuffer || ArrayBuffer.isView(data) ? JSON.parse(typeof data==='string' ? data : Buffer.from(data instanceof ArrayBuffer ? data : data.buffer, ...(ArrayBuffer.isView(data) ? [data.byteOffset,data.byteLength] : [])).toString('utf8')) : data;
      if (!plain(parsed)) throw new Error('Expected a JSON object');
      return parsed;
    } catch(cause) {throw new StorageError(`Invalid JSON document in Drive file ${fileId}`,{cause});}
  }
  async writeFile(name,data,folderId) {
    const file = await this.#request('create',{requestBody:{name,parents:[folderId],mimeType:'application/json'},media:{mimeType:'application/json',body:JSON.stringify(data)},fields:'id',supportsAllDrives:true});
    if (!file.id) throw new StorageError('Drive did not return a document file ID'); return file.id;
  }
  async updateFile(fileId,data) {
    await this.#request('update',{fileId,media:{mimeType:'application/json',body:JSON.stringify(data)},fields:'id',supportsAllDrives:true});
  }
  async deleteFile(fileId) {
    await this.#request('delete',{fileId,supportsAllDrives:true});
  }
}
