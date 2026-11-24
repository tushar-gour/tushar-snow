# Snow

**A lightweight document mapper for Google Drive.**

Snow brings a familiar, Mongoose-inspired programming interface to Google Drive. Define schemas, create models and work with structured documents while your data remains stored as ordinary JSON files in your own Drive.

Designed for personal tools, small content management systems, prototypes and low-traffic applications where simplicity, data ownership and portability matter more than database performance.

[![npm version](https://img.shields.io/npm/v/tushar-snow?color=315b91)](https://www.npmjs.com/package/tushar-snow) [![Node.js](https://img.shields.io/badge/Node.js-22%2B-417e38)](https://nodejs.org/) [![License](https://img.shields.io/npm/l/tushar-snow?color=555)](https://www.npmjs.com/package/tushar-snow)

## Contents

[Features](#features) · [Installation](#installation) · [Quick start](#quick-start) · [Authentication setup](#authentication-setup) · [Schemas](#schemas) · [CRUD operations](#crud-operations) · [Query operators](#query-operators) · [API reference](#api-reference) · [Storage architecture](#storage-architecture) · [Deployment](#deployment) · [Limitations](#limitations) · [Testing](#testing)

## Features

- **Drive-backed persistence.** Store structured documents in your own Google Drive without provisioning a separate database server.
- **Schema-driven models.** Validate fields, cast supported types, enforce required values and define defaults.
- **Document-oriented API.** Create, retrieve, update, delete and count documents using familiar asynchronous methods.
- **Flexible queries.** Filter by comparison operators, logical expressions, array membership and nested field paths.
- **Data integrity safeguards.** Generated immutable IDs, validation on writes, duplicate detection and stale-document checks.
- **Portable storage.** Inspect and back up ordinary JSON files without a proprietary database format.
- **Flexible authentication.** Use an authorized OAuth client, Google Application Default Credentials or a service account with a supported shared drive.
- **Testable architecture.** Inject a custom storage adapter to test application logic without contacting Google Drive.

## Installation

**Requirements:** Node.js 22 or newer, ES modules and a Google Cloud project with the Drive API enabled. Node.js 24 LTS is recommended.

For a new application, initialize your project and enable ES modules first. Existing ESM applications can skip this step.

```bash
npm init -y
npm pkg set type=module
```

Install Snow:

```bash
npm install tushar-snow
```

For the OAuth examples below, install the Google SDK as a direct dependency of your application:

```bash
npm install googleapis@^190.0.0
```

> Snow v2.0.1 uses Google APIs SDK v190, which requires Node.js 22 or newer. Use this minimum even if the published Snow package metadata advertises Node.js 20. Snow is an ESM JavaScript package and does not currently ship TypeScript declarations.

## Quick start

The following example uses OAuth credentials stored in environment variables. Complete the [authentication setup](#authentication-setup) first if you do not already have a refresh token.

Create `index.js`:

```js
import { loadEnvFile } from "node:process";
import { google } from "googleapis";
import { Snow, Schema } from "tushar-snow";

// For local development only. Omit when secrets are injected by your host.
loadEnvFile();

const auth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
);

auth.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const snow = new Snow();

await snow.connect({
  name: "MyDatabase",
  auth,
});

const User = snow.model(
  "Users",
  new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    age: Number,
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: () => new Date() },
  }),
);

const user = await User.create({
  name: "Alice",
  email: "alice@example.com",
  age: 25,
});

const adults = await User.find({ age: { $gte: 18 } });

console.log("Created:", user.toJSON());
console.log(
  "Adults:",
  adults.map((doc) => doc.toJSON()),
);
console.log("Database folder:", snow.rootId);
```

Run the application:

```bash
node index.js
```

Snow finds or creates the database folder, creates the collection when first needed and stores the new document in Drive. Subsequent runs reuse the database and collection. Each run of this example creates a new user; Snow does not enforce unique email addresses.

## Authentication setup

Snow requires authorized Drive access. A standard Google API key cannot authorize private file creation, updates or deletions.

| Method                          | Recommended use                                               |
| :------------------------------ | :------------------------------------------------------------ |
| User OAuth 2.0                  | Personal Google Drive and user-owned storage                  |
| Service account                 | Google Workspace shared drives with appropriate permissions   |
| Application Default Credentials | Environments with a compatible, preconfigured Google identity |

### Personal Google Drive

#### 1. Configure Google Cloud

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Enable the [Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com).
3. Open **Google Auth Platform**, configure the application branding and select the appropriate audience.
4. For an external app in Testing mode, add your Google account under **Audience > Test users**.
5. Under **Clients**, create an OAuth client with application type **Desktop app**.
6. Download the client JSON, rename it to `credentials.json` and place it in your local application directory.

Use the `https://www.googleapis.com/auth/drive.file` scope for app-created or explicitly authorized files. This limits access compared with the full Drive scope. Reuse the same OAuth application when reconnecting to your stored data.

#### 2. Obtain a refresh token

Authorize the application once on your local computer. The refresh token allows the Google SDK to obtain new access tokens without opening a browser on each backend startup.

<details>
<summary>One-time OAuth setup script</summary>

Create `setup-auth.mjs` in your application directory. This is an application-side helper, not a built-in Snow command. It uses a loopback callback, PKCE and OAuth state verification.

```js
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import { google } from "googleapis";

const { installed } = JSON.parse(await readFile("credentials.json", "utf8"));

if (!installed?.client_id || !installed?.client_secret) {
  throw new Error("Desktop OAuth credentials are required.");
}

const state = randomBytes(32).toString("base64url");
const verifier = randomBytes(48).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");

let resolveCode;
let rejectCode;

const codePromise = new Promise((resolve, reject) => {
  resolveCode = resolve;
  rejectCode = reject;
});

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");

  if (url.pathname !== "/oauth2callback") {
    res.writeHead(404).end("Not found.");
    return;
  }

  if (url.searchParams.get("state") !== state) {
    res.writeHead(400).end("Invalid OAuth state.");
    return;
  }

  const code = url.searchParams.get("code");

  if (!code || url.searchParams.has("error")) {
    res.writeHead(400).end("Authorization failed.");
    rejectCode(new Error("Google authorization was denied."));
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end("Authorization response received. Return to your terminal.");
  resolveCode(code);
});

let timer;

try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const redirect = `http://127.0.0.1:${server.address().port}/oauth2callback`;

  const auth = new google.auth.OAuth2(
    installed.client_id,
    installed.client_secret,
    redirect,
  );

  console.log("Open this URL in your browser:\n");
  console.log(
    auth.generateAuthUrl({
      scope: ["https://www.googleapis.com/auth/drive.file"],
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    }),
  );

  timer = setTimeout(() => {
    rejectCode(new Error("OAuth authorization timed out."));
  }, 300_000);

  const code = await codePromise;
  const { tokens } = await auth.getToken({
    code,
    codeVerifier: verifier,
  });

  if (!tokens.refresh_token) {
    throw new Error("No refresh token was returned by Google.");
  }

  const variables = {
    GOOGLE_CLIENT_ID: installed.client_id,
    GOOGLE_CLIENT_SECRET: installed.client_secret,
    GOOGLE_REFRESH_TOKEN: tokens.refresh_token,
  };

  const content = Object.entries(variables)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join("\n");

  // Refuse to overwrite existing credentials.
  await writeFile(".env", content + "\n", {
    flag: "wx",
    mode: 0o600,
  });

  console.log("OAuth credentials saved to .env.");
} catch (error) {
  console.error("OAuth setup failed:", error.name);
  if (error.code === "EEXIST") {
    console.error(".env already exists. Back it up before retrying.");
  }
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  server.close();
  server.closeAllConnections();
}
```

Run the helper locally and authorize the Google account in your browser:

```bash
node setup-auth.mjs
```

The helper writes `.env` without displaying the refresh token. On Windows, protect the file using appropriate filesystem permissions as well.

</details>

#### 3. Protect your credentials

The resulting `.env` contains:

```dotenv
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
```

Add sensitive files to `.gitignore`:

```gitignore
node_modules/
.env
.env.*
credentials.json
service-account.json
```

The Google SDK handles access token renewal. Refresh tokens can still expire or be revoked. External OAuth apps in Testing mode generally receive refresh tokens that expire after seven days when using Drive scopes. Configure the app appropriately for longer-running deployments and plan for reauthorization if needed.

See [Google OAuth for desktop applications](https://developers.google.com/identity/protocols/oauth2/native-app), [token expiration](https://developers.google.com/identity/protocols/oauth2#expiration) and [Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

### Google Workspace shared drives

For a service account, enable Drive API access, create a service account and grant it sufficient access to the shared drive, including permission to permanently delete files if your application uses deletion methods.

Configure Application Default Credentials or set `GOOGLE_APPLICATION_CREDENTIALS` to the absolute path of the service account key file. Prefer a keyless identity when your deployment platform supports one.

```js
import { Snow } from "tushar-snow";

const snow = new Snow();

await snow.connect({
  name: "MyDatabase",
  driveId: process.env.SNOW_DRIVE_ID,
});
```

Service accounts cannot own Drive files or use their own personal storage quota. Sharing an ordinary My Drive folder with a service account does not solve this ownership restriction. Use a supported shared drive or user OAuth instead.

See [Google shared drive documentation](https://developers.google.com/workspace/drive/api/guides/about-shareddrives).

## Schemas

Schemas describe the allowed fields and how Snow validates them before persistence.

```js
const Product = snow.model(
  "Products",
  new Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    available: { type: Boolean, default: true },
    categories: [String],
    metadata: Object,
    createdAt: { type: Date, default: () => new Date() },
  }),
);
```

### Supported types

| Type                         | Behavior                                                    |
| :--------------------------- | :---------------------------------------------------------- |
| `String`                     | Strings; casts finite numbers and booleans                  |
| `Number`                     | Finite numbers; casts valid nonempty numeric strings        |
| `Boolean`                    | Booleans, `0`, `1` and corresponding lowercase strings      |
| `Date`                       | Valid dates, serialized as ISO strings and restored on read |
| `Object`                     | JSON-compatible plain objects                               |
| `Array` or `[]`              | Mixed JSON-compatible arrays                                |
| `[String]`, `[Number]`, etc. | Typed arrays, including nested typed arrays                 |

Schema options are `type`, `required` and `default`. Defaults can be literal values or synchronous functions and are applied only when creating a document.

Required fields reject missing and null values; required strings also reject empty strings. Optional fields accept null. Unknown fields are stripped during creation and document saves, while unknown patch fields are rejected. Nested dates in mixed objects and arrays become ISO strings, rather than being restored automatically as dates.

Snow rejects invalid dates, nonfinite numbers, circular values, sparse arrays, unsafe keys and other unsupported data. The generated `_id` and document method names are reserved.

## CRUD operations

The examples below use the `User` model from the quick start. They are independent API examples unless a previous variable is referenced.

### Create

```js
const user = await User.create({
  name: "Alice",
  email: "alice@example.com",
  age: 25,
});

console.log(user._id);
```

Snow generates an immutable UUID for each new document and validates its schema before writing.

### Read

```js
const users = await User.find();
const adults = await User.find({ age: { $gte: 18 } });
const alice = await User.findOne({ email: "alice@example.com" });
const byId = await User.findById(user._id);
const count = await User.countDocuments({ active: true });
```

`findOne()` and `findById()` return `null` when no matching document exists. Results are not guaranteed to have a particular order.

### Update

```js
const updated = await User.findByIdAndUpdate(user._id, {
  age: 26,
});

await User.updateOne(
  { email: "alice@example.com" },
  {
    active: false,
  },
);

const modifiedCount = await User.updateMany(
  { active: false },
  { active: true },
);
```

Updates accept a plain top-level field patch, not MongoDB update operators such as `$set` or `$inc`. Setting an optional field to `undefined` removes it. Required fields cannot be removed.

### Document methods

```js
const document = await User.findById(user._id);

if (document) {
  document.name = "Alice Smith";
  await document.save();
  console.log(document.toJSON());
}
```

A stale document save raises `ConflictError` if Snow detects that its stored content changed since it was loaded. Reload and reconcile your changes before saving again. This safeguard is not an atomic distributed lock.

### Delete

```js
await User.findByIdAndDelete(user._id);
await User.deleteOne({ email: "alice@example.com" });
const deletedCount = await User.deleteMany({ active: false });
```

An existing document instance also supports `await document.remove()`.

> **Caution:** Deletions are permanent, not moves to the Drive trash. Single-document mutations require an explicit nonempty query. Bulk mutations require an explicit query; passing `{}` to `deleteMany` deletes every document in the collection.

## Query operators

| Operator                     | Description                          |
| :--------------------------- | :----------------------------------- |
| `$eq`, `$ne`                 | Deep equality and inequality         |
| `$gt`, `$gte`, `$lt`, `$lte` | Ordered comparison of matching types |
| `$in`, `$nin`                | Membership and exclusion             |
| `$exists`                    | Checks whether a field is present    |
| `$not`                       | Negates a field condition            |
| `$and`, `$or`, `$nor`        | Combines nonempty arrays of queries  |

### Combined conditions

```js
const results = await User.find({
  active: true,
  age: { $gte: 18, $lt: 65 },
  $or: [{ name: "Alice" }, { name: "Bob" }],
});
```

### Nested fields and arrays

```js
const products = await Product.find({
  "metadata.brand": "Acme",
  categories: { $in: ["electronics", "accessories"] },
  price: { $lte: 1000 },
});
```

### Date queries

```js
const recentUsers = await User.find({
  createdAt: { $gte: new Date("2026-01-01") },
});
```

Queries are type-sensitive and do not perform schema casting. Use numbers for numeric fields and `Date` instances for typed date fields. Multiple fields and operators are combined with logical AND. Missing fields differ from null; `$exists` also matches fields explicitly set to null. `$ne` and `$nin` match missing fields. Array equality compares the whole array; `$in` supports element membership. Invalid operators and malformed queries raise `QueryError` even when a collection is empty.

## API reference

### Connection

```js
const snow = new Snow();
await snow.connect({ name: "MyDatabase", auth });
```

| Option        | Description                                                |
| :------------ | :--------------------------------------------------------- |
| `name`        | Database folder name; required unless `rootId` is supplied |
| `auth`        | Authorized Google authentication client                    |
| `credentials` | Credentials object passed to GoogleAuth                    |
| `rootId`      | ID of an existing accessible database folder               |
| `parentId`    | Parent folder for database lookup or creation              |
| `driveId`     | Shared drive ID                                            |
| `adapter`     | Custom storage adapter for alternative storage or testing  |

`connect()` returns the Snow instance. `auth`, `credentials` and `adapter` are mutually exclusive; `rootId` cannot be combined with `parentId`. Without an explicit authentication client or credentials, Snow uses Google Application Default Credentials.

The default import is a shared Snow instance. Use `new Snow()` for independent databases or credentials. A connected instance cannot switch to another database. Models are cached per instance; `snow.model('Users')` retrieves a previously registered model. Conflicting schema definitions are rejected.

For stable deployment, prefer reconnecting to an authorized folder by ID:

```js
await snow.connect({
  rootId: process.env.SNOW_ROOT_ID,
  auth,
});
```

### Model methods

All model operations are asynchronous.

| Method                         | Resolved value                |
| :----------------------------- | :---------------------------- |
| `create(data)`                 | New document                  |
| `find(query = {})`             | Array of documents            |
| `findOne(query = {})`          | Document or `null`            |
| `findById(id)`                 | Document or `null`            |
| `countDocuments(query = {})`   | Number                        |
| `updateOne(query, patch)`      | Updated document or `null`    |
| `findByIdAndUpdate(id, patch)` | Updated document or `null`    |
| `updateMany(query, patch)`     | Number of completed updates   |
| `deleteOne(query)`             | Boolean                       |
| `findByIdAndDelete(id)`        | Boolean                       |
| `deleteMany(query)`            | Number of completed deletions |

### Document methods

| Method              | Returns                                                              |
| :------------------ | :------------------------------------------------------------------- |
| `document.save()`   | Promise resolving to the same validated document instance            |
| `document.remove()` | Promise resolving to a boolean; `false` if already removed or absent |
| `document.toJSON()` | Plain object containing enumerable document fields                   |

### Error handling

Snow exports named error classes for application-level handling.

| Error             | Meaning                                                                  |
| :---------------- | :----------------------------------------------------------------------- |
| `ValidationError` | Invalid schema, input, patch or configuration                            |
| `QueryError`      | Malformed or unsupported query                                           |
| `ConflictError`   | Duplicate storage names, conflicting configuration or stale document     |
| `NotFoundError`   | Document storage identity is missing or the document has been removed    |
| `StorageError`    | Drive request failure, invalid stored data or incomplete storage results |

```js
import { ValidationError, StorageError } from "tushar-snow";

try {
  await User.create({ email: "alice@example.com" });
} catch (error) {
  if (error instanceof ValidationError) {
    console.error("Invalid document:", error.message);
  } else if (error instanceof StorageError) {
    console.error("Storage operation failed.");
  } else {
    throw error;
  }
}
```

Inspect error causes privately when troubleshooting. Do not log raw Google SDK errors or authorization headers to public logs.

## Storage architecture

Snow maps application models to Drive folders and documents to individual JSON files.

```text
Application
    |
    v
Snow (models, schemas, queries)
    |
    v
Google Drive API v3
    |
    v
MyDatabase/
    Users/
        <uuid>.json
        <uuid>.json
    Products/
        <uuid>.json
```

A stored document is an ordinary JSON object:

```json
{
  "_id": "8ad09935-066b-48be-a914-42753a19bb7f",
  "name": "Alice",
  "email": "alice@example.com",
  "age": 25,
  "active": true,
  "createdAt": "2026-11-24T10:00:00.000Z"
}
```

The document ID matches its filename without the `.json` extension. Snow handles Drive pagination and ignores native Google documents and non-JSON files. Duplicate JSON names, malformed documents, mismatched IDs and incomplete searches cause errors rather than silently returning partial results.

Data can be inspected or exported directly from Drive. Avoid manual edits while an application is writing to the same collection. Back up data before changing a schema, upgrading from older releases or performing bulk deletions.

## Deployment

For unattended server operation, complete OAuth authorization once and inject the client credentials and refresh token through your hosting platform's secret manager. Do not deploy the local OAuth setup helper or open a browser during server startup.

```js
import { google } from "googleapis";
import { Snow } from "tushar-snow";

function requiredEnv(key) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
}

