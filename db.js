const { Client } = require("pg");

// The postgis image restarts Postgres once during first boot, after the healthcheck
// already passes, so every ingest connects with a short retry loop.
async function connect(databaseUrl, attempts = 20, delayMs = 1500) {
  if (!databaseUrl) throw new Error("DATABASE_URL missing");
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      return client;
    } catch (err) {
      lastErr = err;
      console.log(`db connect attempt ${i}/${attempts} failed: ${err.code || err.message}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

// buildings is partitioned by country: each country's ingest makes its own partition, so a
// second country is loaded without touching the first.
async function ensureCountryPartition(client, country) {
  const code = String(country || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) throw new Error("country must be a two-letter code: " + country);
  await client.query(
    `CREATE TABLE IF NOT EXISTS buildings_${code.toLowerCase()} PARTITION OF buildings FOR VALUES IN ('${code}')`,
  );
}

module.exports = { connect, ensureCountryPartition };
