module.exports = {
  apps: [
    {
      name: 'safety-management',
      script: 'npx',
      args: 'tsx node-server.ts',
      cwd: '/home/user/webapp',
      env: {
        NODE_ENV: 'production',
        PORT: 3443
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      error_file: '/home/user/.pm2/logs/safety-management-error.log',
      out_file: '/home/user/.pm2/logs/safety-management-out.log'
    }
  ]
}
