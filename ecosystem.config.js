module.exports = {
  apps: [
    {
      name: "api-verifier-web",
      cwd: __dirname,
      script: "npm",
      args: "run dev -- --host 0.0.0.0 --port 6722",
      env: {
        NODE_ENV: "development",
      },
    },
  ],
};