const auth = new google.auth.OAuth2(
  requiredEnv("GOOGLE_CLIENT_ID"),
  requiredEnv("GOOGLE_CLIENT_SECRET"),
);

auth.setCredentials({
  refresh_token: requiredEnv("GOOGLE_REFRESH_TOKEN"),
});

export const snow = new Snow();

await snow.connect({
  rootId: requiredEnv("SNOW_ROOT_ID"),
  auth,
});
```

Set `SNOW_ROOT_ID` to the ID printed during the initial quick start, using the same authorized OAuth application and account.

Before deployment, verify that the application connects on a fresh process without browser interaction, can read documents created in a previous process and can recover from an expired or revoked credential through an explicit reauthorization procedure. Keep a backup and monitor Drive errors and quota usage.

### Troubleshooting

| Symptom                       | What to check                                                    |
| :---------------------------- | :--------------------------------------------------------------- |
| Access blocked during consent | Correct Cloud project, OAuth audience and test-user membership   |
| `invalid_grant`               | Revoked or expired refresh token; reauthorize as needed          |
| Drive returns 403             | API enabled, OAuth scopes, permissions, storage and quota limits |
| Existing folder not found     | Correct account, folder ID and OAuth app access to that folder   |
| Duplicate folder error        | Resolve duplicate names or connect using the correct `rootId`    |
| Slow queries                  | Collection size, network latency and Drive API request volume    |

## Limitations

Snow is a document mapper over a file storage API, not a conventional database engine. Its interface resembles Mongoose, but it does not provide MongoDB's feature set or guarantees.

| Well suited for                   | Choose a conventional database for                       |
| :-------------------------------- | :------------------------------------------------------- |
| Personal utilities and prototypes | High-throughput applications                             |
| Small content collections         | Large indexed datasets and complex analytics             |
| Low-frequency reads and writes    | Latency-sensitive or real-time workloads                 |
| Portable, inspectable documents   | Financial or transactional systems                       |
| Single-writer applications        | Multiple concurrent writers requiring strong consistency |

**Performance.** Queries scan collection files and read documents without indexes, including lookups by ID. Cost and latency grow with collection size. Drive storage limits and API quotas still apply. See [Drive API usage limits](https://developers.google.com/workspace/drive/api/guides/limits).

**Consistency.** Operations are serialized within one model in one Snow instance. Separate processes, independent instances and external Drive edits can race. Stale-document detection is best effort, not an atomic compare-and-swap mechanism. Use a single writer where practical.

**Durability and retries.** Snow does not provide transactions, unique constraints, distributed locks, atomic bulk writes or exactly-once guarantees. Partial bulk changes are not rolled back. A network failure may leave a write's outcome uncertain; inspect storage before retrying mutations. Deletions are permanent. Maintain independent backups of important data.

## Testing

From the source repository:

```bash
npm ci
npm test
npm run test:coverage
```

Offline tests use an in-memory storage adapter and a mocked Drive client. No Google credentials are needed.

For live testing from the source checkout, configure compatible Application Default Credentials, set `SNOW_TEST_ROOT_ID` to a dedicated writable test folder and optionally set `SNOW_DRIVE_ID` for a shared drive. Then run:

```bash
npm run test:live
```

The integration test creates a uniquely named collection inside the test folder and permanently deletes that collection during cleanup. Never use an important production collection for testing. The npm package includes runtime code, this README and the license, not the source test suite.

### Release verification

Results recorded for v2.0.1 on 24 November 2026:

| Check                         | Result                                                 |
| :---------------------------- | :----------------------------------------------------- |
| Automated tests               | 132 of 132 passed                                      |
| Source line coverage          | 99.11%                                                 |
| Function coverage             | 99.26%                                                 |
| Branch coverage               | 95.99%                                                 |
| Live Google Drive integration | 13 of 13 checks passed in an external consumer project |
| npm dependency audit          | 0 known vulnerabilities at the time of testing         |

The live checks covered OAuth authorization, document creation, schema validation, queries, updates, stale-document detection, persistence across independent instances, bulk operations, deletion and cleanup. Long-running unattended authentication, load limits and distributed concurrency are not certified by these results.

## Contributing

Bug reports, reproducible test cases and focused improvements are welcome. When modifying the source, add regression tests for changed behavior and run the existing test suite. Do not include Google credentials, access tokens or private Drive data in issues, logs or pull requests.

## License

Snow is released under the [MIT License](./LICENSE).

Developed by Tushar Gour.
