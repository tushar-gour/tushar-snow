import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Snow } from '../src/index.js';

// Use a dedicated, writable test root. Creates and permanently deletes only
// a uniquely named test collection and its documents.
const rootId = process.env.SNOW_TEST_ROOT_ID;
test('live Google Drive CRUD', { skip: !rootId ? 'Set SNOW_TEST_ROOT_ID and configure Google authentication' : false, timeout: 120_000 }, async () => {
  const snow = new Snow();
  await snow.connect({ rootId, driveId: process.env.SNOW_DRIVE_ID });
  const User = snow.model(`snow-test-${randomUUID()}`, { name: { type: String, required: true }, createdAt: { type: Date, default: () => new Date() } });
  const folderId = await User.collection.ready;
  try {
    const user = await User.create({ name: 'Alice' });
    const loaded = await User.findById(user._id);
    assert.equal(loaded.name, 'Alice');
    assert.ok(loaded.createdAt instanceof Date);
    loaded.name = 'Bob';
    await loaded.save();
    assert.equal((await User.findById(user._id)).name, 'Bob');
    assert.equal(await loaded.remove(), true);
    assert.equal(await User.findById(user._id), null);
  } finally {
    await snow.drive.deleteFile(folderId);
  }
});
