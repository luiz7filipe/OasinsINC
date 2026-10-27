import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
  id:text('id').primaryKey(), name:text('name').notNull(), email:text('email').notNull().unique(),
  emailVerified:integer('email_verified',{mode:'boolean'}).notNull().default(false), image:text('image'),
  createdAt:integer('created_at',{mode:'timestamp_ms'}).notNull(), updatedAt:integer('updated_at',{mode:'timestamp_ms'}).notNull(),
  twoFactorEnabled:integer('two_factor_enabled',{mode:'boolean'}).default(false),
});
export const session = sqliteTable('session', {
  id:text('id').primaryKey(), expiresAt:integer('expires_at',{mode:'timestamp_ms'}).notNull(),token:text('token').notNull().unique(),
  createdAt:integer('created_at',{mode:'timestamp_ms'}).notNull(),updatedAt:integer('updated_at',{mode:'timestamp_ms'}).notNull(),
  ipAddress:text('ip_address'),userAgent:text('user_agent'),userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),
},t=>[index('session_user_idx').on(t.userId)]);
export const account = sqliteTable('account', {
  id:text('id').primaryKey(),accountId:text('account_id').notNull(),providerId:text('provider_id').notNull(),
  userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),accessToken:text('access_token'),refreshToken:text('refresh_token'),idToken:text('id_token'),
  accessTokenExpiresAt:integer('access_token_expires_at',{mode:'timestamp_ms'}),refreshTokenExpiresAt:integer('refresh_token_expires_at',{mode:'timestamp_ms'}),scope:text('scope'),password:text('password'),
  createdAt:integer('created_at',{mode:'timestamp_ms'}).notNull(),updatedAt:integer('updated_at',{mode:'timestamp_ms'}).notNull(),
},t=>[index('account_user_idx').on(t.userId),uniqueIndex('account_provider_idx').on(t.providerId,t.accountId)]);
export const verification = sqliteTable('verification',{
  id:text('id').primaryKey(),identifier:text('identifier').notNull(),value:text('value').notNull(),expiresAt:integer('expires_at',{mode:'timestamp_ms'}).notNull(),
  createdAt:integer('created_at',{mode:'timestamp_ms'}).notNull(),updatedAt:integer('updated_at',{mode:'timestamp_ms'}).notNull(),
},t=>[index('verification_identifier_idx').on(t.identifier)]);
export const twoFactor = sqliteTable('two_factor',{
  id:text('id').primaryKey(),secret:text('secret').notNull(),backupCodes:text('backup_codes').notNull(),
  userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),verified:integer('verified',{mode:'boolean'}).default(true),
  failedVerificationCount:integer('failed_verification_count').default(0),lockedUntil:integer('locked_until',{mode:'timestamp_ms'}),
},t=>[index('two_factor_user_idx').on(t.userId),index('two_factor_secret_idx').on(t.secret)]);
export const rateLimit=sqliteTable('rate_limit',{id:text('id').primaryKey(),key:text('key').notNull().unique(),count:integer('count').notNull(),lastRequest:integer('last_request').notNull()});
export const wellness=sqliteTable('wellness',{userId:text('user_id').primaryKey().references(()=>user.id,{onDelete:'cascade'}),cipher:text('cipher').notNull(),revision:integer('revision').notNull().default(1),updatedAt:integer('updated_at').notNull()});
export const reminder=sqliteTable('reminder',{
  id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),cipher:text('cipher').notNull(),
  nextAt:integer('next_at').notNull(),enabled:integer('enabled',{mode:'boolean'}).notNull().default(true),createdAt:integer('created_at').notNull(),
},t=>[index('reminder_due_idx').on(t.enabled,t.nextAt),index('reminder_user_idx').on(t.userId)]);
export const pushSubscription=sqliteTable('push_subscription',{
  id:text('id').primaryKey(),userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),endpointHash:text('endpoint_hash').notNull().unique(),cipher:text('cipher').notNull(),createdAt:integer('created_at').notNull(),
},t=>[index('push_user_idx').on(t.userId)]);
export const delivery=sqliteTable('delivery',{
  id:text('id').primaryKey(),reminderId:text('reminder_id').notNull().references(()=>reminder.id,{onDelete:'cascade'}),subscriptionId:text('subscription_id').notNull().references(()=>pushSubscription.id,{onDelete:'cascade'}),
  dueAt:integer('due_at').notNull(),status:text('status').notNull(),attempts:integer('attempts').notNull().default(0),leaseUntil:integer('lease_until').notNull().default(0),
},t=>[uniqueIndex('delivery_occurrence_idx').on(t.reminderId,t.subscriptionId,t.dueAt)]);
export const mailOutbox=sqliteTable('mail_outbox',{id:text('id').primaryKey(),cipher:text('cipher').notNull(),attempts:integer('attempts').notNull().default(0),nextAt:integer('next_at').notNull(),expiresAt:integer('expires_at').notNull()},t=>[index('mail_due_idx').on(t.nextAt)]);
