/**
 * PRISM database schema (Drizzle).
 *
 * Single source of truth — `npm run db:generate` diffs this file against
 * the current migration history to produce a new SQL migration in
 * src/db/migrations/. Never hand-edit DDL.
 */
import {
  pgTable, text, varchar, integer, bigint, boolean, timestamp, uuid, jsonb, index, uniqueIndex, primaryKey, real,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export const jobs = pgTable('jobs', {
  id:              uuid('id').primaryKey().defaultRandom(),
  status:          varchar('status', { length: 24 }).notNull().default('queued'),
  // queued | dispatched | awaiting_selection | processing | uploading | complete | failed | cancelled
  // 'convert' for upload -> ORBIT, 'receive' for ORBIT version -> download
  jobType:         varchar('job_type', { length: 16 }).notNull().default('convert'),
  format:          varchar('format', { length: 16 }).notNull(),   // .3dm, .dwg, .obj, ...
  fileName:        varchar('file_name', { length: 512 }).notNull(),
  fileSize:        bigint('file_size', { mode: 'number' }).notNull(),
  filePath:        text('file_path').notNull(),                   // server-side staging path
  // ORBIT target
  orbitTarget:     varchar('orbit_target', { length: 8 }).notNull().default('prod'), // prod | dev
  projectId:       varchar('project_id', { length: 32 }).notNull(),
  modelId:         varchar('model_id',   { length: 32 }).notNull(),
  modelName:       varchar('model_name', { length: 256 }),
  // For receive jobs only — the ORBIT version to materialise.
  receiveVersionId: varchar('receive_version_id', { length: 64 }),
  // Extra output formats to produce alongside ORBIT (convert) or as the
  // primary output (receive). Subset of: 3dm, step, ifc, glb. Empty for
  // pure ORBIT-only convert jobs.
  outputFormats:    jsonb('output_formats').notNull().default(sql`'[]'::jsonb`),
  // Auth principal that submitted (apiKey id, admin user, or 'orbit-bearer')
  submittedBy:     varchar('submitted_by', { length: 128 }),
  // Conversion options (snapshot at submit time)
  options:         jsonb('options').notNull().default(sql`'{}'::jsonb`),
  // Two-phase layer-selection flow (see ARCHITECTURE.md "Layer selection"):
  //   selectLayers=true            -> first dispatch is a pollLayers job to a
  //                                   canLayer agent. The agent replies with
  //                                   the file's layer tree which is stored
  //                                   in layersJson; the job moves to
  //                                   'awaiting_selection'. The caller then
  //                                   POSTs the selection to /jobs/:id/layers
  //                                   which re-queues the job for normal
  //                                   convert dispatch.
  //   selectLayers=false (default) -> direct convert dispatch as before.
  selectLayers:           boolean('select_layers').notNull().default(false),
  layersJson:             jsonb('layers_json'),
  includedLayers:         jsonb('included_layers'),
  includeLayerDescendants: boolean('include_layer_descendants').notNull().default(false),
  // Dispatch
  nodeName:        varchar('node_name', { length: 128 }),
  agentSessionId:  uuid('agent_session_id'),
  // Progress
  currentStage:    varchar('current_stage', { length: 64 }),
  progressPercent: real('progress_percent'),
  lastMessage:     text('last_message'),
  // Outcome
  resultUrl:       text('result_url'),       // full URL on orbit-server
  rootObjectId:    varchar('root_object_id', { length: 64 }),
  versionId:       varchar('version_id', { length: 64 }),
  // Map of additional outputs: { '3dm': '/api/jobs/<id>/outputs/3dm', ... }
  outputs:         jsonb('outputs').notNull().default(sql`'{}'::jsonb`),
  error:           text('error'),
  // Optional callback
  callbackUrl:     text('callback_url'),
  // Timestamps
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt:     timestamp('completed_at', { withTimezone: true }),
}, (t) => ({
  byStatus:    index('jobs_status_idx').on(t.status),
  byCreatedAt: index('jobs_created_at_idx').on(t.createdAt),
  byProject:   index('jobs_project_idx').on(t.projectId),
  byJobType:   index('jobs_job_type_idx').on(t.jobType),
}));

// Streaming log lines per job. WS broadcasts and SSE responses select from here.
export const jobLogs = pgTable('job_logs', {
  id:    bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  ts:    timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
  level: varchar('level', { length: 8 }).notNull(),
  source: varchar('source', { length: 16 }).notNull(),  // 'server' | 'agent'
  message: text('message').notNull(),
}, (t) => ({
  byJob: index('job_logs_job_idx').on(t.jobId, t.ts),
}));

// ---------------------------------------------------------------------------
// API keys — for external /v1/* callers (X-API-Key header)
// ---------------------------------------------------------------------------

export const apiKeys = pgTable('api_keys', {
  id:         uuid('id').primaryKey().defaultRandom(),
  name:       varchar('name', { length: 128 }).notNull(),
  // SHA-256 hex of the plaintext key. Plaintext is shown to the user
  // once at create time and never persisted.
  keyHash:    varchar('key_hash', { length: 64 }).notNull().unique(),
  // Rate limit (per minute). Null = unlimited.
  rateLimitPerMin: integer('rate_limit_per_min'),
  // Per-month quota (job count). Null = unlimited.
  monthlyQuota:    integer('monthly_quota'),
  // Capability scopes the key is allowed to use. Empty list ⇒ legacy
  // behaviour (full /v1/* surface, gated only by isActive). Recognised
  // values: `visualiser:create_stream`. Future scopes (e.g.
  // `convert:submit`, `receive:submit`) will be added here as the surface
  // grows. Stored as a JSONB array of strings.
  scopes:     jsonb('scopes').notNull().default(sql`'[]'::jsonb`),
  isActive:   boolean('is_active').notNull().default(true),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Settings (key/value)
// ---------------------------------------------------------------------------

export const settings = pgTable('settings', {
  key:   varchar('key', { length: 64 }).primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Settings keys PRISM expects (consumed via getSetting() in server/src/orbit/client.ts etc.):
//   orbit_server_url, orbit_dev_server_url,    target URLs (admin-editable)
//   orbit_token, orbit_dev_token,              optional shared service tokens
//   job_retention_hours                        how long completed job rows survive
//   maintenance_mode                           '1' = block all auth, return 503
//   session_secret                             cookie signer (initialised from env on first boot)

// ---------------------------------------------------------------------------
// Layer presets — saved per (project_id, model_name)
// ---------------------------------------------------------------------------

export const layerPresets = pgTable('layer_presets', {
  id:        uuid('id').primaryKey().defaultRandom(),
  projectId: varchar('project_id', { length: 32 }).notNull(),
  modelName: varchar('model_name', { length: 256 }).notNull(),
  includedLayers: jsonb('included_layers').notNull().default(sql`'[]'::jsonb`),
  knownLayers:    jsonb('known_layers').notNull().default(sql`'[]'::jsonb`),
  includeDescendants: boolean('include_descendants').notNull().default(true),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byTarget: index('layer_presets_target_idx').on(t.projectId, t.modelName),
}));

// ---------------------------------------------------------------------------
// Admin users
// ---------------------------------------------------------------------------

export const adminUsers = pgTable('admin_users', {
  id:           uuid('id').primaryKey().defaultRandom(),
  username:     varchar('username', { length: 64 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 128 }).notNull(),  // bcrypt
  isActive:     boolean('is_active').notNull().default(true),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt:  timestamp('last_login_at', { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// Workstations — persistent agent identities
// ---------------------------------------------------------------------------

export const workstations = pgTable('workstations', {
  id:          uuid('id').primaryKey().defaultRandom(),
  machineId:   varchar('machine_id', { length: 64 }).notNull().unique(),  // stable GUID from the agent
  nodeName:    varchar('node_name', { length: 128 }).notNull(),
  // Capability flags — first-class booleans rather than a CSV string.
  canConvert:  boolean('can_convert').notNull().default(true),
  canLayer:    boolean('can_layer').notNull().default(true),
  canReceive:  boolean('can_receive').notNull().default(false),
  // Visualiser role: agent can host an Unreal + Pixel Streaming session.
  // False by default — only ticked on workstations that have UE installed
  // and a discrete GPU (validated at runtime by the agent's startup checks).
  canVisualise: boolean('can_visualise').notNull().default(false),
  // Tracks how many active visualiser runs are currently assigned to this
  // workstation. Phase G dispatcher reads this to pick the least-loaded
  // eligible box; bumped under a SELECT FOR UPDATE row lock at dispatch
  // time and decremented when the agent reports `visualisationEnded` /
  // `visualisationFailed`. Distinct from `agent_sessions.slots_busy`
  // because conversion + visualiser slots share the same socket but are
  // intentionally accounted separately (one UE process saturates a box).
  currentVisualiserLoad: integer('current_visualiser_load').notNull().default(0),
  // Reported by the agent on `hello`.
  supportedFormats: jsonb('supported_formats').notNull().default(sql`'[]'::jsonb`),
  slotsTotal:       integer('slots_total').notNull().default(1),
  agentVersion:     varchar('agent_version', { length: 32 }),
  rhinoVersion:     varchar('rhino_version', { length: 32 }),
  // Which orbit-ue-template release the agent reports as installed at its
  // VisualiserTemplateProjectPath (from the agent's `hello` payload). Null
  // until a visualiser-capable agent that knows about the field connects;
  // older agents simply never set it.
  installedTemplateTag:  varchar('installed_template_tag', { length: 128 }),
  installedConnectorTag: varchar('installed_connector_tag', { length: 128 }),
  isEnabled:        boolean('is_enabled').notNull().default(true),
  notes:            text('notes'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt:   timestamp('last_seen_at', { withTimezone: true }),
});

// Live WS session per agent connection. Insert on `hello`, delete on disconnect.
// Outlives the WS process if there's a clean shutdown miss — the dispatcher
// double-checks the connection before assigning.
export const agentSessions = pgTable('agent_sessions', {
  id:            uuid('id').primaryKey().defaultRandom(),
  workstationId: uuid('workstation_id').notNull().references(() => workstations.id, { onDelete: 'cascade' }),
  connectedAt:   timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
  lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true }),
  remoteAddr:    varchar('remote_addr', { length: 64 }),
  slotsBusy:     integer('slots_busy').notNull().default(0),
}, (t) => ({
  byWorkstation: index('agent_sessions_workstation_idx').on(t.workstationId),
}));

// ---------------------------------------------------------------------------
// Visualiser runs — Pixel Streaming sessions hosted on visualiser agents
// ---------------------------------------------------------------------------
//
// Phase A scaffold. A `visualiser_runs` row is created when the API surfaces
// `POST /v1/visualiser/streams` lands (Phase G), and updated by the agent's
// reverse-channel `visualisationReady` / `visualisationFailed` envelopes.
// Status transitions:
//
//   queued    -> the row exists; no agent has been assigned yet
//   importing -> dispatcher picked an agent; orchestrator is materialising the ORBIT version
//   streaming -> agent acked `visualisationReady`; signallingUrl is live
//   failed    -> terminal (timed out, GPU not found, UE crash, etc.)
//   ended    -> terminal (TTL expired, client disconnected, admin cancel)

export const visualiserRuns = pgTable('visualiser_runs', {
  id:          uuid('id').primaryKey().defaultRandom(),
  status:      varchar('status', { length: 16 }).notNull().default('queued'),
  // ORBIT target — same prod/dev split that lives on the `jobs` table.
  orbitTarget: varchar('orbit_target', { length: 8 }).notNull().default('prod'),
  projectId:   varchar('project_id', { length: 32 }).notNull(),
  modelId:     varchar('model_id',   { length: 32 }).notNull(),
  modelName:   varchar('model_name', { length: 256 }),
  importMode:  varchar('import_mode', { length: 8 }).notNull().default('single'),
  versionId:   varchar('version_id', { length: 64 }),
  // UE template tag (e.g. `v1.0.0-ue5.7`). Resolved from
  // agent_config.UnrealTemplateTag at dispatch time; persisted on the row so
  // re-runs after an agent upgrade still target the originally-requested
  // template. Null falls back to whatever the agent has installed.
  templateTag: varchar('template_tag', { length: 64 }),
  // Dispatch
  workstationId:  uuid('workstation_id').references(() => workstations.id, { onDelete: 'set null' }),
  agentSessionId: uuid('agent_session_id'),
  // Signalling URL the SPA connects to (filled in when status moves to streaming).
  signallingUrl:  text('signalling_url'),
  // Public deep-link to the embedded debug Pixel Streaming player. Phase I
  // replaces the iframe shim with a real Pixel Streaming frontend; Phase G
  // just persists `${PUBLIC_BASE_URL}/admin/#/visualiser/<runId>` so the
  // portal response carries the URL the operator can paste into a browser.
  playerUrl:      text('player_url'),
  streamerId:     varchar('streamer_id', { length: 64 }),
  // Auth principal that submitted (api_keys.id for `/v1/*` callers,
  // admin-user id for the admin UI, or `orbit:<userId>` for ORBIT bearers).
  // Kept as a free-form column for backwards compat; new visualiser code
  // additionally writes `requestedByApiKeyId` for the strict-FK auth
  // check on DELETE (so an API key may only stop streams it started).
  submittedBy:    varchar('submitted_by', { length: 128 }),
  requestedByApiKeyId: uuid('requested_by_api_key_id').references((): any => apiKeys.id, { onDelete: 'set null' }),
  // Request provenance (see auth/provenance.ts), stamped at POST /streams.
  //   originKind      — 'admin' (PRISM admin UI), 'api' (external API key),
  //                     'orbit' (ORBIT bearer), 'internal', or 'anonymous'.
  //   originAddress   — client IP (real source via Caddy X-Forwarded-For;
  //                     Fastify trustProxy=true).
  //   originPrincipal — friendly label: admin username, API key name, or
  //                     `orbit:<userId>`. Never the key plaintext / token.
  originKind:      varchar('origin_kind', { length: 16 }),
  originAddress:   varchar('origin_address', { length: 64 }),
  originPrincipal: varchar('origin_principal', { length: 128 }),
  // Max session lifetime — orchestrator hard tears down at TTL. Null = no cap.
  ttlSeconds:     integer('ttl_seconds'),
  // Optional callback URL the server will POST status updates to.
  callbackUrl:    text('callback_url'),
  // `error` carries the human-readable failure surfaced to the caller;
  // `failureReason` carries a stable machine code (e.g. `start_timeout`,
  // `no_workstation_available`, `agent_failed`) that the portal can
  // switch on without parsing the message.
  error:          text('error'),
  failureReason:  varchar('failure_reason', { length: 64 }),
  // Timestamps
  createdAt:    timestamp('created_at',     { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at',     { withTimezone: true }).notNull().defaultNow(),
  dispatchedAt: timestamp('dispatched_at',  { withTimezone: true }),
  readyAt:      timestamp('ready_at',       { withTimezone: true }),
  endedAt:      timestamp('ended_at',       { withTimezone: true }),
}, (t) => ({
  byStatus:     index('visualiser_runs_status_idx').on(t.status),
  byCreatedAt:  index('visualiser_runs_created_at_idx').on(t.createdAt),
  byProject:    index('visualiser_runs_project_idx').on(t.projectId),
}));

// Per-run lifecycle log lines for visualiser runs — mirrors `job_logs`.
// Written at the meaningful transitions (requested, dispatched, version
// resolved, ready, failed, ended, stopped) by both the server (lifecycle)
// and the agent reverse-channel. The admin Visualiser viewer renders these
// per run via `GET /api/visualiser/streams/:runId/logs`.
export const visualiserRunLogs = pgTable('visualiser_run_logs', {
  id:    bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  runId: uuid('run_id').notNull().references(() => visualiserRuns.id, { onDelete: 'cascade' }),
  ts:    timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
  level: varchar('level', { length: 8 }).notNull(),
  source: varchar('source', { length: 16 }).notNull(),  // 'server' | 'agent'
  message: text('message').notNull(),
}, (t) => ({
  byRun: index('visualiser_run_logs_run_idx').on(t.runId, t.ts),
}));

// ---------------------------------------------------------------------------
// Visualiser share links — opaque tokens that grant a view/control seat
// ---------------------------------------------------------------------------
//
// A run creator (API key) or an admin can mint a share link that opens the
// PRISM-hosted viewer page for a streaming run without an admin/portal
// login. The link embeds an opaque share token; the viewer page exchanges
// it (POST /streams/:runId/shares/exchange) for a short-lived signalling
// JWT carrying the link's `tier`. Links auto-die with the run — the
// exchange endpoint refuses any run that is not currently `streaming`, so
// no explicit cascade delete is needed (the FK is `on delete cascade`
// anyway so rows are reaped when the run row is, if it ever is).
//
// We persist only a SHA-256 hash of the token (same stance as api_keys) —
// the plaintext is returned once at mint time inside the share URL.

export const visualiserShareLinks = pgTable('visualiser_share_links', {
  id:        uuid('id').primaryKey().defaultRandom(),
  runId:     uuid('run_id').notNull().references(() => visualiserRuns.id, { onDelete: 'cascade' }),
  // SHA-256 hex of the opaque share token (never store plaintext).
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  // 'view' | 'control' — the tier minted into the signalling JWT on exchange.
  tier:      varchar('tier', { length: 8 }).notNull().default('view'),
  // Free-form principal that minted the link (apiKey:<id> or admin:<name>).
  createdBy: varchar('created_by', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // Null = never expires (still auto-dies with the run).
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (t) => ({
  byRun:   index('visualiser_share_links_run_idx').on(t.runId),
}));

// ---------------------------------------------------------------------------
// Project attachments — portal-uploaded files attached to an ORBIT project
// ---------------------------------------------------------------------------
//
// Phase J: a portal user can attach MVR (My Virtual Rig) scene files and
// GDTF (General Device Type Format) fixture files to an ORBIT project so the
// visualiser agent's orchestrator can pull them in alongside the converted
// glTF and surface the lighting design via UE's DMX plugin. The table is
// intentionally generic — content-type is recorded but not constrained at
// the DB layer; the REST handler is what enforces the per-upload mime
// whitelist (currently application/mvr, application/gdtf,
// application/octet-stream).
//
// Storage: the file body lives under
//   ${DATA_DIR}/project-attachments/<projectId>/<id>-<filename>
// on the server's local filesystem (mirroring how the convert flow stores
// upload bodies under UPLOAD_DIR). This is intentionally NOT in ORBIT's
// MinIO — these are PRISM-local files used during visualiser run staging.
//
// `projectId` is the upstream ORBIT project id; there is no FK because
// ORBIT projects live outside the PRISM DB. The dedicated
// `project_attachments_project_idx` keeps the by-project list query cheap.
//
// `uploadedByApiKeyId` is a strict FK to `api_keys`. ON DELETE SET NULL so
// rotating an API key doesn't wipe its attachments.

export const projectAttachments = pgTable('project_attachments', {
  id:           uuid('id').primaryKey().defaultRandom(),
  projectId:    text('project_id').notNull(),
  filename:     text('filename').notNull(),
  contentType:  text('content_type').notNull(),
  sizeBytes:    integer('size_bytes').notNull(),
  storagePath:  text('storage_path').notNull(),
  uploadedByApiKeyId: uuid('uploaded_by_api_key_id').references((): any => apiKeys.id, { onDelete: 'set null' }),
  uploadedAt:   timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:    timestamp('deleted_at', { withTimezone: true }),
}, (t) => ({
  byProject: index('project_attachments_project_idx').on(t.projectId),
}));

// ---------------------------------------------------------------------------
// Materials store — shared texture library + PBR materials
// ---------------------------------------------------------------------------
//
// Textures are stored globally (one file, one UUID) under
// `${DATA_DIR}/textures/<id>_<filename>` and referenced by materials via the
// `material_textures` join table, so the same texture can be reused across
// many materials. A material is a named bundle of PBR slot assignments
// (albedo / normal / roughness / …) that can be built up incrementally,
// exported as a ZIP, or created in bulk by importing a Megascans-style ZIP.
//
// `uploadedByAdminId` / `uploadedByApiKeyId` (and the material equivalents)
// are strict FKs with ON DELETE SET NULL so rotating an API key or removing
// an admin doesn't wipe the library rows. Both are nullable; an ORBIT bearer
// caller leaves both null.

export const textures = pgTable('textures', {
  id:               uuid('id').primaryKey().defaultRandom(),
  originalFilename: varchar('original_filename', { length: 256 }).notNull(),
  // User-editable label; defaults to the original filename on upload.
  displayName:      varchar('display_name', { length: 256 }),
  contentType:      varchar('content_type', { length: 128 }).notNull(),
  sizeBytes:        bigint('size_bytes', { mode: 'number' }).notNull(),
  storagePath:      varchar('storage_path', { length: 512 }).notNull(),
  tags:             text('tags').array().notNull().default(sql`'{}'::text[]`),
  uploadedByAdminId:  uuid('uploaded_by_admin_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  uploadedByApiKeyId: uuid('uploaded_by_api_key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:        timestamp('deleted_at', { withTimezone: true }),
}, (t) => ({
  byCreatedAt: index('textures_created_at_idx').on(t.createdAt),
}));

export const materials = pgTable('materials', {
  id:          uuid('id').primaryKey().defaultRandom(),
  name:        varchar('name', { length: 256 }).notNull(),
  description: text('description'),
  tags:        text('tags').array().notNull().default(sql`'{}'::text[]`),
  // Editable PBR parameters (scalar/colour overrides applied on top of the
  // assigned texture maps) that map onto a three.js MeshStandardMaterial.
  // Stored as a partial — only keys the user has changed are persisted; the
  // REST layer fills the rest from DEFAULT_MATERIAL_PARAMETERS at read time.
  parameters:  jsonb('parameters').notNull().default(sql`'{}'::jsonb`),
  // Auto-set to the albedo texture when that slot is assigned.
  thumbnailTextureId: uuid('thumbnail_texture_id').references((): any => textures.id, { onDelete: 'set null' }),
  createdByAdminId:   uuid('created_by_admin_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  createdByApiKeyId:  uuid('created_by_api_key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:   timestamp('deleted_at', { withTimezone: true }),
}, (t) => ({
  byCreatedAt: index('materials_created_at_idx').on(t.createdAt),
}));

// Slot assignment join table. One row per (material, slot); `slot` is one of
// albedo | normal | roughness | metallic | ao | emissive | opacity |
// displacement (validated at the REST layer, not the DB). Cascades when the
// owning material is hard-deleted; the texture FK is plain so a texture can
// only be removed once it has no live references (enforced at the REST layer).
export const materialTextures = pgTable('material_textures', {
  materialId: uuid('material_id').notNull().references(() => materials.id, { onDelete: 'cascade' }),
  slot:       varchar('slot', { length: 64 }).notNull(),
  textureId:  uuid('texture_id').notNull().references(() => textures.id),
  assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk:        primaryKey({ columns: [t.materialId, t.slot] }),
  byTexture: index('material_textures_texture_idx').on(t.textureId),
}));

// ---------------------------------------------------------------------------
// Fixture library — GDTF-derived types, media assets, MVR instances
// ---------------------------------------------------------------------------

export const fixtureTypes = pgTable('fixture_types', {
  id:               uuid('id').primaryKey().defaultRandom(),
  name:             varchar('name', { length: 256 }).notNull(),
  manufacturer:     varchar('manufacturer', { length: 256 }).notNull().default(''),
  fixtureName:      varchar('fixture_name', { length: 256 }).notNull().default(''),
  revision:         varchar('revision', { length: 128 }),
  tags:             text('tags').array().notNull().default(sql`'{}'::text[]`),
  status:           varchar('status', { length: 32 }).notNull().default('draft'),
  sourceGdtfId:     varchar('source_gdtf_id', { length: 256 }),
  sourceGdtfHash:   varchar('source_gdtf_hash', { length: 64 }),
  definition:       jsonb('definition').notNull().default(sql`'{}'::jsonb`),
  previewModelId:   uuid('preview_model_id'),
  createdByAdminId:   uuid('created_by_admin_id').references(() => adminUsers.id, { onDelete: 'set null' }),
  createdByApiKeyId:  uuid('created_by_api_key_id').references(() => apiKeys.id, { onDelete: 'set null' }),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:        timestamp('deleted_at', { withTimezone: true }),
}, (t) => ({
  byCreatedAt:    index('fixture_types_created_at_idx').on(t.createdAt),
  byManufacturer: index('fixture_types_manufacturer_idx').on(t.manufacturer),
  byGdtfHash:     index('fixture_types_gdtf_hash_idx').on(t.sourceGdtfHash),
}));

export const fixtureMedia = pgTable('fixture_media', {
  id:               uuid('id').primaryKey().defaultRandom(),
  mediaType:        varchar('media_type', { length: 64 }).notNull(),
  contentHash:      varchar('content_hash', { length: 64 }).notNull(),
  originalFilename: varchar('original_filename', { length: 256 }).notNull(),
  contentType:      varchar('content_type', { length: 128 }).notNull(),
  sizeBytes:        bigint('size_bytes', { mode: 'number' }).notNull(),
  storagePath:      varchar('storage_path', { length: 512 }).notNull(),
  fixtureTypeId:    uuid('fixture_type_id').references(() => fixtureTypes.id, { onDelete: 'set null' }),
  metadata:         jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
  createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:        timestamp('deleted_at', { withTimezone: true }),
}, (t) => ({
  byHash:         index('fixture_media_hash_idx').on(t.contentHash),
  byFixtureType:  index('fixture_media_fixture_type_idx').on(t.fixtureTypeId),
}));

export const gdtfCache = pgTable('gdtf_cache', {
  id:             uuid('id').primaryKey().defaultRandom(),
  manufacturer:   varchar('manufacturer', { length: 256 }).notNull(),
  fixtureName:    varchar('fixture_name', { length: 256 }).notNull(),
  revision:       varchar('revision', { length: 128 }),
  modeNames:      text('mode_names').array().notNull().default(sql`'{}'::text[]`),
  gdtfHash:       varchar('gdtf_hash', { length: 64 }).notNull(),
  source:         varchar('source', { length: 64 }).notNull().default('gdtf-share'),
  localPath:      varchar('local_path', { length: 512 }).notNull(),
  fixtureTypeId:  uuid('fixture_type_id').references(() => fixtureTypes.id, { onDelete: 'set null' }),
  dateImported:   timestamp('date_imported', { withTimezone: true }).notNull().defaultNow(),
  lastChecked:    timestamp('last_checked', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byHash: uniqueIndex('gdtf_cache_hash_uidx').on(t.gdtfHash),
}));

export const fixtureInstances = pgTable('fixture_instances', {
  id:              uuid('id').primaryKey().defaultRandom(),
  projectId:       text('project_id'),
  orbitProjectId:  text('orbit_project_id'),
  orbitModelId:    text('orbit_model_id'),
  fixtureTypeId:   uuid('fixture_type_id').notNull().references(() => fixtureTypes.id, { onDelete: 'restrict' }),
  source:          varchar('source', { length: 32 }).notNull().default('MVR'),
  sourceMvrUuid:   varchar('source_mvr_uuid', { length: 256 }),
  instanceData:    jsonb('instance_data').notNull().default(sql`'{}'::jsonb`),
  status:          varchar('status', { length: 32 }).notNull().default('pending'),
  warnings:        text('warnings').array().notNull().default(sql`'{}'::text[]`),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt:       timestamp('deleted_at', { withTimezone: true }),
}, (t) => ({
  byProject: index('fixture_instances_project_idx').on(t.projectId),
  byType:    index('fixture_instances_type_idx').on(t.fixtureTypeId),
}));

// ---------------------------------------------------------------------------
// Webhook endpoints — admin-configured callback targets
// ---------------------------------------------------------------------------

export const webhooks = pgTable('webhooks', {
  id:        uuid('id').primaryKey().defaultRandom(),
  name:      varchar('name', { length: 128 }).notNull(),
  url:       text('url').notNull(),
  secret:    varchar('secret', { length: 64 }),         // HMAC sig secret
  events:    jsonb('events').notNull().default(sql`'["job.complete","job.failed"]'::jsonb`),
  isActive:  boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Exported type helpers
// ---------------------------------------------------------------------------

export type Job        = typeof jobs.$inferSelect;
export type NewJob     = typeof jobs.$inferInsert;
export type JobLog     = typeof jobLogs.$inferSelect;
export type ApiKey     = typeof apiKeys.$inferSelect;
export type Setting    = typeof settings.$inferSelect;
export type LayerPreset= typeof layerPresets.$inferSelect;
export type AdminUser  = typeof adminUsers.$inferSelect;
export type Workstation= typeof workstations.$inferSelect;
export type AgentSession = typeof agentSessions.$inferSelect;
export type Webhook    = typeof webhooks.$inferSelect;
export type VisualiserRun    = typeof visualiserRuns.$inferSelect;
export type NewVisualiserRun = typeof visualiserRuns.$inferInsert;
export type VisualiserRunLog = typeof visualiserRunLogs.$inferSelect;
export type VisualiserShareLink    = typeof visualiserShareLinks.$inferSelect;
export type NewVisualiserShareLink = typeof visualiserShareLinks.$inferInsert;
export type ProjectAttachment    = typeof projectAttachments.$inferSelect;
export type NewProjectAttachment = typeof projectAttachments.$inferInsert;
export type Texture          = typeof textures.$inferSelect;
export type NewTexture       = typeof textures.$inferInsert;
export type Material         = typeof materials.$inferSelect;
export type NewMaterial      = typeof materials.$inferInsert;
export type MaterialTexture    = typeof materialTextures.$inferSelect;
export type NewMaterialTexture = typeof materialTextures.$inferInsert;
export type FixtureType        = typeof fixtureTypes.$inferSelect;
export type NewFixtureType     = typeof fixtureTypes.$inferInsert;
export type FixtureMedia       = typeof fixtureMedia.$inferSelect;
export type NewFixtureMedia      = typeof fixtureMedia.$inferInsert;
export type GdtfCache          = typeof gdtfCache.$inferSelect;
export type NewGdtfCache       = typeof gdtfCache.$inferInsert;
export type FixtureInstanceRow    = typeof fixtureInstances.$inferSelect;
export type NewFixtureInstanceRow = typeof fixtureInstances.$inferInsert;
