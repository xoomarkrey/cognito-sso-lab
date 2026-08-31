import "dotenv/config";

async function main() {
  let env;
  try {
    ({ env } = await import("./config/env.js"));
  } catch (error) {
    console.error(
      "\n[config] " +
        (error instanceof Error ? error.message : String(error)) +
        "\n         Copy server/.env.example to server/.env and fill it in.\n",
    );
    process.exit(1);
  }

  const { default: app } = await import("./app.js");

  app.listen(env.port, () => {
    console.log(`Backend running on http://localhost:${env.port}`);
    console.log(`  health:  http://localhost:${env.port}/api/health`);
    console.log(`  login:   http://localhost:${env.port}/auth/login`);
  });
}

void main();
