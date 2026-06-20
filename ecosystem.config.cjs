// PM2 ecosystem: keep the embedded PostgreSQL and the Express+Vite dev server
// running in the background. Auto-restarts on crash. To survive Windows reboot,
// run once as Administrator:
//
//   pm2 startup
//   pm2 save
//
// Useful commands:
//   pm2 start ecosystem.config.cjs    start both
//   pm2 ls                            see status
//   pm2 logs                          stream logs
//   pm2 logs qc-app --lines 200       last 200 lines of one app
//   pm2 restart qc-app                restart just one
//   pm2 stop all                      stop both
//   pm2 delete all                    remove both from the list
//
// We spawn tsx directly (not via npm) because PM2 on Windows tries to parse
// .CMD shim files as JavaScript otherwise.

const path = require("path");
const tsx = path.join(__dirname, "node_modules", "tsx", "dist", "cli.mjs");

module.exports = {
  apps: [
    {
      name: "qc-db",
      cwd: __dirname,
      script: tsx,
      args: "script/dev-db.ts",
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 20,
      max_memory_restart: "500M",
      out_file: "./.pm2/db.out.log",
      error_file: "./.pm2/db.err.log",
    },
    {
      name: "qc-app",
      cwd: __dirname,
      script: tsx,
      args: "server/index.ts",
      env: {
        NODE_ENV: "development",
      },
      autorestart: true,
      // Give the DB ~6 seconds to be ready on cold boot.
      restart_delay: 6000,
      max_restarts: 30,
      max_memory_restart: "1G",
      out_file: "./.pm2/app.out.log",
      error_file: "./.pm2/app.err.log",
    },
  ],
};
