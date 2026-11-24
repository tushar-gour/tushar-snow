import { Snow, Schema } from './src/index.js';

// Configure ADC or GOOGLE_APPLICATION_CREDENTIALS outside this repository.
// For a service account, supply a Google Workspace shared drive ID.
const snow = new Snow();
await snow.connect(process.env.SNOW_ROOT_ID
  ? { rootId: process.env.SNOW_ROOT_ID, driveId: process.env.SNOW_DRIVE_ID }
  : { name: 'MyDatabase', driveId: process.env.SNOW_DRIVE_ID });
const User = snow.model('User', new Schema({
  name: { type: String, required: true },
  role: { type: String, default: 'user' },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: () => new Date() },
}));
const user = await User.create({ name: 'Alice' });
user.role = 'admin';
await user.save();
console.log(await User.find({ role: 'admin' }));
