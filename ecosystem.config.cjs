module.exports = {
  apps: [
    {
      name: 'safetynote',
      script: 'npx',
      args: 'tsx node-server.ts',
      cwd: '/volume1/safetynote',
      env: {
        NODE_ENV: 'production',
        PORT: 3443
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      error_file: '/var/log/safetynote-error-0.log',
      out_file: '/var/log/safetynote-out-0.log'
    }
  ]
}
