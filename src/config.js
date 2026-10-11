const isTest = process.env.NODE_ENV === "test";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: isTest ? (process.env.JWT_SECRET ?? "test-secret") : required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "1d",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
};
