import { z } from "zod";

const ConfigSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_ORIGIN: z.url(),
  PORT: z.coerce.number().int().positive().default(3000),
  SESSION_COOKIE_NAME: z.string().min(1).default("pvh_session"),
  MAIL_TRANSPORT: z.enum(["console", "smtp"]).default("console"),
  VAPID_PUBLIC_KEY: z.string().default(""),
  VAPID_PRIVATE_KEY: z.string().default(""),
  VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Config = z.infer<typeof ConfigSchema>;

/** Parse configuration from an env-like object. Fails fast with a readable message. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join("\n")}`);
  }
  return result.data;
}
