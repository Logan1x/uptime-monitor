module.exports = {
  apps: [
    {
      name: "uptime-api",
      cwd: __dirname + "/backend",
      script: "src/server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "development",
        APP_ENV: "dev"
      }
    },
    {
      name: "uptime-web",
      cwd: __dirname + "/frontend",
      script: "node_modules/vite/bin/vite.js",
      args: "--host 0.0.0.0 --port 4071",
      env: {
        NODE_ENV: "development",
        APP_ENV: "dev"
      }
    }
  ]
};
