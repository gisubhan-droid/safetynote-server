module.exports = {
  apps: [
    {
      name: 'safetynote',
      script: 'npx',
      args: 'tsx node-server.ts',
      cwd: '/home/user/webapp',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        DB_PATH: '/home/user/webapp/safety.db',
        UPLOAD_PATH: '/home/user/webapp/public/uploads',
        SESSION_SECRET: '3d86d73e-42b8-4b21-88bf-76aaf80b925a',
        APP_VERSION: '1.4'
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}
