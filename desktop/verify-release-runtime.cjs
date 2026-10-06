const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const root = path.join(__dirname, '..', 'desktop-runtime');
function inspect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error(`Unexpected runtime symlink: ${entry.name}`);
    if (/^\.env|^auth\.enc|^career-profile.*\.json$|\.db(?:$|[-.])/i.test(entry.name) &&
        path.join(directory,entry.name) !== path.join(root,'template.db')) {
      throw new Error(`Private file in runtime: ${entry.name}`);
    }
    if (entry.isDirectory()) inspect(path.join(directory,entry.name));
  }
}
(async()=>{
  inspect(root);
  const client = new PrismaClient({datasources:{db:{url:`file:${path.join(root,'template.db')}`}}});
  try {
    for (const model of ['company','selectionStep','interviewNote','scheduleEvent']) {
      if (await client[model].count() !== 0) throw new Error(`Nonempty template database: ${model}`);
    }
  } finally { await client.$disconnect(); }
  console.log('PASS: no environment/auth/profile files; template database is empty');
})().catch(error=>{console.error(error);process.exitCode=1;});
