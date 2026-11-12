/**
 * Drizzle schema — mirrors specs/001-plant-care-tracker/data-model.md.
 * All timestamps are timestamptz (UTC). Local dates use `date` in the household time zone.
 */
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  smallint,
  customType,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { newId } from "./ids.js";

const citext = customType<{ data: string }>({ dataType: () => "citext" });
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });
const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

// ---------------------------------------------------------------- Foundational

export const users = pgTable("users", {
  id: uuid("id").primaryKey().$defaultFn(newId),
  email: citext("email").notNull().unique(),
  displayName: varchar("display_name", { length: 40 }).notNull(),
  createdAt: tstz("created_at").notNull().defaultNow(),
});

export const households = pgTable("households", {
  id: uuid("id").primaryKey().$defaultFn(newId),
  name: varchar("name", { length: 60 }).notNull(),
  timeZone: varchar("time_zone", { length: 64 }).notNull(),
  weekStart: smallint("week_start").notNull().default(1),
  createdAt: tstz("created_at").notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey().$defaultFn(newId),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    joinedAt: tstz("joined_at").notNull().defaultNow(),
    leftAt: tstz("left_at"),
    endedByMembershipId: uuid("ended_by_membership_id"),
  },
  (t) => [
    uniqueIndex("memberships_one_active_per_user")
      .on(t.userId)
      .where(sql`${t.leftAt} IS NULL`),
    index("memberships_household").on(t.householdId),
  ],
);

export const loginTokens = pgTable("login_tokens", {
  id: uuid("id").primaryKey().$defaultFn(newId),
  email: citext("email").notNull(),
  tokenHash: bytea("token_hash").notNull().unique(),
  expiresAt: tstz("expires_at").notNull(),
  usedAt: tstz("used_at"),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().$defaultFn(newId),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: bytea("token_hash").notNull().unique(),
  expiresAt: tstz("expires_at").notNull(),
  createdAt: tstz("created_at").notNull().defaultNow(),
});
